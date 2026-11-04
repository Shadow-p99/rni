# Procédure de déploiement RNI

L'API tourne **directement sur Node.js**, supervisée par **systemd** (pm2 n'est plus utilisé). Le
processus primaire (`node:cluster`) lance `WEB_CONCURRENCY` workers qui partagent le port 8096.

| Élément | Emplacement |
|---|---|
| API (versions) | `/srv/nodejs/rni/releases/<horodatage>`, lien `/srv/nodejs/rni/current` |
| Client (versions) | `/srv/nginx/rni/releases/<horodatage>`, lien `/srv/nginx/rni/current` |
| Service | `/etc/systemd/system/rni-api.service` (modèle : `deploy/rni-api.service`) |
| Secrets / réglages | `/etc/rni/rni-api.env` (modèle : `deploy/rni-api.env.example`), droits `0640 root:rni` |
| Secret Nginx → API | `/etc/nginx/rni-proxy-secret.conf`, droits `0600 root:root` |
| Journaux | `journalctl -u rni-api` (JSON, une ligne par événement, identifiant `X-Request-Id`) |

## Prérequis serveur

- Node.js ≥ 22.12 (`/usr/bin/node`), Nginx, rsync, curl.
- PostgreSQL 16 (extension `btree_gist` : paquet `postgresql-contrib`).
- Certificat d'autorité interne : `/etc/ssl/certs/ca-interne.pem` (appels HTTPS sortants, `PG_SSL_CA`).
- Reverse-proxy SSO en amont injectant les en-têtes `nigend`, `cn`, `title`, `codeunite`, `lib_region`
  et les **écrasant systématiquement** s'ils sont fournis par le navigateur.

## 1. Base de données (première installation)

```bash
psql -h <hôte> -U <admin> -c "CREATE DATABASE rni"
psql -h <hôte> -U <admin> -d rni -f apps/api/db/init/01-schema.sql
psql -h <hôte> -U <admin> -d rni -f apps/api/db/init/02-referentiels.sql
psql -h <hôte> -U <admin> -d rni -f apps/api/db/init/03-param-app.sql
# Adapter puis appliquer le paramétrage de l'environnement (URLs, jetons, permanence GIGN…)
psql -h <hôte> -U <admin> -d rni -f apps/api/db/env/param-app.template.sql
```

Les migrations (`db/migrations`) sont ensuite appliquées **automatiquement par `install.sh`**
(`node dist/migrate.js`, historique dans `t_schema_migrations`, verrou PostgreSQL).

Les tables `ref_unite`, `rpsi_personnel` (et `lien_departement_region` si besoin) sont alimentées par
le flux RH RPSI. **Ne jamais exécuter `db/dev/90-seed-dev.sql` hors développement.**

Compte applicatif : droits `SELECT, INSERT, UPDATE, DELETE` sur les tables, `USAGE` sur les
séquences ; le compte qui exécute les migrations doit pouvoir créer tables, index et déclencheurs.

## 2. Configuration (première installation)

```bash
sudo install -d -m 0750 -o root -g rni /etc/rni
sudo install -m 0640 -o root -g rni deploy/rni-api.env.example /etc/rni/rni-api.env
sudo vi /etc/rni/rni-api.env        # PG_*, PROXY_SHARED_SECRET (openssl rand -hex 32), WEB_CONCURRENCY…
echo 'proxy_set_header X-RNI-Proxy-Secret "<même secret>";' | sudo tee /etc/nginx/rni-proxy-secret.conf
sudo chmod 0600 /etc/nginx/rni-proxy-secret.conf
```

Nginx : bloc `upstream rni_api` dans le contexte `http` et inclusion de `deploy/nginx-rni.conf`
dans le `server` TLS (voir l'en-tête du fichier), puis `nginx -t && systemctl reload nginx`.

L'API refuse de démarrer si la configuration est invalide (code 78, message explicite dans
`journalctl -u rni-api`) : secrets manquants, valeurs hors bornes, `RNI_MOCK_AUTH` en production…

Dimensionnement : `PG_POOL_MAX × WEB_CONCURRENCY × nombre de serveurs` doit rester sous
`max_connections` de PostgreSQL (prévoir + 1 connexion par worker pour l'écoute du cache).

## 3. Construction des artefacts (CI)

```bash
pnpm install --frozen-lockfile
pnpm release          # → release/api (API autonome + node_modules de prod) et release/web (client)
```

## 4. Installation / mise à jour

```bash
rsync -a release/ deploy/ user@serveur:/tmp/rni-release/
ssh user@serveur 'sudo /tmp/rni-release/install.sh /tmp/rni-release'
```

Le script :
1. copie la version dans `releases/<horodatage>` (aucune modification de la version en service) ;
2. applique les migrations ;
3. installe / met à jour le service systemd (et retire pm2 s'il pilotait encore `rni-api`) ;
4. bascule le lien `current` puis `systemctl reload rni-api` : **redémarrage progressif sans
   interruption** (les nouveaux workers démarrent depuis la nouvelle version avant l'arrêt des
   anciens) — ou `start` à la première installation ;
5. attend `/rni/api/health/ready` ; en cas d'échec, **revient automatiquement** à la version
   précédente ;
6. bascule le client, puis ne conserve que les 5 dernières versions.

## 5. Vérifications

- `curl -fsS http://127.0.0.1:8096/rni/api/health/ready` → `{"status":"ready"}`.
- `https://<hôte>/rni/testvie` : API, base, Facade, GEOLOC, REMOP au vert.
- `systemctl status rni-api` ; `journalctl -u rni-api -f`.
- Super administrateur : `GET /rni/api/admin/cache` (`notify.connected: true`).

## Exploitation courante

| Action | Commande |
|---|---|
| Redémarrage sans interruption | `systemctl reload rni-api` |
| Redémarrage complet (changement de `/etc/rni/rni-api.env`) | `systemctl restart rni-api` |
| Arrêt gracieux (25 s max) | `systemctl stop rni-api` |
| État des migrations | `cd /srv/nodejs/rni/current && sudo -u rni env $(cat /etc/rni/rni-api.env \| xargs) node dist/migrate.js --status` |
| Vider le cache de tous les workers | `DELETE /rni/api/admin/cache` (super administrateur) |
| Changer le niveau de journalisation (à chaud) | `UPDATE t_param_app SET valeur = 'debug' WHERE cle_param_app = 'rni.log.level';` (cf. README « Journalisation ») |

Sondes : `/rni/api/health/live` (processus vivant) et `/rni/api/health/ready` (base joignable,
503 pendant un arrêt) — accessibles sans secret de proxy, pour le load-balancer.

## Retour arrière

```bash
sudo /srv/nodejs/rni/bin/rollback.sh                      # version précédente
sudo /srv/nodejs/rni/bin/rollback.sh 20260101-101500      # version donnée
```

(`deploy/rollback.sh`, installé dans `/srv/nodejs/rni/bin` : bascule des liens API et client puis `systemctl reload`.) Les migrations
sont additives et idempotentes : le schéma n'est pas rétrogradé.

## Plusieurs serveurs

Plusieurs instances derrière un load-balancer partagent la même base : le cache de chaque processus
est invalidé par les notifications PostgreSQL (`rni_cache`), les migrations sont protégées par un
verrou consultatif. Le load-balancer doit utiliser `/rni/api/health/ready`.
