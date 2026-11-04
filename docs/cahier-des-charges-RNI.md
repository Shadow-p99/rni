# Cahier des charges — RNI (Répertoire National des Négociateurs)

## 1. Contexte et objectifs

### 1.1 Présentation de l'application

**RNI** est l'application de gestion du dispositif national des **négociateurs de la
Gendarmerie Nationale** (communauté GIGN / antennes régionales). Elle répond à quatre besoins :

| Domaine | Description | Source |
|---|---|---|
| **Carte opérationnelle** | Visualiser en temps réel la position des négociateurs (position de service, position temporaire saisie dans le planning, géolocalisation par téléphone NEO), localiser une **crise** et calculer les **isochrones d'accessibilité** autour d'elle | `carto.component.ts`, `service.controller.ts` |
| **Planning national** | Gérer les disponibilités des négociateurs par mois, jour (créneau Jour/Nuit) et **position de service** (Disponible, Indisponible, En service, Alerte, Formateur) | `planning.*.component.ts`, `planning.controller.ts` |
| **Fiche de crise (« formulaire négociation »)** | Rédiger, suivre et clôturer la fiche de renseignements d'une crise (profil de l'individu, situation, terrain, renseignements auteur) avec notes psychiatriques et export PDF | `formulaire-stat.component.ts`, `formulaire.controller.ts` |
| **Gestion du personnel** | Inscrire/modifier/réactiver/supprimer des comptes utilisateurs à partir du référentiel RH **RPSI**, leur affecter un profil applicatif | `users/*.component.ts`, `user.controller.ts` |

Applications externes connectées (référencées dans `t_param_app`) :
- **RPSI** : référentiel RH de la Gendarmerie (personnel, grades, services) — alimente les vues `v_personnel_to_ref_user`, `rpsi_personnel`, etc. (flux de données en base, pas d'appel API direct).
- **REMOP** (`rni.remop.hostname`, `/neo`) : liste des lignes/téléphones **NEO** d'un agent (nigend).
- **GEOLOC** (`rni.geoloc.hostname`, chemin `localisation`) : géolocalisation des terminaux NEO (GeoJSON).
- **Facade SIG** (`rni.facade.*`) : fonds cartographiques WMTS, **géocodeur** d'adresses et **calcul d'isochrones** (rayons paramétrés `rni.facade.param.isochrone.timebreaks`, utilisés : 30/60/90 min).
- **Matomo** (`_paq`) : mesure d'audience ; **Splunk** : journalisation d'audit via la table `t_admin_log_splunk`.

### 1.2 Cibles et périmètre

- Utilisateurs : GIGN (administration), référents et référents adjoints régionaux, négociateurs, OMS (observateurs), profils « lecture seule ».
- Web desktop + déclinaison **mobile** (breakpoint 1038 px, routes dédiées `planning-mobile`) ; une page de monitoring technique (`/testvie`).
- Réseau fermé minint/rie (URLs `*.psi.minint.fr`, `*.gendarmerie.fr`), authentification déléguée à un **SSO en amont** (identifiants transmis par en-têtes HTTP).

### 1.3 Architectures

- **Client** : Angular 13 + OpenLayers 6 + ng-zorro + Tailwind ; builds déployés sur Nginx (`/srv/nginx/rni`). API appelée sur `/rni/api` à la même origine.
- **API** : Node.js 22 / Express 4 / Sequelize 6 / **PostgreSQL** ; process géré par **pm2** (`rni-api`, `/srv/nodejs/rni`). Variables d'environnement : `PG_*`, `APP_PORT` (8096), `NODE_EXTRA_CA_CERTS`.
- **CI/CD GitLab** : build TS sur tag → rsync → `npm ci --omit=dev` → `pm2 restart rni-api`.

---

## 2. Authentification, habilitations et sécurité

### 2.1 Authentification (déléguée)

- L'authentification est **externe** (SSO amont). L'API ne gère ni login ni mot de passe : elle **fait confiance aux en-têtes** injectés par le reverse-proxy : `nigend` (identifiant agent, 6 chiffres), `cn`/`title` (identité), `codeunite`, `lib_region`, `id_profil`, etc.
  Source : `middlewares/headers.ts` (mock de ces en-têtes en mode `local`), usage dans `user.controller.ts`, `splunkLogger.ts`.
- Règle **BR-AUTH-1** : toute requête sur `/users`, `/planning`, `/formulaire` sans en-tête `nigend` → **401 Unauthorized**. (`logger.ts`)
- Règle **BR-AUTH-2** : tout `nigend` absent de `ref_user` → **401** (exception : l'endpoint `GET /users/isUser` renvoie `false` au lieu de 401, pour les gardes du client). (`logger.ts`)
- Règle **BR-AUTH-3** : l'application cliente **ne connaît pas** la liste des habilitations : elle interroge l'API (`/users/isUser`, `/users/isAdmin`) et l'API **re-jette systématiquement** toute écriture non autorisée (double contrôle client/serveur).
- Règle **BR-AUTH-4** (dev) : la liste CORS de l'API est restreinte à `http://localhost:4200` en prod applicative ; l'appel réel passe par le même nom d'hôte (`/rni/api`) derrière le proxy. (`src/app.ts`)

### 2.2 Profils / rôles (`ref_profil` + `t_profil_classement`)

| id | Code | Libellé métier | Rôle |
|---|---|---|---|
| 1 | G | **GIGN** | Administrateur national. Tous droits, voit toutes les régions, seul à pouvoir créer/promouvoir un compte GIGN ou OMS. |
| 2 | — | (lecture seule technique) | Accès **GET uniquement**, jamais listé dans la gestion du personnel, exclu des plannings et du module formulaire. |
| 3 | R | **Référent** (régional) |ADMIN local : gère les plannings et le personnel de **sa région (+ régions voisines pour la carte)** ; peut créer les plannings des négociateurs. |
| 4 | N | **Négociateur** | Gère **son propre** planning (créer/modifier/supposer/insérer), déclare ses disponibilités ; droits limités sur les positions Alerte/Formateur (cf. BR-PLA-4). |
| 5 | — | (profil « fiche de crise ») | GET + écritures autorisées uniquement sur `/formulaire` et sur ses infos d'appareil ; pas de planning. |
| 6 | O | **OMS** | Consultation (GET) de la carte/planning de **sa région uniquement** (sans les régions voisines). |
| 7 | RA | **Référent Adjoint** | Comme le référent (3). |

Preuves : matrice d'autorisation du middleware `logger.loggerMiddle` (bypass par méthode/chemin),
`UserService.checkAuthorization` côté client (1, 3, 7 = droits étendus ; 2, 4, 5 = non),
`update-user.component` (radios GIGN/OMS visibles uniquement pour profil 1),
`formulaire-stat.component.ts` (profils 2, 5, 6 renvoyés vers `/unauthorized`).

Règle **BR-AUTH-5** (« admin » au sens applicatif) : `isAdmin` = profil ∈ {1, 3, 7}
→ accès à la page `/gestion` et affichage de la liste des comptes. (`user.controller.ts#isAdmin`)

Règle **BR-AUTH-6** (périmètre de visibilité géographique) :
- profil 1 : toute la France ;
- profils 3, 4, 5, 7 : leur région **+ régions limitrophes** (`ref_nrb_region_r22`, codes INSEE) ;
- profil 6 : leur région seule ;
- la restriction s'applique aux données géographiques (`/planning/geojson`) et, côté client,
  aux listes (régions, comptes, fiches de crise filtrées sur `id_region` de l'utilisateur).
  (`planning.controller.ts#getPlanningGeojson`, `planning.component.ts#loadRegion`, `users.component.ts#initUsers`, `formulaire-stat.component.ts`)

### 2.3 Audit et traçabilité

- Règle **BR-SEC-1** : chaque requête technique sur `/users`, `/planning`, `/formulaire` (et `/service/geoloc`, `/coordinates`, `/isochrone`) écrit une ligne dans **`t_admin_log_splunk`** (horodatage serveur, IP client, route+méthode, rio user/unité, rôle, institution « GN ») destinée à Splunk. (`splunkLogger.ts`)
- Règle **BR-SEC-2** : toute **erreur métier** est journalisée en base (`t_admin_logs`) avec code, utilisateur, méthode, URL, corps de la requête et description tronquée à 4000 caractères, puis renvoyée en **HTTP 400** avec le message libellé depuis `t_admin_messages`. (`errorHandler.ts`)
- Règle **BR-SEC-3** : les écritures sur les comptes tracent le `nigend` de l'agent connecté (`nigend_connected`) dans les logs applicatifs.
- Règle **BR-SEC-4** : mentions légales accessibles depuis l'en-tête (PDF statique).

---

## 3. Modèle de données (reconstitué)

### 3.1 Référentiels

| Table | Clé | Contenu et règles |
|---|---|---|
| `ref_profil` | id_profil | 1 GIGN, 2 (lecture seule), 3 Référent, 4 Négociateur, 5 (fiche de crise), 6 OMS, 7 Référent adjoint. |
| `t_profil_classement` | id_profil | Ordre d'affichage des profils (`classement`), utilisé pour trier toutes les listes. |
| `ref_pos_service` | id_pos_service | **Position de service** avec couleur (`color`, utilisée partout en carto/planning) et drapeau `is_actif` : 1 **Disponible**, 2 **Indisponible**, 3 **En service**, 4 **Alerte**, 5 **Formateur**. Seules les positions actives sont proposées à la saisie. (`queryList.ts`, `formulaire.component`, `referentiel.controller`) |
| `ref_creneaux` | id_creneau | **Créneau** : 1 = **Jour** (08h–18h), 2 = **Nuit** (18h–08h le lendemain). | (`Creneau.model.ts`, SQL temps +8h/+18h/+32h, libellés HTML) |
| `ref_grade_personnel` | id_grade_personnel | Grades RPSI : libellé, abréviation, **poids** (ordre hiérarchique de tri). |
| `ref_regions` | id_region | Régions (code INSEE — c'est la clé de jointure avec les voisinages). |
| `ref_nrb_region_r22` | (source, voisin) | **Régions voisines** (voisinage INSEE R22) → définit le « halo » des référents. |
| `t_region_center` | id_region | Centre géographique de chaque région (métropole + outre-mer) pour le cadrage de la carte. |
| `ref_unite` | code_unite | Unités (libellé, adresse, coordonnées x/y, département). Sert d'**adresse par défaut** d'un planning. |
| `lien_departement_region` (+`libelle_departement_min`, `dept_time_zone_database`) | id_departement | Lien département↔région et **fuseau horaire du département** (outre-mer). |
| `rpsi_personnel`, `rpsi_service`, `rpsi_insee_departement` | — | Tables RPSI alimentées par flux RH externe. |
| `v_personnel_to_ref_user` | nigend | Vue « personnel RPSI candidat à l'habilitation RNI » : identité, grade, téléphones, NEO, unité, région. Source d'alimentation de la création de compte. |
| `t_param_app` | cle_param_app | **Configuration applicative en base** : URLs, tokens et chemins GEOLOC / REMOP / Facade (front et back), timebreaks isochrone. Consultable via `GET /service/configuration`. |
| `t_admin_messages` | code_message | **Catalogue des messages d'erreur métier** (code → libellé, type). |
| `t_admin_logs` / `t_admin_log_splunk` | — | Journaux d'audit métier / technique. |

### 3.2 Tables métier

**`ref_user` (compte RNI)** — `id_user`, `nigend` (unique, importé du RPSI), `grade`,
`nom`, `prenom`, `code_unite`, `tel_pro`, `tel_perso`, `tel_unite`, `numero_neo_1`, `numero_neo_2`,
`id_profil`, `id_region`, `commentaire`, `geoloc_id_geoloc`, `geoloc_indicatif`,
`geoloc_bool_geoloc`, `geoloc_bool_indispo`, `bool_user_inactif`.
- Règle **BR-REF-1** : suppression **logique uniquement** (`bool_user_inactif = true`) ; un compte
  inactif est masqué partout et peut être **réactivé** par une nouvelle création (cf. BR-GPU-2).
- Règle **BR-REF-2** : `geoloc_indicatif` est dérivé automatiquement : `"RNI"` + `id_user`
  complété à gauche par des zéros (ex. `RNI002256`). C'est la clé de rapprochement avec le flux
  GEOLOC. (`user.controller.ts#infoDeviceUser`, `convertToGeojson.ts`)
- Règle **BR-REF-3** : deux interrupteurs de géolocalisation indépendants :
  `geoloc_bool_geoloc` (géolocalisation active) et `geoloc_bool_indispo` (géolocalisation
  **maintenue en position Indisponible** — la confidentialité interdit la géoloc des indisponibles,
  sauf choix contraire de l'agent).

**`planning`** — `id_planning`, `id_user`, `date_debut` + `id_creneaux_debut`, `date_fin` +
`id_creneaux_fin`, `id_pos_service`, `adresse_temp`, `x_adresse_temp`, `y_adresse_temp`,
`annee_mois` (non utilisé). Un enregistrement = une plage [date_début @ créneau, date_fin @ créneau].
- Vue `v_planning_geojson` : jointure users/unités/régions pour la carte ; une position de service
  `NULL` est interprétée **Indisponible** (`COALESCE(id_pos_service, 2)`).
- Vue `v_sum_services` : compteurs par région × position de service au temps courant
  (`CURRENT_TIMESTAMP` borné par créneau **dans le fuseau du département** : début 08h ou 18h,
  fin 18h ou +32h).

**`t_formulaire` (fiche de crise / négociation)** — 46 colonnes métier (cf. §5.3),
`id_user` **auteur** (créateur), `is_closed`, `created_at` / `updated_at`.

### 3.3 Codes erreur métier (`t_admin_messages`)

Catalogue observé dans le code (le libellé est stocké en base) :

| Code | Signification détectée | Déclencheur |
|---|---|---|
| RNI-0000 | Erreur technique générique | toute exception non identifiée (`errorHandler`) |
| RNI-0001 | Base de données indisponible | échec `SELECT 'Base RNI OK'` (`/service/alive`) |
| RNI-1001 | Paramètre obligatoire manquant | contrôles d'entrée de tous les contrôleurs |
| RNI-1003 | Utilisateur / personnel inconnu | `nigend` absent de `ref_user` ou du RPSI |
| RNI-1005 | Chevauchement de planning | un créneau existe déjà sur la période demandée |
| RNI-1006 | Insertion hors bornes | l'insertion excède la plage du planning initial |
| RNI-1007 | Insertion interdite | plage identique à l'initial ou date antérieure à M-1 |
| RNI-1008 | Action non autorisée | négociateur posant Alerte/Formateur ; clôture de fiche par un non-auteur |
| RNI-1010 | Fiche inaltérable | modification d'une fiche clôturée ; suppression par un non-auteur |
| RNI-2002 | Config GEOLOC absente | clé `t_param_app` manquante |
| RNI-2003 | Config Facade (géocodeur) absente | idem |
| RNI-2004 | Config Facade (isochrone) absente | idem |
| RNI-2005 | Config REMOP absente | idem |
| RNI-3001 | Aucune adresse trouvée | géocodeur sans `candidates` |
| RNI-3002 | Aucune ligne NEO | REMOP sans tableau `neo` |

---

## 4. Module Carte opérationnelle (`/carte`)

### 4.1 Affichage

- Carte OpenLayers centrée par défaut sur la France (2.2529 / 46.4547, zoom 6) ; pour tout profil ≠ 1, 2,
  **cadrage automatique sur le centre de sa région** (`t_region_center`). (`carto.component.ts#centerRegion`)
- Règle **BR-CAR-1** : les **fonds cartographiques** (liste, WMTS ou OSM) ne sont pas codés en dur :
  ils proviennent de la configuration Facade (`rni.facade.hostname.front`, `rni.facade.token`,
  `rni.facade.path.carto` → réponse JSON `baseLayers[]`). Fonds rendus en WMTS via
  `WMTSCapabilities` ; fallback OSM si le service ne répond pas ; le fonds `_NEO2` utilise le
  `matrixSet default028mm` ; **OSM visible par défaut** ; un sélecteur permet de basculer de fonds.
  Source : `carto.component.ts#ngOnInit/#createMap`.

### 4.2 Points des personnels

- Alimentation : `GET /planning/geojson` = `v_planning_geojson` (personnels des profils 3, 4, 7 actifs)
  + géolocalisation temps réel GEOLOC, fusionnées dans la réponse, puis filtrées par profil (BR-AUTH-6).
- Règle **BR-CAR-2 — priorité d'affichage de la position** (implémentée dans `convertToGeojson.ts`) :
  1. **Adresse de l'unité** si aucun planning (gris `#808080`, `adresse_type=unite`) ;
  2. **Adresse temporaire du planning** en cours (`adresse_type=temporaire`) ;
  3. **Géolocalisation téléphone** (`adresse_type=localisation`, icône spécifique + horodatage)
     si : l'agent a un appareil déclaré (`geoloc_indicatif`), `geoloc_bool_geoloc = true`, **et**
     soit position ≠ Indisponible, soit Indisponible **avec** `geoloc_bool_indispo = true` (BR-REF-3).
- Règle **BR-CAR-3** : un point sans planning (`id_planning` null) est affiché en **gris**,
  position de service implicite Indisponible.
- Règle **BR-CAR-4** : agrégation en **clusters** (distance 20 px). Au clic : zoom si < 10, sinon
  affichage de la fiche ; si plusieurs personnes au même endroit, navigation par boutons numérotés
  colorés. Couleur des clusters : priorité **Alerte (4)** puis **Disponible (1)**.
- Couleurs des positions = colonne `ref_pos_service.color` (modifiables en base — cf. historique
  « Changement des couleurs planning »).

### 4.3 Fiche informative au clic

Affiche : Grade + Prénom NOM, Unité (code − libellé), Position de service, adresse (type : unité /
temporaire / « Localisé via NEO le JJ/MM/AAAA à HH:mm »), coordonnées GPS, téléphones **NEO 1/2,
personnel, unité**, commentaire. Les lignes « Téléphone » sont cliquables (`tel:`).
Déduplication : si `numero_neo_2` est une liste CSV dont le 1er élément égale `numero_neo_1`,
on n'affiche que le second. (`formatPropertiesToShow`)

### 4.4 Gestion de crise

- Règle **BR-CAR-5** : l'utilisateur autorisable (`checkAuthorization`, profils 1/3/7) peut **poser un
  point de crise** (pic rouge) soit **par adresse** (recherche géocodée ≥ 1 caractère, sélection dans
  la liste des candidats), soit **par clic sur la carte**. Le point est recréé à chaque nouveau
  marquage (un seul point de crise actif à la fois) ; la carte se recentre (zoom 10).
- Règle **BR-CAR-6** : le marquage déclenche automatiquement le **calcul des isochrones 30 / 60 / 90
  minutes** via la Facade (`rni.facade.path.isochrone`, timebreaks paramétrés), rendu en polygones
  bleu translucide ; affichage/masquable par un clic ; purge lors d'un nouveau point.
- Règle **BR-CAR-7** : le point de crise est **éphémère** (session carte uniquement, non persisté).
  *(Un service client `crise.service.ts` POSTant `/crise` existe mais l'endpoint n'existe plus dans
  l'API : fonctionnalité retirée — à trancher dans une éventuelle refonte.)*

### 4.5 Conforts

Filtres par position de service (cases à cocher 1..5 + « tout »), légende, sélecteur de fonds,
export **PNG** de la carte (`carte_rni_YYYY-MM-DD.png`), notifications ng-zorro en haut à droite,
raccourci « permanence GIGN » (numéro en dur dans le header : `+33 6 20 10 21 75` — cf. dette §8).

---

## 5. Module Planning (`/planning`, `/planning-mobile`)

### 5.1 Vue calendrier mensuel

- Onglet **Planning** : calendrier mensuel **par région** (sections dépliables). Une ligne par
  personnel (profils **3, 4, 7**, actifs), groupée par département puis triée par
  `classement` de profil, **poids de grade**, nom, prénom. (`getPlanningTimetableQuery`)
- Règle **BR-PLA-1** : une journée de planning est une **moitié de case** (haut = Jour 8h-18h,
  bas = Nuit 18h-8h). Rendu par `planning-personnel.component#loadCells` : créneaux partiels en
  demi-cases, jours pleins en case entière, couleur = `ref_pos_service.color`, vide = gris.
- Règle **BR-PLA-2** : les plannings **à cheval sur le mois affiché** sont tronqués aux bornes du
  mois (requête SQL en 4 branches d'union : contenu, débuté avant, finit après, englobant).
  Les plannings affichés sont ceux qui **touchent** le mois. (`queryToGetPlanningForTimetable`)
- Navigation mois précédent/suivant ; filtres superposés par position de service avec logique
  « jour en cours » (avant 8h / après 18h ⇒ créneau Nuit, sinon Jour) ; compteurs par région ×
  position (`v_sum_services`, endpoint `/region/getNbPositionServiceByRegion`) ; export **PDF A4
  paysage** (html2canvas + jsPDF).

### 5.2 Saisie d'un créneau (créer / modifier / supprimer)

Formulaire (modal) : personnel (autocomplétion « nigend + prénom nom »), dates début/fin,
créneaux début/fin (Jour/Nuit), **position de service**, adresse temporaire.

Règles côté client (`formulaire.component.ts`) :
- **BR-PLA-3** : dates obligatoires ; **borne minimale = M-1** (premier jour du mois précédent :
  `new Date(moisCourant - 1)`), date_fin ≥ date_debut ; interdit « même jour, créneau debut=Nuit
  et fin=Jour » ; la position proposée est restreinte aux positions `is_actif`, et aux positions
  {Disponible, Indisponible, En service} pour les profils ∉ {1, 3, 7}.
- Adresse temporaire : saisie assistée par le géocodeur **Facade** (à partir de 6 caractères) ;
  les coordonnées x/y proviennent du candidat retenu ; laisser vide = adresse de l'unité.
- En modification, l'agent ne peut pas changer de personnel (champ verrouillé).

Règles côté API (`planning.controller.ts`) :
- **BR-PLA-4** : un **négociateur (profil 4)** ne peut ni saisir ni sortir une position
  **Alerte (4)** ou **Formateur (5)** — ni en créant, ni en modifiant une plage qui les porte
  déjà (erreur RNI-1008). Ces positions sont réservées aux référents/GIGN/référents adjoints.
- **BR-PLA-5** : **unicité temporelle** — impossible de créer/modifier une plage qui recouvre une
  plage existante du même agent (comparaison `YYYYMMDD||créneau` des deux bornes + couvrance
  stricte ; erreur RNI-1005). (`queryCheckIfNegoExistsBetween`)
- **BR-PLA-6** : défaut d'adresse — sans coordonnées saisies, la position du planning est
  l'**adresse et le x/y de l'unité** de l'agent (apostrophes échappées).
- **BR-PLA-7** : écriture réservée : les profils 4 et 5 (et 5) n'ont accès en écriture qu'au
  chemin `/planning/` **pour eux-mêmes** (`body.nigend == en-tête nigend`) — cf.
  `bypassPostPutDeletePlanning` / `bypassInsertPlanning`.
- **BR-PLA-8** : suppression **physique** d'une plage (`DELETE /planning`, sans soft delete).

### 5.3 « Insertion » — scission d'une plage existante

`POST /planning/insert` : insérer une plage **à l'intérieur** d'une plage existante afin de changer
la position de service d'une sous-période (ex. semaine disponible → une semaine « En service »).

- Règle **BR-PLA-9** : l'insertion doit être **strictement incluse** dans la plage initiale,
  créneaux inclus ; toute extension → RNI-1006. Une plage identique à l'initiale → RNI-1007 ;
  une plage commençant avant M-1 → RNI-1007.
- Règle **BR-PLA-10** : la plage initiale est **détruite puis découpée** jusqu'à 3 plages :
  [avant — position d'origine], [insertion — nouvelle position], [après — position d'origine],
  en tenant compte de la continuité Jour/Nuit (fin Nuit = jour suivant 8h, reprise à 18h…).
- Règle **BR-PLA-11** (client) : la nouvelle position doit différer de l'ancienne, sinon message
  « Veuillez changer la disponibilité ».

### 5.4 Version mobile

`/planning-mobile` (profils connectés uniquement) : calendrier simplifié du mois, **compteurs
nationaux/région par jour et par position** (`getNbPositionServiceAllRegionMobile`, plage
YYYYMMDD), filtres par région et positions, affichage du **planning du jour courant avec créneau
courant** (bascule Jour/Nuit selon l'heure 8h/18h) et saisie rapide des mêmes informations que le
planning desktop (mêmes contraintes BR-PLA-x).

### 5.5 Endpoints de restitution

`GET /planning/byDateAndIdRegion/:date`, `/byNigendAndDate/:nigend/:date`,
`/byPositionAndDate/:idPosition/:date` : restituent les plannings d'une date, bornés aux profils
3/4/7, éventuellement filtrés région. Utilisés par les vues détaillées.

---

## 6. Module Fiche de crise / formulaire négociation (`/formulaire`)

### 6.1 Accès

- Règle **BR-FOR-1** : interdits aux profils **2, 5, 6** (redirection client) — en pratique utilisés
  par GIGN, référents, référents adjoints, négociateurs. (NB : le middleware serveur autorise aussi
  les écritures du profil 5 — incohérence relevée, §8.)
- Règle **BR-FOR-2** : le GIGN (1) voit **toutes** les fiches ; les autres voient uniquement celles
  dont l'auteur appartient à **leur région** (filtrage client sur `User.id_region`).

### 6.2 Contenu de la fiche (formulaire long, tout obligatoire côté client)

Quatre sections dépliables :
1. **Profil de l'individu** : `nom`, `prenom`, `age`, `crise` (liste fermée : **Terrorisme, Prise
   d'otage, Prise d'otage familiale, Rétention familiale, Forcené, Retranché, Suicidaire**, valeur
   par défaut « Aucun ») et **4 notes** : psychopathe, paranoïaque, schizophrène, **dangerosité**
   (entières ; défaut 0 à la création si vides).
2. **Situation** : description, heure, élément déclencheur, situation actualisée, exigences,
   troubles, arme(s), cible, personnes présentes, personnes blessées, derniers éléments de vie.
3. **Terrain** : localisation, **adresse** (assistée géocodeur — doit correspondre à un candidat),
   résidence, accès, protection, véhicule, voisinage, dispositifs gendarmerie / secours, dangers,
   autorité sur place.
4. **Renseignements auteur** : description, **téléphone** (indicateur + validation regex `0[1-9]…`
   national ou `+/00` international), profession, famille, amis, origine, cursus, lieu de vie,
   religion, réseaux sociaux, activité, TAJ, addictions, médical.

Règle **BR-FOR-3** : au moins l'un de nom/prénom non vide (`nameValidator`) ; les champs téléphone
et adresse sont validés en continu (bordure rouge + message).

### 6.3 Cycle de vie

- Règle **BR-FOR-4** : la fiche est créée **au profit de l'utilisateur connecté** (auteur = nigend
  de l'en-tête). La création renvoie la fiche (nouvel `id_formulaire`).
- Règle **BR-FOR-5** : une fiche **clôturée** (`is_closed = true`) n'est plus modifiable (RNI-1010) ;
  clôture = action explicite avec confirmation, impossible avant enregistrement.
- Règle **BR-FOR-6** : clôture et suppression réservées à l'**auteur** (sinon RNI-1008/RNI-1010).
- Règle **BR-FOR-7** : suppression **physique**.
- La liste tri par `updated_at` décroissant, filtrable : région, actives/clôturées, plage de dates
  de dernière modification.
- Règle **BR-FOR-8** : **export PDF** A4 portrait avec choix des sections à imprimer
  (situation / terrain / renseignements + bloc Profil systématique).

---

## 7. Module Gestion du personnel (`/gestion`)

Accès : page réservée (gardes `IsUser` + `IsAdmin`) aux profils **1, 3, 7** ; les 3 et 7 ne voient
que leur **région** ; le GIGN voit tout et dispose du filtre région.

### 7.1 Liste et recherche

- Règle **BR-GPU-1** : sont listés uniquement les comptes des profils **3, 4, 7** — plus les profils
  1 et 6 **pour le GIGN seul** — et jamais les comptes inactifs. Tri : classement de profil, grade,
  nom, prénom. (`getAllUsers`, `getUserByRegion`)
- Recherche multi-critères (nom, prénom, nigend, code/libellé unité, libellé profil, région).

### 7.2 Création d'un compte

- Règle **BR-GPU-2** : on ne saisit **jamais** l'identité à la main — le compte est créé
  **à partir du RPSI** (`v_personnel_to_ref_user`) par **nigend** (autocomplétion nigend + prénom
  nom, saisie ≥ 6 caractères) ; le RPSI fournit nom, prénom, grade, région, unité, téléphones, NEO.
  Si le nigend n'existe ni parmi les comptes ni dans le RPSI → RNI-1003.
  Si le compte existe déjà (même inactif) → **réactivation + changement de profil**.
- Règle **BR-GPU-3** : choix du profil limité à **Référent (3), Référent adjoint (7),
  Négociateur (4)** ; les choix **GIGN (1)** et **OMS (6)** n'apparaissent que pour un utilisateur
  GIGN. (`add-user.component.html`, `update-user.component.html`)

### 7.3 Modification / suppression

- Modifiables : **profil**, **téléphone personnel** (regex FR/international validée côté client,
  cf. `update-user.component#update`), **commentaire**. Les téléphones fixe/pro/NEO sont lus du
  RPSI et non éditables.
- Le profil GIGN/OMS n'est pas modifiable par un référent régional.
- Règle **BR-GPU-4** : la suppression est **logique** (`bool_user_inactif`) ; confirmation modale
  affichant la fiche de l'agent.

### 7.4 Compte personnel (en-tête applicatif)

- L'utilisateur déclare l'**appareil à géolocaliser** : liste de ses lignes NEO récupérée chez
  REMOP (`GET /service/listTelUser/:nigend`), choix « aucun » possible ; l'enregistrement
  (`PUT /users/infoDeviceUser`) positionne `geoloc_id_geoloc` et calcule `geoloc_indicatif`
  (BR-REF-2). Un utilisateur inconnu → RNI-1003.
- Deux interrupteurs (`PUT /users/activateLocation`) : géolocalisation (toujours) et
  géolocalisation en Indisponible, selon `isIndispo` — accessibles à tous les profils
  (`bypassPutUserForLocation`).
- L'onglet profil affiche identité (displayname venant du SSO : `cn`/`title`), unité, profil,
  région.

---

## 8. Services techniques, exploitation et exigences non fonctionnelles

| Domaine | Exigence reconstituée | Source |
|---|---|---|
| Santé | `GET /service` (API + infos base) et `GET /service/alive` (`SELECT 'Base RNI OK'`) ; page `/testvie` testant API, base, Facade, GEOLOC, REMOP ; `alive` sans journalisation splunk. | `service.controller.ts`, `alive.component.ts` |
| Configuration | Toute URL/token externe vit dans `t_param_app` (jamais en dur côté API) ; `GET /service/configuration?idConfig=`. | `service.controller.ts`, scripts SQL `docs/{preprod,prod}` |
| Sécurité transport | Calls HTTPS sortants avec CA interne (`NODE_EXTRA_CA_CERTS`) ; proxy facade `10.227.8.46` ; jetons transmis en en-tête `Token` vers REMOP/GEOLOC, dans l'URL vers la Facade. | `service.controller.ts` |
| Performances / données | Le périmètre géographique est appliqué **côté API** pour la géoloc/planning ; le filtrage région des fiches de crise est **côté client** (l'endpoint renvoie tout) — à reprendre en refonte. | `planning.controller.ts`, `formulaire.controller.ts` |
| Fuseaux | Toute calcul « en cours » respecte `dept_time_zone_database` du département (outre-mer : décalage du créneau). | `queryList.ts#getPlanningGeojsonQuery`, `v_sum_services` |
| Exploitation | API sous pm2 (`rni-api`, Node 22), backups `/var/backups/rni-api`, déploiement par tag GitLab (rsync + npm ci registre interne) ; client sur Nginx. | `deploy/PROCEDURE-DEPLOIEMENT.md`, `install.sh`, `.gitlab-ci.yml` |
| Ergonomie | Responsive (breakpoint 1038 px), notifications ng-zorro, mesures d'audience Matomo, mentions légales PDF. | `app.component.ts`, `header.component.ts` |
| Comptes de test | Mode `NODE_ENV=local` : injection d'un utilisateur factice par en-têtes (interdit hors dev). | `middlewares/headers.ts` |

---

## 9. Dette technique / points d'attention pour une reprise

1. **Requêtes SQL par concaténation de chaînes** (dates, nigend, ids issus de l'URL dans
   `queryList.ts`, `region.controller.ts`) → risque d'**injection SQL** ; à convertir en requêtes
   paramétrées.
2. `PlanningCtrl.insertPlanning` : découpes créées dans un `forEach(async …)` alors que les
   transactions (`t`, `t2`) sont committées immédiatement → **course/race** possible et
   atomicité de la scission non garantie. Le découpage (suppression avant contrôle RNI-1008) est
   aussi fragile.
3. Incohérence d'habilitation du **profil 5** : bloqué dans le module `/formulaire` côté client
   mais autorisé en écriture sur `/formulaire` par le middleware.
4. Filtre région des **fiches de crise** effectué côté client uniquement ; paramètre `region`
   ignoré par `GET /formulaire`.
5. **Endpoints morts** : le client référence `/users/negociateur` et un service `/crise`
   inexistants dans l'API ; `CriseService` non utilisé (point de crise devenu local à la carte) ;
   colonne `planning.annee_mois` non alimentée/exploitée.
6. Numéro de **permanence GIGN en dur** dans le header client (`+33 6 12 12 12 12`) ; à remonter
   en paramétrage (`t_param_app`).
7. `getAllPositionService` ignore `is_actif` côté API (le tri/filtrage actif n'existe que côté
   client) ; contrôle d'unicité BR-PLA-5 dépend de la chaîne `YYYYMMDD||créneau` (fragile si les
   bornes sont strictement identiques aux deux bouts — à couvrir par tests).
8. Aucun test automatisé API (`npm test` = placeholder), client sans tests de règles métier ; pas
   de pagination des listes.
9. Échappement maison des apostrophes d'adresse (BR-PLA-6) au lieu d'un usage paramétré.
10. Journalisation d'erreurs **dans la base** : si PostgreSQL tombe, l'`errorHandler` ne peut ni
    logger ni répondre correctement (retour 400 implicite).

---

## 10. Récapitulatif des règles métier (index)

| ID | Règle | Module |
|---|---|---|
| BR-AUTH-1..6 | Authentification par SSO/en-têtes, 401, isAdmin = {1,3,7}, périmètre régional + voisinages | Transverse |
| BR-SEC-1..4 | Audit Splunk, journal d'erreurs en base, traçabilité des écritures, mentions légales | Transverse |
| BR-REF-1..3 | Suppression logique des comptes, indicatif géoloc `RNI0xxxxx`, géoloc indisponible optionnelle | Référentiel |
| BR-CAR-1..7 | Fonds via Facade, priorité des positions, gris = sans planning, clusters, point de crise, isochrones 30/60/90, crise éphémère | Carte |
| BR-PLA-1..11 | Demi-cases Jour/Nuit, troncature mensuelle, borne M-1, interdiction Alerte/Formateur au négociateur, non-chevauchement, adresse unité par défaut, auto-service restreint, suppression physique, insertion incluse, scission en 3, position obligatoire | Planning |
| BR-FOR-1..8 | Accès par profil, périmètre régional, tout obligatoire + notes défaut 0, auteur-propriétaire, clôture irréversible, même auteur clôture/suppression, suppression physique, export PDF sélectif | Formulaire |
| BR-GPU-1..4 | Liste filtrée profils/actifs, création depuis RPSI (réactivation), profils GIGN/OMS réservés, téléphones RPSI non éditables, suppression logique | Personnel |

---

*Analyse produite à partir des fichiers : `src/db/models/*`, `src/server/controllers/*`,
`src/server/routes/*`, `src/server/public/**` (API) ; `src/app/{guards,services,interfaces}/*`,
`src/app/components/{carto,planning*,formulaire*,users*,header,alive,delete-user,unauthorized}/*`
(client) ; scripts SQL `docs/{preprod,prod}/v1-9-*.sql`, procédures de déploiement et historiques Git
des deux dépôts.*
