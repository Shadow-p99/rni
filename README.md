# RNI — Répertoire National des Négociateurs

Application de gestion du dispositif national des négociateurs de la Gendarmerie nationale :
**carte opérationnelle** (positions, crise, isochrones), **planning national**, **fiches de crise**
et **gestion du personnel**. Spécification : [`docs/cahier-des-charges-RNI.md`](docs/cahier-des-charges-RNI.md).

Monorepo **pnpm** :

| Paquet | Contenu | Pile |
|---|---|---|
| [`apps/api`](apps/api) | API REST `/rni/api` | NestJS 12 (ESM), Sequelize 6 (`sequelize-typescript`), PostgreSQL 16 |
| [`apps/web`](apps/web) | Client web + déclinaison mobile | Angular 22 (standalone, signals, zoneless), **Leaflet** 1.9 + markercluster, Tailwind CSS 4 |
| [`packages/shared`](packages/shared) | Règles métier et contrats partagés | TypeScript pur (créneaux, insertion, profils, validations, catalogue de la fiche, DTO, codes d'erreur) |

Les règles métier sensibles (bornes de plage, M‑1, insertion, positions réservées, validations) sont
écrites **une seule fois** dans `@rni/shared` et appliquées à la fois par le client et par l'API
(double contrôle BR-AUTH-3).

---

## Démarrage rapide (développement)

Prérequis : Node.js ≥ 22, pnpm 10 (`corepack enable`), Docker (ou un PostgreSQL 16 local).

```bash
pnpm install
pnpm db:up                       # PostgreSQL + schéma + référentiels + jeu de données fictif
cp apps/api/.env.example apps/api/.env
pnpm dev                         # shared (watch) + API :8096 + client :4200
```

Ouvrir <http://localhost:4200>. En développement :

- **SSO simulé** (`RNI_MOCK_AUTH=true`) : l'API injecte les en-têtes `nigend`/`cn`/`title`. Le sélecteur
  « ⚙ Profil simulé » (en bas à gauche) permet de changer d'identité pour tester chaque profil
  (GIGN, référent, référent adjoint, négociateur, OMS, lecture seule, fiche de crise, non habilité).
- **Services externes simulés** (`RNI_MOCK_EXTERNAL=true`) : REMOP (lignes NEO issues du RPSI),
  GEOLOC (positions dérivées des unités), Facade (fonds OSM / IGN, géocodeur sur les unités et
  principales communes, isochrones approchées).

Comptes fictifs utiles :

| Nigend | Profil | Région |
|---|---|---|
| `100001` | GIGN (défaut) | national |
| `100005` | Super administrateur (écran Administration) | national |
| `100002` | Lecture seule | carte : national ; planning : Île-de-France |
| `100003` | OMS | Auvergne-Rhône-Alpes |
| `100004` | Fiche de crise (profil 5) | PACA |
| `200073` | Référent | Île-de-France |
| `200086` | Négociateur | Île-de-France |
| `200091` | Référent | Martinique |

Sans Docker : créer une base `rni` (utilisateur `rni`/`rni`) puis exécuter dans l'ordre
`apps/api/db/init/*.sql` et `apps/api/db/dev/90-seed-dev.sql`.

## Scripts

| Commande | Rôle |
|---|---|
| `pnpm dev` | Développement (shared en watch, API `nest --watch`, `ng serve` avec proxy `/rni/api`) |
| `pnpm build` | Build de production des trois paquets |
| `pnpm test` | Tests unitaires (shared, API, client) ; côté client, vérifie d'abord qu'aucune sortie de composant ne porte le nom d'un événement DOM natif (`change`, `search`, `select`…) |
| `pnpm test:e2e` | Tests d'intégration API contre PostgreSQL (crée la base `rni_e2e`) |
| `pnpm typecheck` | Vérification de types |
| `pnpm release` | Artefacts de livraison : `release/api` (API autonome + `node_modules` de prod) et `release/web` |
| `pnpm db:up` / `db:reset` / `db:down` | Base de développement Docker |
| `pnpm db:migrate` / `db:migrate:status` | Applique les migrations versionnées (`apps/api/db/migrations`, historique `t_schema_migrations`) / affiche leur état |

---

## Architecture

```
navigateur ──► reverse-proxy SSO (en-têtes nigend, cn, title…) ──► Nginx
                                                                    ├── /rni/       → client Angular (statique)
                                                                    └── /rni/api/   → systemd « rni-api » : primaire node:cluster + N workers (NestJS :8096)
                                                                                         ├── PostgreSQL (rni)
                                                                                         ├── REMOP  (lignes NEO)
                                                                                         ├── GEOLOC (positions NEO)
                                                                                         └── Facade SIG (fonds, géocodeur, isochrones)
```

### API (`apps/api/src`)

| Dossier | Contenu |
|---|---|
| `common/auth` | `AuthGuard` global (BR-AUTH-1/2 : 401 sans `nigend` ou nigend non habilité ; matrice déclarative `@Profiles`), `PerimetreService` (BR-AUTH-6 : périmètre par profil et par module, paramétré dans `t_perimetre_profil`), simulation SSO de dev |
| `common` | Filtre d'erreurs (BR-SEC-2 : `t_admin_logs` + libellé `t_admin_messages`, repli si la base tombe), intercepteur d'audit Splunk (BR-SEC-1 : `t_admin_log_splunk`) |
| `database` | Modèles Sequelize, accès SQL **paramétré** (`Db`) |
| `modules/planning` | Calendrier mensuel, GeoJSON de la carte, création / modification / suppression / **insertion transactionnelle** |
| `modules/region` | Régions visibles, compteurs au créneau courant, compteurs mobiles par jour |
| `modules/users` | `isUser`, `isAdmin`, `me`, gestion du personnel depuis le RPSI, appareil NEO et géolocalisation |
| `modules/formulaire` | Fiches de crise (liste filtrée côté API, clôture, suppression par l'auteur) |
| `modules/service` | Santé, configuration publique, test de vie, fonds de carte, géocodeur, isochrones, lignes NEO |
| `modules/external` | Clients REMOP / GEOLOC / Facade (HTTP réels) et leurs simulations ; paramétrage `t_param_app` |

Principaux points d'entrée (préfixe `/rni/api`) :

```
GET  /users/isUser  /users/isAdmin  /users/me  /users?region=  /users/search?q=  /users/rpsi?q=
POST /users          PUT /users/:id   DELETE /users/:id   PUT /users/infoDeviceUser   PUT /users/activateLocation
GET  /planning/timetable?month=AAAA-MM&region=&q=&positions=1,4,0   /planning/geojson   /planning/:id
GET  /planning/byDateAndIdRegion/:date  /planning/byNigendAndDate/:nigend/:date  /planning/byPositionAndDate/:id/:date
POST /planning (ecraser: true = remplace les plages chevauchées)   GET /planning/overlaps   POST /planning/clear (suppression d'une période, parties hors période conservées)   PUT /planning/:id   DELETE /planning/:id   POST /planning/insert
GET  /region?module=carte|planning  /region/all  /region/getNbPositionServiceByRegion  /region/getNbPositionServiceAllRegionMobile?from=&to=
GET  /formulaire?region=&closed=&from=&to=   /formulaire/:id   POST /formulaire   PUT /formulaire/:id   PUT /formulaire/:id/close   DELETE /formulaire/:id
GET  /admin/perimetres   PUT /admin/perimetres   (super administrateur)
GET  /referentiel/positions?actif=true  /referentiel/creneaux  /referentiel/profils  /referentiel/grades  /referentiel/departements
GET  /service  /service/alive  /service/configuration?idConfig=  /service/testvie  /service/carto
GET  /service/geoloc  /service/coordinates?address=  /service/isochrone?x=&y=  /service/listTelUser/:nigend
```

Erreurs : `{ code: "RNI-xxxx", message, type, details? }` — HTTP 400 pour une erreur métier, 401 non
authentifié, 403 non autorisé / hors périmètre, 404 introuvable.

### Base de données (`apps/api/db`)

- `init/01-schema.sql` : tables, vues `v_personnel_to_ref_user` et `v_user_detail`.
- `init/02-referentiels.sql` : profils, positions (couleurs), créneaux, grades, régions INSEE et
  voisinages, périmètres initiaux par profil et par module, centres régionaux, 101 départements avec leur fuseau, catalogue des messages.
- `init/03-param-app.sql` : paramétrage de développement ; `env/param-app.template.sql` pour la prod.
- `migrations/*.sql` : évolutions **versionnées** (`<version>-<libellé>.sql`), appliquées dans l'ordre par
  `node dist/migrate.js` (chacune dans sa transaction, sous verrou consultatif, historique
  `t_schema_migrations`) ; scripts idempotents. Lancées par `deploy/install.sh` ou `MIGRATE_ON_START=true`.
- `dev/90-seed-dev.sql` : **jeu de données fictif** (unités, ~110 personnels RPSI, comptes, plannings
  du mois précédent au mois suivant, fiches d'exemple).

**Planning figé (jours glissants)** : `t_param_app.rni.planning.jours_glissants` (défaut `30`)
fixe le nombre de jours passés encore modifiables. Les dates antérieures à « aujourd'hui − N
jours » ne peuvent plus être créées, modifiées ni supprimées (API : RNI-1007) ; dans la grille,
elles sont hachurées et ouvrent la plage en consultation. Une plage commencée avant la borne ne
peut être modifiée que créneau par créneau à partir de la borne (« Ce créneau », « Supprimer la
sélection »). Valeur vide : règle historique (premier jour du mois précédent). Changement pris en
compte sans redémarrage (cache de 60 s côté API, rechargement de page côté client) :

```sql
UPDATE t_param_app SET valeur = '15' WHERE cle_param_app = 'rni.planning.jours_glissants';
```

Le planning repose sur un **index de créneau** (`jours depuis 1970 × 2 + créneau − 1`) calculé en
colonnes générées `slot_debut` / `slot_fin`. Une **contrainte d'exclusion** PostgreSQL
(`btree_gist`) garantit en base l'absence de chevauchement (BR-PLA-5).

### Client (`apps/web/src/app`)

```
core/            services techniques, sans interface
  api/           un service HTTP par domaine (users, planning, formulaire, geo, service) + options (silent, timeout)
  auth/          AuthService (identité SSO, droits d'affichage), gardes et résolveur de référentiels
  errors/        AppError, intercepteur HTTP, ErrorHandler global, ErrorReporter (notifications)
  state/         AsyncState (chargement / erreur / réessai) et ActionState (enregistrements)
  referentiel/   positions & couleurs, créneaux, profils, régions (cache)
  config/        paramètres front de t_param_app, Matomo
  export/        exports PDF / PNG avec gestion d'échec
  map/           Leaflet + markercluster, URL de tuiles WMTS / XYZ
  platform/      garde « modifications non enregistrées »
shared/ui/       composants réutilisables (présentation uniquement)
features/<écran>/
  <écran>-page.ts      orchestration (aucun appel HTTP direct)
  <écran>.store.ts     état et actions de l'écran (service fourni au niveau de la page)
  components/          composants de présentation (entrées / sorties)
layout/          en-tête, compte personnel, sélecteur de profil simulé (dev)
```

**Composants réutilisables** (`shared/ui`) : `Modal` (pile, Échap sur la plus récente, verrouillage
pendant l'enregistrement), `ConfirmService`, `Toasts` (avec action), `AsyncView` (chargement / erreur +
« Réessayer » / vide), `ErrorPanel`, `Typeahead` générique (clavier, annulation des requêtes obsolètes,
états vide / indisponible), `AddressAutocomplete`, `Paginator`, `SearchInput` (différée),
`SortHeader`, `RegionSelect`, `PositionFilter`, `PositionLegend`, `PositionBadge`, `MonthNav`,
`Segmented`, `Tabs`, `Toggle`, `Field`, `DefinitionList`, `PageHeader`, `Spinner`.

**Stores par écran** : `GestionStore` (pagination serveur, état dans l'URL), `PlanningDesktopStore`,
`PlanningMobileStore`, `FormulaireEditorStore` (validation, enregistrement, clôture, suppression),
`CarteStore` (points, filtres, fiche, fonds, crise, isochrones, actualisation périodique).

#### Gestion des erreurs

| Situation | Comportement |
|---|---|
| Erreur métier (400, `RNI-xxxx`) | Libellé + détail + code ; **dans le dialogue / formulaire** concerné, sinon en notification |
| Session SSO expirée / non habilité (401) | Redirection vers `/unauthorized` |
| Action non autorisée / hors périmètre (403) | Message ; fiche hors périmètre : écran dédié avec retour |
| API ou base injoignable au démarrage | Page `/indisponible` avec « Réessayer » (et non « accès refusé ») |
| Serveur injoignable / 502-504 en lecture | 1 nouvel essai automatique, puis zone en erreur avec « Réessayer » |
| Délai dépassé | 30 s (60 s isochrones, 45 s test de vie) puis erreur « délai dépassé » |
| Écriture en échec | Jamais réessayée automatiquement ; le dialogue reste ouvert avec l'erreur, la saisie est conservée |
| Actualisation de la carte en échec | Les points restent affichés ; bandeau « Serveur injoignable » + « Réessayer » |
| Fond de carte indisponible | Repli automatique sur OpenStreetMap avec avertissement |
| Services secondaires (compteurs, configuration, fonds) | N'empêchent pas l'affichage de l'écran |
| Nouvelle version déployée (module introuvable) | Notification persistante « Recharger » |
| Exception JavaScript / promesse rejetée non prévue | `ErrorHandler` global : notification, journal console, l'application continue |
| Quitter une fiche modifiée | Confirmation (garde `canDeactivate`) |
| Export PDF / PNG impossible | Notification explicite |
| Route inconnue | Page 404 |

| Route | Écran | Accès |
|---|---|---|
| `/carte` | Carte Leaflet : fonds Facade (XYZ / WMTS, OSM par défaut), clusters 20 px colorés (Alerte puis Disponible), fiche au clic avec navigation numérotée, filtres, légende, point de crise par adresse ou clic, isochrones 30/60/90 min, export PNG, actualisation 60 s | habilités |
| `/planning` | **Une seule page, deux interfaces** selon la largeur d'écran (bascule en direct à 1038 px). Bureau : calendrier mensuel par région (chargement à la demande : la région de l'utilisateur à l'ouverture, les autres au dépliage ; compteurs par position toujours affichés), **recherche et filtre « Maintenant » exécutés par l'API dans tout le périmètre**, **suppression d'un créneau (« Supprimer ce créneau »), d'une plage entière ou d'une sélection glissée (« Supprimer la sélection ») avec confirmation listant les plannings concernés, les parties hors période étant conservées (BR-PLA-4 : un négociateur ne peut pas supprimer Alerte / Formateur)**, demi-cases Jour / Nuit **toujours séparées** (y compris quand une même plage couvre la journée), **clic sur une demi-journée d'une plage de plusieurs jours : modification de ce seul créneau** (« Ce créneau », le reste de la plage est conservé ; « Toute la plage » reste disponible), **sélection de plusieurs jours par clic-glisser** sur la ligne d'un agent (modale pré-remplie ; au clic sur « Enregistrer », alerte si des plannings existants seront écrasés — remplacés sur la période, parties hors période conservées), saisie / modification / insertion / suppression, export PDF A4 paysage. Mobile : calendrier compact avec compteurs par jour et position, liste du créneau courant, saisie rapide. `/planning-mobile` redirige vers `/planning` | habilités |
| `/formulaire`, `/formulaire/:id` | Fiches de crise : liste filtrée, formulaire en 4 sections, validations, clôture, export PDF sélectif | profils 1, 3, 4, 7 |
| `/administration` | Périmètres de visualisation par profil sur la carte et le planning (modifications non enregistrées signalées) | super administrateur |
| `/gestion` | Gestion du personnel **paginée côté serveur** (recherche multi-mots, filtres région / profil, tri par colonne, état dans l'URL), inscription depuis le RPSI, modification, suppression logique | profils 1, 3, 7 |
| `/testvie` | Monitoring : API, base, Facade, GEOLOC, REMOP | public |
| `/indisponible`, `/unauthorized`, `**` | Service indisponible (réessai), accès refusé, page introuvable | public |

En-tête : navigation, **permanence GIGN** (numéro paramétré dans `t_param_app`), compte personnel
(appareil NEO et interrupteurs de géolocalisation), mentions légales (PDF modèle à remplacer dans
`apps/web/public/mentions-legales.pdf`). Matomo est activé dès que `rni.matomo.url` est renseigné.

---

## Listes volumineuses : pagination

`GET /users?page=&size=&q=&region=&profil=&sort=nom|nigend|unite|region|profil&dir=asc|desc` renvoie
`{ items, total, page, size, capped }` — jamais la liste complète (20 par défaut, 100 au maximum).

- **Recherche** : chaque mot doit apparaître dans nom, prénom, nigend, code ou libellé d'unité ;
  index trigrammes `pg_trgm` (`ix_ref_user_search`, `ix_unite_libelle`), jokers `%` / `_` échappés.
- **Tri** sur liste blanche, départagé par `id_user` (pagination stable).
- **« Deferred join »** : tri et `OFFSET` sur une table étroite, détail chargé pour les seules lignes de la page.
- **Comptage plafonné à 100 000** : au-delà, `capped: true`, l'écran affiche « 100 000+ — affinez la
  recherche » ; le coût d'une requête reste borné quel que soit le volume.
- JIT PostgreSQL désactivé pour les connexions de l'API (coût de compilation supérieur au gain).

Mesuré sur **1 000 000** de comptes : page 1 ≈ 0,2 s, page 5 000 ≈ 0,1–0,5 s, recherche ≈ 0,01–0,2 s.
Les autocomplétions (RPSI, personnel du planning) utilisent les mêmes index et sont limitées à 20 résultats.

## Cache applicatif

Chaque processus de l'API garde en mémoire les lectures coûteuses (`apps/api/src/common/cache`). En
cluster (plusieurs workers, plusieurs serveurs), l'invalidation est **partagée par PostgreSQL** : pas
de Redis.

| Données | Clé (partagée entre utilisateurs de même périmètre) | Durée | Invalidée par |
|---|---|---|---|
| Compte de l'utilisateur connecté (à chaque requête) | nigend | 30 s | écriture `ref_user` |
| Référentiels, régions, voisinages, fuseaux | — | 1 h | — |
| Paramètres `t_param_app`, périmètres | — | 60 s | écriture / écran Administration |
| Calendrier, compteurs par région, compteurs mobiles, restitutions par date | mois / dates, régions, filtre, **créneau courant** | 5 min | écriture `planning` ou `ref_user` |
| Carte (`geojson`), positions GEOLOC | régions, créneau courant | 15 s | idem |
| Comptage de la liste paginée du personnel | filtres | 60 s | écriture `ref_user` |
| Facade (fonds, géocodeur, isochrones), REMOP | adresse / point / nigend | 10 min – 1 h | — |

Fonctionnement :
- **Invalidation automatique.** Des hooks Sequelize sur `planning`, `ref_user` et `t_param_app`
  invalident immédiatement dans le processus qui écrit (refait après le commit dans une
  transaction). Une lecture en cours pendant une écriture n'est pas conservée.
- **Invalidation partagée (cluster).** Des déclencheurs PostgreSQL (migration 2.4.0) émettent une
  notification `rni_cache` à chaque écriture validée sur les tables mises en cache, **y compris
  hors API** (import RPSI, script SQL). Chaque worker écoute (`LISTEN`) et invalide son cache ; si
  l'écoute est coupée, le cache est vidé à la reconnexion. `CACHE_NOTIFY=false` désactive l'écoute.
- **Créneau courant dans la clé.** Les compteurs et le filtre « Maintenant » changent d'eux-mêmes
  à 08h et 18h, heure locale de chaque fuseau (métropole et outre-mer).
- **Chargements concurrents mutualisés.** Cinquante cartes qui se rafraîchissent ensemble ne
  déclenchent qu'un seul calcul. Les erreurs ne sont jamais mises en cache.
- **Réponses volumineuses gardées sérialisées, avec leur ETag.** Pas de nouvelle sérialisation à
  chaque appel, et un navigateur à jour reçoit `304 Not Modified` sans corps
  (`Cache-Control: private, no-cache`). Nginx compresse le JSON en gzip.
- **Taille bornée.** Éviction LRU au-delà de `CACHE_MAX_ENTRIES` (5000) ou `CACHE_MAX_MB` (128 Mo).
  Une réponse de plus d'un quart du plafond n'est pas conservée. `CACHE_ENABLED=false` désactive le cache.
- **Exploitation (super administrateur).** `GET /rni/api/admin/cache` donne les statistiques
  (entrées, Mo, taux de succès). `DELETE /rni/api/admin/cache[?tag=planning|users|referentiel|param|external]`
  vide le cache **de tous les processus**. Les écritures faites hors API sont propagées par les
  notifications PostgreSQL ; les durées ci-dessus restent un filet de sécurité.

Mesures sur 5 100 personnels et 121 000 plannings (médiane, sur la même machine) :

| Route | Sans cache | Avec cache |
|---|---|---|
| Compteurs par région (national) | 83 ms | 2 ms |
| Calendrier d'une région | 61 ms | 8 ms |
| Calendrier national (15 Mo) | 434 ms | 40 ms ; revalidation `304` : 25 ms, 0 octet |
| Calendrier filtré « Maintenant » | 111 ms | 5 ms |
| Carte (`geojson`, national) | 93 ms | 10 ms |
| 50 cartes rafraîchies simultanément | 1 778 ms | 254 ms |


## Dette technique du §9 : traitement

| # | Point | Traitement |
|---|---|---|
| 1 | SQL par concaténation | Toutes les requêtes passent par des `replacements` nommés ; aucune valeur concaténée |
| 2 | Insertion non atomique | Une transaction : verrouillage `FOR UPDATE` de la plage initiale, **tous les contrôles avant écriture**, suppression + créations ; contrainte d'exclusion en filet de sécurité |
| 3 | Incohérence profil 5 | Module `/formulaire` refusé côté serveur aux profils 2, 5, 6 (lecture comprise) |
| 4 | Filtre régional des fiches côté client | Filtre région / état / dates appliqué par l'API |
| 5 | Endpoints morts | `/crise`, `/users/negociateur`, `CriseService` et `planning.annee_mois` supprimés ; point de crise éphémère côté carte |
| 6 | Permanence GIGN en dur | Paramètre `rni.permanence.gign` (exposé via `/service/configuration`) |
| 7 | `is_actif` ignoré / unicité fragile | `GET /referentiel/positions?actif=true` + contrôle `is_actif` à l'écriture ; unicité par intervalles d'index de créneau + contrainte en base, couverte par les tests |
| 8 | Aucun test / pas de pagination | Pagination serveur de la gestion du personnel (voir ci-dessus) ; tests unitaires (règles partagées, priorité d'affichage carte, droits, validations) et e2e API sur PostgreSQL |
| 9 | Échappement maison des apostrophes | Supprimé (requêtes paramétrées / ORM) |
| 10 | Journalisation en base si PostgreSQL tombe | Le filtre d'erreurs répond toujours (503 `RNI-0001` / libellés de repli) et bascule sur les logs applicatifs |

## Choix d'interprétation à valider

Le cahier des charges laisse quelques points ouverts ; voici les choix retenus :

1. **Périmètre géographique (BR-AUTH-6, paramétrable)** : les régions visibles sont réglées **par profil
   et par module** (carte, planning) par le **super administrateur** (profil 8), dans l'écran
   **Administration** (`/administration`, table `t_perimetre_profil`) : toutes les régions, sa région +
   régions limitrophes, ou sa région seule. Valeurs initiales :
   - **carte** : cahier des charges (GIGN et lecture seule : toutes les régions ; OMS : sa région ;
     référent, référent adjoint, négociateur, fiche de crise : sa région + limitrophes) ;
   - **planning** : seul le GIGN voit toutes les régions ; tous les autres profils, leur région.

   Le super administrateur a les droits du GIGN, son périmètre est toujours national ; son profil n'est
   attribuable que par un super administrateur (le premier : `UPDATE ref_user SET id_profil = 8 WHERE nigend = '…'`).
   Les modifications s'appliquent sous 30 s côté API (au prochain rechargement côté écran) et sont tracées.
   Les droits d'écriture (planning, personnel) restent limités à sa région.
2. **Négociateur** : en plus de BR-PLA-4, il ne peut pas **supprimer** une plage Alerte / Formateur.
3. **Insertion** : les plages avant / après gardent l'adresse de la plage initiale ; la période insérée
   prend l'adresse saisie, sinon celle de la plage initiale. La nouvelle position doit différer (RNI-1007).
4. **Fiche de crise** : modifiable par tout utilisateur autorisé de la région de l'auteur tant qu'elle
   n'est pas clôturée ; clôture et suppression par l'auteur seul. Notes entières de **0 à 10**.
   « Tout obligatoire » est appliqué côté client (nom **ou** prénom, adresse issue du géocodeur) ;
   l'API valide types, bornes, téléphone et liste des crises.
5. Un administrateur ne peut pas supprimer son propre compte.
6. `GET /service/configuration` n'expose que les paramètres marqués `is_front` (jamais les jetons).
7. **Contrats des services externes** : les formats REMOP (`{ neo: [...] }`), GEOLOC (GeoJSON avec
   `properties.indicatif` / `horodatage`) et Facade (`baseLayers[]`, `candidates[]` façon ArcGIS,
   isochrones GeoJSON avec `timebreak`) sont normalisés dans `modules/external/real.clients.ts` ;
   **à confronter aux contrats réels** avant la mise en production.

## Déploiement

Voir [`deploy/PROCEDURE-DEPLOIEMENT.md`](deploy/PROCEDURE-DEPLOIEMENT.md) et le rapport d'audit
[`docs/AUDIT-PRODUCTION.md`](docs/AUDIT-PRODUCTION.md) : Node.js sous **systemd** (sans pm2),
cluster `node:cluster`, versions dans `releases/` avec bascule atomique et retour arrière
automatique, migrations versionnées, Nginx (`deploy/nginx-rni.conf`). CI :
[`.gitlab-ci.yml`](.gitlab-ci.yml) (forge interne, livraison sur tag) et
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).

### Exécution de l'API

`node dist/main.js` est le seul point d'entrée :

| Mode | Quand | Comportement |
|---|---|---|
| Processus unique | développement / tests, `WEB_CONCURRENCY=1` | un processus HTTP |
| Cluster | production (même avec 1 worker) ou `WEB_CONCURRENCY=N\|auto` | primaire + N workers sur le même port |

Signaux : `SIGTERM` / `SIGINT` → arrêt gracieux (`/health/ready` passe à 503, délai
`SHUTDOWN_DELAY_MS`, fin des requêtes en cours, fermeture du pool, forcé après `SHUTDOWN_TIMEOUT_MS`) ;
`SIGHUP` → **redémarrage progressif sans interruption** (un worker à la fois, nouvelle version
désignée par `APP_ROOT`). Un worker qui plante est relancé ; au-delà de 5 plantages par minute le
primaire s'arrête et laisse systemd décider. Exception ou promesse non gérée : journalisée puis
arrêt du worker (relancé).

Variables d'environnement (toutes validées au démarrage ; une erreur arrête le processus, code 78) :

| Variable | Défaut | Rôle |
|---|---|---|
| `NODE_ENV` | `local` | `production` / `preprod` : secrets obligatoires, simulations interdites, logs JSON |
| `APP_HOST` / `APP_PORT` / `API_PREFIX` | `0.0.0.0` / `8096` / `rni/api` | écoute (systemd : `127.0.0.1`) |
| `PG_HOST` `PG_PORT` `PG_USER` `PG_PASSWORD` `PG_DATABASE` | dév. : `localhost` / `rni` | base (obligatoires hors développement) |
| `PG_SSL` / `PG_SSL_CA` | `false` / — | TLS vers PostgreSQL, CA en PEM |
| `PG_POOL_MAX` | `10` | connexions par processus |
| `PG_STATEMENT_TIMEOUT_MS` | `30000` | durée maximale d'une requête SQL |
| `WEB_CONCURRENCY` | `1` | workers du cluster (`auto` = nombre de cœurs) |
| `MIGRATE_ON_START` | `false` | migrations avant le démarrage des workers |
| `SHUTDOWN_TIMEOUT_MS` / `SHUTDOWN_DELAY_MS` | `25000` / `3000` (prod) | arrêt gracieux |
| `APP_ROOT` | — | lien de la version courante (relu à chaque redémarrage progressif) |
| `PROXY_SHARED_SECRET` | — | si défini, seules les requêtes portant `X-RNI-Proxy-Secret` (ajouté par Nginx) sont acceptées |
| `TRUST_PROXY` | `loopback` | sauts de proxy crus pour `X-Forwarded-For` (journal d'audit) |
| `CORS_ORIGINS` | dév. : `http://localhost:4200` ; prod : aucune | origines croisées autorisées |
| `LOG_FORMAT` / `LOG_LEVEL` | prod : `json` / `log` | journalisation sur la sortie standard |
| `CACHE_ENABLED` `CACHE_NOTIFY` `CACHE_MAX_ENTRIES` `CACHE_MAX_MB` | `true` `true` `5000` `128` | cache applicatif |
| `RNI_MOCK_AUTH` / `RNI_MOCK_EXTERNAL` | dév. : `true` | simulations (authentification interdite hors dév.) |

Sondes : `GET /rni/api/health/live` (processus) et `/rni/api/health/ready` (base joignable, pas
d'arrêt en cours). Chaque réponse porte `X-Request-Id` (celui de Nginx, sinon généré), repris dans
les journaux d'erreur.

### Conteneurs Docker

Deux images, construites depuis la **racine du monorepo** (contexte partagé, `.dockerignore`) :

| Image | Dockerfile | Contenu |
|---|---|---|
| `rni-api` | `apps/api/Dockerfile` | Build multi-étapes, `pnpm deploy --prod` (dépendances de production seules, `db/` inclus), Node 22 Alpine, utilisateur `node`, port 8096, `TZ=Europe/Paris`, sonde `/rni/api/service/alive` |
| `rni-web` | `apps/web/Dockerfile` | Build Angular de production servi par Nginx non root (port 8080) sous `/rni/`, reverse-proxy `/rni/api` → `API_UPSTREAM` (défaut `http://api:8096`), en-têtes de sécurité, `index.html` non mis en cache |

Démonstration locale complète (base + API + client, authentification et services externes simulés) :

```bash
pnpm docker:up                                      # http://localhost:8080/rni/
docker compose --profile tools run --rm migrate     # migrations sur une base existante
pnpm docker:down
```

Build derrière un proxy d'entreprise avec une autorité de certification interne :

```bash
docker build -f apps/api/Dockerfile -t rni-api \
  --build-arg HTTPS_PROXY=http://proxy:3128 \
  --secret id=ca_certs,src=/etc/ssl/certs/ca-interne.pem .
```

En préproduction / production, l'image API s'exécute avec `NODE_ENV=production` (défaut) :
l'authentification simulée y est **refusée au démarrage**. Variables à fournir : `PG_HOST`,
`PG_PORT`, `PG_USER`, `PG_PASSWORD`, `PG_DATABASE`, `PG_SSL`, `CORS_ORIGINS`, et si besoin
`NODE_EXTRA_CA_CERTS` (certificat monté en volume) pour les appels HTTPS vers REMOP / GEOLOC /
Facade. Le conteneur `rni-web` doit rester **derrière le reverse-proxy SSO**, qui écrase les en-têtes
`nigend` / `cn` / `title` ; il ne doit pas être exposé directement aux navigateurs.
