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
| `pnpm db:migrate` | Applique `apps/api/db/migrations/*.sql` (idempotents) sur la base Docker existante |

---

## Architecture

```
navigateur ──► reverse-proxy SSO (en-têtes nigend, cn, title…) ──► Nginx
                                                                    ├── /rni/       → client Angular (statique)
                                                                    └── /rni/api/   → pm2 « rni-api » (NestJS :8096)
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
POST /planning (ecraser: true = remplace les plages chevauchées)   GET /planning/overlaps   PUT /planning/:id   DELETE /planning/:id   POST /planning/insert
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
- `migrations/*.sql` : évolutions idempotentes à appliquer sur une base existante (`pnpm db:migrate`).
- `dev/90-seed-dev.sql` : **jeu de données fictif** (unités, ~110 personnels RPSI, comptes, plannings
  du mois précédent au mois suivant, fiches d'exemple).

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
| `/planning` | **Une seule page, deux interfaces** selon la largeur d'écran (bascule en direct à 1038 px). Bureau : calendrier mensuel par région (chargement à la demande : la région de l'utilisateur à l'ouverture, les autres au dépliage ; compteurs par position toujours affichés), **recherche et filtre « Maintenant » exécutés par l'API dans tout le périmètre**, demi-cases Jour / Nuit, **sélection de plusieurs jours par clic-glisser** sur la ligne d'un agent (modale pré-remplie ; au clic sur « Enregistrer », alerte si des plannings existants seront écrasés — remplacés sur la période, parties hors période conservées), saisie / modification / insertion / suppression, export PDF A4 paysage. Mobile : calendrier compact avec compteurs par jour et position, liste du créneau courant, saisie rapide. `/planning-mobile` redirige vers `/planning` | habilités |
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

Voir [`deploy/PROCEDURE-DEPLOIEMENT.md`](deploy/PROCEDURE-DEPLOIEMENT.md) : pm2 (`rni-api`, Node 22),
Nginx (`deploy/nginx-rni.conf`), script `deploy/install.sh` (sauvegarde, rsync, redémarrage, test de
vie). CI : [`.gitlab-ci.yml`](.gitlab-ci.yml) (forge interne, livraison sur tag) et
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).
