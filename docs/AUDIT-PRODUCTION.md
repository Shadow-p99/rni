# Audit de mise en production — RNI

Branche : `claude/prod-ready-audit`. Objet : rendre l'application exploitable en production
(exécution sur Node.js sans pm2, fonctionnement de l'API en cluster, sécurité, exploitation).

## 1. Constats de l'audit

| # | Domaine | Constat | Gravité |
|---|---|---|---|
| 1 | Exécution | API pilotée par pm2 (`ecosystem.config.cjs`, `exec_mode: fork`, 1 instance) : une dépendance d'exploitation en plus, pas de mode cluster | Majeure |
| 2 | Cluster | Cache en mémoire **non partagé** : avec plusieurs workers ou serveurs, une écriture n'invalidait que le processus qui l'avait faite → données périmées jusqu'à 5 min | Bloquante pour le cluster |
| 3 | Cluster | Écritures hors API (import RPSI, SQL) jamais propagées au cache avant expiration | Majeure |
| 4 | Arrêt | Pas d'arrêt gracieux coordonné : requêtes coupées au redémarrage, pas d'état « non prêt » pour le load-balancer | Majeure |
| 5 | Déploiement | `install.sh` écrasait la version en service (`rsync --delete`) ; le retour arrière ne restaurait pas `node_modules` ; pas de retour arrière automatique | Majeure |
| 6 | Base | Migrations appliquées à la main (`psql` en boucle), sans historique ni verrou → risque d'oubli ou d'exécution concurrente | Majeure |
| 7 | Sécurité | `trust proxy: true` : n'importe quel client pouvait falsifier `X-Forwarded-For` (adresse IP du journal d'audit Splunk) | Majeure |
| 8 | Sécurité | L'API faisait confiance aux en-têtes d'identité (`nigend`…) quelle que soit l'origine de la requête : une API joignable hors du reverse-proxy SSO permettait d'usurper n'importe quel compte | Critique (selon le réseau) |
| 9 | Sécurité | Aucun en-tête de sécurité sur l'API ; pas de CSP sur le client | Moyenne |
| 10 | Sécurité | `/service/testvie` public et non mutualisé : chaque appel déclenchait des requêtes vers Facade, GEOLOC et REMOP (amplification) | Moyenne |
| 11 | Sécurité | `/service` publiait la version exacte de PostgreSQL | Faible |
| 12 | Sécurité | Dépendance vulnérable : `uuid < 11.1.1` (via `sequelize`, GHSA-w5hq-g745-h8pq) | Moyenne |
| 13 | Configuration | Valeurs par défaut de développement en production (`PG_USER=rni`, `PG_PASSWORD=rni`), CORS par défaut sur `localhost:4200`, nombres non validés (`APP_PORT=abc` accepté) | Majeure |
| 14 | Base | Pool figé à 10 connexions, pas de `statement_timeout` (une requête bloquée monopolise une connexion), TLS sans CA paramétrable | Moyenne |
| 15 | Observabilité | Journaux texte colorés, pas d'identifiant de corrélation, pas de sondes `live` / `ready` | Moyenne |
| 16 | Robustesse | Exceptions et promesses non gérées sans traitement explicite ; pas de délais `keepAlive` / `headersTimeout` alignés sur Nginx (502 sporadiques) | Moyenne |
| 17 | Docker | Sonde sur `/service/alive`, pas de mode cluster, migrations par image `postgres` + `psql` | Faible |

## 2. Modifications

### 2.1 Exécution sans pm2, cluster natif (`node:cluster`)

- **`apps/api/src/main.ts`** : point d'entrée unique `node dist/main.js`. En développement, un
  processus. En production (même avec 1 worker) ou avec `WEB_CONCURRENCY=N|auto`, un primaire plus N workers.
- **`apps/api/src/runtime/primary.ts`** (nouveau) : le primaire du cluster.
  - Il lance les workers sur un port partagé et relance un worker planté, avec un délai croissant.
  - Au-delà de 5 plantages par minute, il s'arrête et laisse systemd décider.
  - `SIGTERM` / `SIGINT` : arrêt gracieux de tous les workers, forcé après le délai.
  - `SIGHUP` : **redémarrage progressif sans interruption** (le remplaçant écoute avant l'arrêt de
    l'ancien). La nouvelle version est relue dans `APP_ROOT` : un déploiement par lien symbolique
    est donc pris en compte sans redémarrage complet.
- **`apps/api/src/runtime/server.ts`** (nouveau) : démarrage HTTP et arrêt gracieux.
  - Arrêt : `/health/ready` passe à 503, délai de retrait, fermeture des connexions inactives, fin
    des requêtes en cours, puis fermeture du pool et de l'écoute du cache.
  - Délais `keepAliveTimeout` 65 s, `headersTimeout` 66 s, `requestTimeout` 120 s.
  - Corps JSON limité à 1 Mo. CORS activé seulement si des origines sont configurées.
  - `configureApp` est partagé avec les tests e2e : les tests utilisent la configuration réelle.
- Pendant un arrêt, les réponses portent `Connection: close` : aucune requête n'est perdue sur une
  connexion réutilisée. Mesuré : 0 échec sur 6 500 requêtes pendant un redémarrage progressif,
  contre 2 sans cet en-tête.
- Une exception ou une promesse non gérée est journalisée, puis le worker s'arrête et le primaire le relance.
- **`deploy/ecosystem.config.cjs` supprimé**, remplacé par **`deploy/rni-api.service`** (systemd) :
  - `ExecReload` en `SIGHUP`, `KillMode=mixed`, `TimeoutStopSec=40` ;
  - pas de relance en boucle sur une configuration invalide (code 78) ;
  - durcissement : `NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`, aucune capacité ;
  - écoute sur `127.0.0.1`.

### 2.2 Cache compatible cluster et multi-instances

- **Migration `2.4.0-cache-notify.sql`** : des déclencheurs PostgreSQL « par instruction » sur les
  14 tables mises en cache émettent `pg_notify('rni_cache', …)` **à la validation** de chaque
  écriture, y compris hors API.
- **`common/cache/cache-notify.service.ts`** (nouveau) : une connexion dédiée par processus écoute
  le canal (`LISTEN rni_cache`) et invalide le cache local.
  - En cas de coupure : reconnexion avec attente croissante (1 à 30 s), puis cache vidé par précaution.
  - `DELETE /admin/cache` vide désormais le cache **de tous les processus** (diffusion `pg_notify`).
  - `GET /admin/cache` affiche l'état de l'écoute (`notify.connected`, `received`) et le pid du worker.
- Aucune infrastructure supplémentaire (pas de Redis).

### 2.3 Migrations versionnées

- **`database/migrator.ts`** et **`migrate.ts`** (nouveaux) : `node dist/migrate.js` (applique) et `--status`.
  - Fichiers appliqués dans l'ordre des versions (2.9.0 avant 2.10.0), chacun dans sa transaction.
  - **Verrou consultatif** PostgreSQL : plusieurs instances qui démarrent ensemble ne les exécutent qu'une fois.
  - Historique et empreinte SHA-256 dans `t_schema_migrations` ; un fichier modifié après application est signalé.
- `MIGRATE_ON_START=true` : le primaire migre avant de lancer les workers.
- Scripts : `pnpm db:migrate`, `pnpm db:migrate:status`, `pnpm --filter @rni/api migrate`.
- Les tests e2e préparent leur base comme une installation réelle : schéma initial, puis migrations, puis données fictives.

### 2.4 Configuration validée (`config/configuration.ts`)

- Toutes les variables sont contrôlées au démarrage (entiers bornés, booléens stricts, formats), et
  toutes les erreurs sont listées en une fois. Le processus sort avec le code 78.
- **Hors développement** :
  - `PG_HOST`, `PG_USER`, `PG_PASSWORD` et `PG_DATABASE` sont obligatoires (plus de `rni` / `rni` par défaut) ;
  - aucune origine CORS par défaut, `CORS_ORIGINS=*` refusé ;
  - `RNI_MOCK_AUTH` refusé, logs JSON.
- Nouvelles variables : `APP_HOST`, `WEB_CONCURRENCY`, `SHUTDOWN_TIMEOUT_MS`, `SHUTDOWN_DELAY_MS`,
  `MIGRATE_ON_START`, `APP_ROOT`, `PROXY_SHARED_SECRET`, `TRUST_PROXY`, `PG_SSL_CA`, `PG_POOL_MAX`,
  `PG_STATEMENT_TIMEOUT_MS`, `CACHE_NOTIFY`, `LOG_FORMAT`, `LOG_LEVEL`. La liste complète est dans le README.

### 2.5 Sécurité

- **`common/http/request-context.middleware.ts`** (nouveau), premier maillon de chaque requête :
  - `X-Request-Id` : celui de Nginx, sinon généré ; renvoyé au client et repris dans les erreurs.
  - En-têtes `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Cross-Origin-Resource-Policy`.
  - `Cache-Control: no-store` par défaut (données personnelles). Les réponses mises en cache gardent `private, no-cache` et leur ETag.
  - **Secret partagé avec le reverse-proxy** (`PROXY_SHARED_SECRET`, en-tête `X-RNI-Proxy-Secret`
    ajouté par Nginx, comparaison en temps constant). Sans lui, la requête est refusée, sauf les
    sondes. Les en-têtes d'identité ne peuvent donc plus venir que du proxy SSO. En production, un
    avertissement est émis si l'API écoute ailleurs qu'en local sans secret.
- `trust proxy` : `loopback` par défaut, réglable par `TRUST_PROXY`. Le journal d'audit n'est plus falsifiable.
- `/service/testvie` : résultat mutualisé pendant 10 s. `/service` : version de PostgreSQL masquée en production.
- **Client** : CSP stricte servie par Nginx (`script-src 'self'`, `object-src 'none'`,
  `frame-ancestors 'self'`…) et `Permissions-Policy`.
  - Le build Angular n'injecte plus de script inline : critical CSS en ligne désactivé, pas de SRI
    (son `importmap` inline est incompatible avec la CSP).
  - Vérifié dans le navigateur : aucune violation sur la carte, le planning, la gestion du
    personnel, l'administration et le test de vie.
- `uuid` forcé en `^11.1.1` (`pnpm.overrides`) : `pnpm audit --prod` → aucune vulnérabilité.
- La CI bloque désormais sur une vulnérabilité élevée ou critique (`pnpm audit --prod --audit-level high`).

### 2.6 Base de données

- Pool `PG_POOL_MAX`, `statement_timeout` (30 s par défaut), `application_name` (`rni-api`, `rni-api-cache`), TCP keep-alive.
- TLS avec vérification du certificat et CA paramétrable (`PG_SSL_CA`).
- Dix tentatives de connexion au démarrage, espacées de 3 s.

### 2.7 Observabilité

- Journaux JSON sur la sortie standard (logger natif de Nest), une ligne par événement, avec pid. Niveau par `LOG_LEVEL`.
- **`modules/health`** (nouveau), publiques et non journalisées :
  - `GET /health/live` : le processus répond ;
  - `GET /health/ready` : base joignable en moins de 2 s et pas d'arrêt en cours, sinon 503.

### 2.8 Déploiement

- **`deploy/install.sh`** réécrit :
  1. version copiée dans `releases/<horodatage>` ;
  2. migrations ;
  3. installation du service systemd, et retrait de pm2 s'il pilotait encore l'API ;
  4. **bascule atomique** du lien `current` et `systemctl reload` (sans interruption) ;
  5. attente de `/health/ready`, avec **retour automatique** à la version précédente en cas d'échec ;
  6. bascule du client, puis conservation des 5 dernières versions.
- **`deploy/rollback.sh`** (nouveau, installé dans `/srv/nodejs/rni/bin`) : retour à la version
  précédente ou à une version donnée.
- **`deploy/rni-api.env.example`** (nouveau) : modèle de `/etc/rni/rni-api.env`.
- **`deploy/nginx-rni.conf`** :
  - `upstream` en keep-alive ;
  - `X-Request-Id` et secret de proxy transmis ;
  - nouvelle tentative sur erreur pendant un redémarrage (`proxy_next_upstream`) ;
  - CSP et cache `immutable` des fichiers versionnés ;
  - client servi depuis `current/`.
- **`deploy/PROCEDURE-DEPLOIEMENT.md`** réécrit : installation, configuration, dimensionnement du
  pool, exploitation courante, retour arrière, déploiement sur plusieurs serveurs.

### 2.9 Docker et CI

- Image API : primaire + `WEB_CONCURRENCY` worker(s), logs JSON, sonde `/health/ready`, `STOPSIGNAL SIGTERM`.
- Image client : CSP (`CSP_EXTRA_SRC` pour Matomo), secret de proxy, `X-Request-Id`, keep-alive.
- `docker-compose` :
  - l'API tourne avec 2 workers, migrations au démarrage et secret de proxy ;
  - le service `migrate` utilise l'image de l'API (`node dist/migrate.js`).
- GitHub Actions : audit des dépendances, et un job qui construit les deux images.
- GitLab CI : audit des dépendances.

## 3. Vérifications réalisées

| Vérification | Résultat |
|---|---|
| Tests unitaires (shared 30, API 32 dont nouveaux : configuration, middleware, cache) et client (66) | ✔ |
| Tests e2e API (57, dont nouveaux : sondes, en-têtes, corrélation, test de vie mutualisé, propagation d'une écriture SQL hors API, écoute PostgreSQL) | ✔ |
| Cluster 4 workers : écriture via un worker, relue par tous | ✔ 16/16 lectures à jour |
| Redémarrage progressif (`SIGHUP`) sous charge continue | ✔ 0 échec / 6 500 requêtes, 4 workers remplacés |
| `kill -9` d'un worker | ✔ relancé, 4 workers servent à parts égales |
| `SIGTERM` | ✔ `/health/ready` → 503 `draining`, arrêt propre de chaque worker, sortie du primaire |
| Release autonome (`pnpm deploy`) en `NODE_ENV=production`, bascule du lien v1 → v2 + `SIGHUP` | ✔ v2 servie sans redémarrage complet |
| Production : configuration incomplète | ✔ refus au démarrage, code 78, liste des variables manquantes |
| Secret de proxy : absent / faux / correct ; sondes sans secret | ✔ 401 / 401 / 200 ; sondes 200 |
| Docker : 2 workers, migrations au démarrage, client derrière Nginx, CSP | ✔ aucune violation CSP, `X-Request-Id` unique, API directe refusée sans secret |
| Docker : écriture SQL directe (`UPDATE ref_user`) | ✔ visible en < 300 ms par tous les workers |
| Migrations : application, rejeu sans effet, `--status` | ✔ |
| `pnpm audit --prod` | ✔ aucune vulnérabilité |

## 4. Actions à prévoir côté exploitation (première mise en production de cette version)

1. Créer `/etc/rni/rni-api.env` à partir de `deploy/rni-api.env.example` : secrets PostgreSQL et `PROXY_SHARED_SECRET` (`openssl rand -hex 32`).
2. Créer `/etc/nginx/rni-proxy-secret.conf` avec le même secret, ajouter le bloc `upstream rni_api`,
   puis recharger Nginx. La racine du client devient `/srv/nginx/rni/current`.
3. Vérifier que le compte qui exécute les migrations peut créer des déclencheurs (migration 2.4.0).
4. Dimensionner `PG_POOL_MAX × WEB_CONCURRENCY × serveurs` (+ 1 connexion d'écoute par worker) sous `max_connections`.
5. Lancer `install.sh` comme d'habitude : il retire pm2, installe systemd et migre.

## 5. Recommandations non traitées (hors périmètre ou à arbitrer)

- **Limitation de débit** (`/service/coordinates`, `/service/isochrone`) : application intranet
  derrière le SSO ; à placer de préférence dans Nginx (`limit_req`) si un usage abusif est constaté.
- **Métriques** (Prometheus / OpenTelemetry : latences, taux d'erreur, taux de succès du cache,
  pool) : à brancher selon l'outillage de supervision disponible.
- **CSP `img-src https:`** : large, pour accepter les fonds de la Facade et d'OSM. À restreindre aux
  origines réelles une fois connues.
- **TLS / HSTS** : à porter par le frontal TLS (Nginx du site ou reverse-proxy SSO).
- **Sauvegardes PostgreSQL** et plan de reprise : hors application, à formaliser avec l'exploitation.
- **Test de charge** sur la volumétrie réelle (nombre d'agents, de cartes ouvertes simultanément) pour fixer `WEB_CONCURRENCY` et `PG_POOL_MAX`.
- **Cahier des charges** (`docs/cahier-des-charges-RNI.md`) : il mentionne encore pm2. Je ne l'ai
  pas modifié (document de référence fourni) ; à mettre à jour par son auteur.

## 6. Complément : journalisation

- `Logger` NestJS dans tous les services, gardes, middlewares et clients externes, avec une
  répartition des niveaux décrite dans le README (« Journalisation »).
- Journal d'accès HTTP : une ligne par requête (méthode, chemin, statut, durée, taille, nigend,
  `X-Request-Id`) ; requêtes lentes signalées.
- Journal SQL activable à chaud, et requêtes lentes toujours signalées.
- **Niveau piloté par la base** (`rni.log.level`, `rni.log.contexts`, `rni.log.sql`,
  `rni.log.slow_ms`, migration 2.5.0), appliqué à chaud par tous les processus.
- Correctif de confidentialité : la trace d'audit d'une modification de compte écrivait les
  valeurs du téléphone personnel et du commentaire. Elle n'écrit plus que le nom des champs.

## 7. Complément : accès aux données par les modèles Sequelize

- Environ 65 requêtes SQL natives réécrites avec les modèles. 18 modèles ajoutés (référentiels,
  périmètres, supervision, deux vues, historique des migrations) et des associations.
- Migration 2.8.0 : colonne `recherche` des vues, qui conserve l'usage des index trigrammes.
- Exceptions limitées à 3 fichiers justifiés (verrous consultatifs et catalogue, migrations,
  LISTEN / NOTIFY). Le garde-fou `check:sql` bloque toute régression.
- Mesures sans cache (5 100 personnels, 121 000 plannings) : écart de 0 à +12 % par rapport au
  SQL natif, après passage des grosses lectures en `raw: true`. Avec le cache (production), les
  temps sont inchangés.

## 8. Complément : audit Splunk (BR-SEC-1)

- L'intercepteur est remplacé par un **middleware**, premier maillon de la chaîne : les requêtes
  refusées (401, 403, hors reverse-proxy, 404) sont désormais tracées. L'intercepteur, qui
  s'exécutait après la garde d'authentification, les manquait.
- L'adresse IP est lue à travers les proxys de confiance (`TRUST_PROXY`). Avant, la première valeur
  de `X-Forwarded-For` était prise sans contrôle et pouvait être falsifiée.
- Écriture par lots (2 s) avec le modèle `AdminLogSplunk`. En cas de panne de la base, les lignes
  restent en mémoire puis sont réécrites.
- Migration 2.9.0 : colonnes `authentifie`, `duree_ms`, `taille_reponse`, `request_id`,
  `user_agent`, `hote`, `pid` ; vue `v_log_splunk_export` pour le job Talend ; purge selon
  `rni.splunk.retention_days`.
- Guide d'extraction : `docs/SPLUNK-TALEND.md`.
