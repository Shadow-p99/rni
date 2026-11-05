/**
 * Contrats d'échange API ↔ client.
 */
import type { MessageType } from './errors.js';
import type { DroitCode, DroitModule, DroitsMap, Portee } from './droits.js';
import type { FieldKind, FormulaireContent, SectionId } from './formulaire.js';
import type { Perimetre, PerimetreModule } from './profils.js';

export interface PositionServiceDto {
  id_pos_service: number;
  libelle: string;
  color: string;
  is_actif: boolean;
  /** BR-PLA-4 : réservée aux profils ayant le droit `planning.positions_restreintes`. */
  is_restreinte: boolean;
  /** BR-CAR-4 : priorité de la couleur d'un cluster (1 = la plus forte), `null` = jamais. */
  priorite_cluster: number | null;
}

export interface CreneauDto {
  id_creneau: number;
  libelle: string;
}

export interface ProfilDto {
  id_profil: number;
  code: string | null;
  libelle: string;
  classement: number;
  /** Le profil porte un planning (apparaît sur la carte et le planning). */
  has_planning: boolean;
}

export interface RegionDto {
  id_region: number;
  libelle: string;
  center: { lat: number; lng: number; zoom: number } | null;
}

/** Utilisateur connecté (`GET /users/me`). */
export interface CurrentUserDto {
  id_user: number;
  nigend: string;
  grade: string | null;
  nom: string;
  prenom: string;
  displayname: string;
  code_unite: string | null;
  libelle_unite: string | null;
  id_profil: number;
  libelle_profil: string;
  id_region: number | null;
  libelle_region: string | null;
  /** Régions visibles sur le planning (BR-AUTH-6) ; `null` = national. */
  regions_visibles: number[] | null;
  /** Régions visibles par module ; `null` = national. */
  perimetres: Record<PerimetreModule, number[] | null>;
  /** Droits du profil (paramétrés dans Administration › Droits). */
  droits: DroitsMap;
  /** Profils listés dans la gestion du personnel. */
  profils_visibles: number[];
  /** Profils que l'utilisateur peut attribuer et dont il gère les comptes. */
  profils_gerables: number[];
  geoloc_id_geoloc: string | null;
  geoloc_indicatif: string | null;
  geoloc_bool_geoloc: boolean;
  geoloc_bool_indispo: boolean;
}

export interface UserDto {
  id_user: number;
  nigend: string;
  grade: string | null;
  abreviation_grade: string | null;
  nom: string;
  prenom: string;
  code_unite: string | null;
  libelle_unite: string | null;
  id_departement: string | null;
  tel_pro: string | null;
  tel_perso: string | null;
  tel_unite: string | null;
  numero_neo_1: string | null;
  numero_neo_2: string | null;
  id_profil: number;
  libelle_profil: string;
  id_region: number | null;
  libelle_region: string | null;
  commentaire: string | null;
}

/** Candidat RPSI (`v_personnel_to_ref_user`). */
export interface RpsiPersonnelDto {
  nigend: string;
  nom: string;
  prenom: string;
  grade: string | null;
  code_unite: string | null;
  libelle_unite: string | null;
  id_region: number | null;
  libelle_region: string | null;
  /** Compte RNI existant (actif ou non). */
  id_user: number | null;
  bool_user_inactif: boolean | null;
}

export interface CreateUserDto {
  nigend: string;
  id_profil: number;
}

export interface UpdateUserDto {
  id_profil?: number;
  tel_perso?: string | null;
  commentaire?: string | null;
}

export interface NeoLineDto {
  id: string;
  numero: string;
  libelle?: string;
}

export interface PlanningInputDto {
  nigend: string;
  date_debut: string;
  id_creneaux_debut: number;
  date_fin: string;
  id_creneaux_fin: number;
  id_pos_service: number;
  adresse_temp?: string | null;
  x_adresse_temp?: number | null;
  y_adresse_temp?: number | null;
  /**
   * Création uniquement : remplace les plannings existants sur la période (les parties hors
   * période sont conservées). Sans ce drapeau, un chevauchement est refusé (RNI-1005).
   */
  ecraser?: boolean;
}

export interface InsertPlanningDto extends PlanningInputDto {
  /** Plage existante à scinder. */
  id_planning: number;
}

export interface PlanningDto {
  id_planning: number;
  id_user: number;
  nigend: string;
  date_debut: string;
  id_creneaux_debut: number;
  date_fin: string;
  id_creneaux_fin: number;
  id_pos_service: number;
  adresse_temp: string | null;
  x_adresse_temp: number | null;
  y_adresse_temp: number | null;
}

/** Plage tronquée au mois affiché (BR-PLA-2), avec ses bornes réelles. */
export interface TimetablePlanningDto extends PlanningDto {
  affiche: { date_debut: string; id_creneaux_debut: number; date_fin: string; id_creneaux_fin: number };
}

export interface TimetableUserDto {
  id_user: number;
  nigend: string;
  grade: string | null;
  abreviation_grade: string | null;
  nom: string;
  prenom: string;
  id_profil: number;
  libelle_profil: string;
  code_unite: string | null;
  libelle_unite: string | null;
  id_departement: string | null;
  libelle_departement: string | null;
  plannings: TimetablePlanningDto[];
}

export interface TimetableRegionDto {
  id_region: number;
  libelle: string;
  users: TimetableUserDto[];
}

export interface TimetableDto {
  month: string;
  first: string;
  last: string;
  regions: TimetableRegionDto[];
  /**
   * Présent lorsque la requête est filtrée (`q` / `positions`) : seules les régions ayant des
   * résultats sont renvoyées, avec les seuls agents correspondants.
   */
  filter?: { matches: number; truncated: boolean };
}

/** Filtres serveur du calendrier (recherche dans tout le périmètre). */
export interface TimetableFilter {
  /** Nom, prénom, nigend, code ou libellé d'unité (plusieurs mots possibles). */
  q?: string;
  /** Positions au créneau courant (0 = sans planning). */
  positions?: number[];
}

/** Nombre minimal de caractères pour la recherche du planning. */
export const PLANNING_SEARCH_MIN_CHARS = 2;
/** Nombre maximal d'agents renvoyés par une recherche du planning (au-delà : affiner). */
export const MAX_PLANNING_MATCHES = 300;

/** Planning enrichi de l'identité de l'agent (endpoints de restitution par date). */
export interface PlanningDetailDto extends PlanningDto {
  grade: string | null;
  nom: string;
  prenom: string;
  id_profil: number;
  id_region: number | null;
  code_unite: string | null;
  libelle_unite: string | null;
}

export type AdresseType = 'unite' | 'temporaire' | 'localisation';

export interface PersonnelPointProperties {
  id_user: number;
  nigend: string;
  grade: string | null;
  nom: string;
  prenom: string;
  id_profil: number;
  code_unite: string | null;
  libelle_unite: string | null;
  id_region: number | null;
  id_planning: number | null;
  id_pos_service: number;
  libelle_pos_service: string;
  color: string;
  adresse: string | null;
  adresse_type: AdresseType;
  horodatage: string | null;
  numero_neo_1: string | null;
  numero_neo_2: string | null;
  tel_perso: string | null;
  tel_unite: string | null;
  tel_pro: string | null;
  commentaire: string | null;
}

export interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface Feature<G = GeoJsonPoint, P = Record<string, unknown>> {
  type: 'Feature';
  geometry: G;
  properties: P;
}

export interface FeatureCollection<G = GeoJsonPoint, P = Record<string, unknown>> {
  type: 'FeatureCollection';
  features: Feature<G, P>[];
}

export interface GeoJsonPolygon {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

export type PersonnelCollection = FeatureCollection<GeoJsonPoint, PersonnelPointProperties>;
export type IsochroneCollection = FeatureCollection<GeoJsonPolygon, { timebreak: number }>;

export interface GeocodeCandidate {
  address: string;
  x: number;
  y: number;
  score: number;
}

export interface RegionCountsDto {
  id_region: number;
  libelle: string;
  /** Compteurs par position de service au créneau courant. */
  counts: Record<number, number>;
  sans_planning: number;
}

export interface MobileDayCountsDto {
  date: string;
  creneaux: Record<number, { total: Record<number, number>; byRegion: Record<number, Record<number, number>> }>;
}

export type BaseLayerType = 'xyz' | 'wmts';

export interface BaseLayerDto {
  id: string;
  label: string;
  type: BaseLayerType;
  url: string;
  layer?: string;
  matrixSet?: string;
  format?: string;
  style?: string;
  attribution?: string;
  maxZoom?: number;
  visible?: boolean;
}

export interface FormulaireDto extends FormulaireContent {
  id_formulaire: number;
  id_user: number;
  auteur_nigend: string;
  auteur_nom: string;
  auteur_id_region: number | null;
  is_closed: boolean;
  created_at: string;
  updated_at: string;
  /** Actions permises à l'utilisateur sur cette fiche (droits et état), calculées par l'API. */
  can_modifier: boolean;
  can_cloturer: boolean;
  can_supprimer: boolean;
}

export interface FormulaireFilter {
  region?: number;
  closed?: boolean;
  from?: string;
  to?: string;
}

export interface AppInfoDto {
  name: string;
  version: string;
  environment: string;
  mockAuth: boolean;
  mockExternal: boolean;
  permanenceGign: string | null;
  database: { ok: boolean; name?: string; version?: string };
}

export interface AliveCheckDto {
  service: string;
  ok: boolean;
  durationMs: number;
  message?: string;
}

export interface MockUserDto {
  nigend: string;
  nom: string;
  prenom: string;
  id_profil: number;
  libelle_profil: string;
  libelle_region: string | null;
}

/** Ligne de l'écran Administration : périmètre de chaque module pour un profil. */
export interface PerimetreProfilDto {
  id_profil: number;
  libelle_profil: string;
  carte: Perimetre;
  planning: Perimetre;
  /** Non modifiable (super administrateur). */
  locked: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

export interface PerimetreUpdateDto {
  items: { id_profil: number; module: PerimetreModule; perimetre: Perimetre }[];
}

// -----------------------------------------------------------------------------
// Tableau de bord d'administration (supervision)
// -----------------------------------------------------------------------------

export type AppLogLevel = 'fatal' | 'error' | 'warn' | 'log' | 'debug' | 'verbose';

/** Ligne du journal applicatif conservé en base (`t_app_logs`). */
export interface AppLogDto {
  id_log: number;
  horodatage: string;
  niveau: AppLogLevel;
  contexte: string | null;
  message: string;
  pile: string | null;
  request_id: string | null;
  nigend: string | null;
  pid: number | null;
  hote: string | null;
}

export interface AppLogQuery {
  /** Niveau minimal affiché (error = erreurs seules, log = tout sauf debug…). */
  niveau?: AppLogLevel;
  contexte?: string;
  q?: string;
  request_id?: string;
  nigend?: string;
  /** Pagination : identifiants strictement inférieurs (défilement vers le passé). */
  avant?: number;
  limite?: number;
}

export interface AppLogPageDto {
  items: AppLogDto[];
  /** Contextes présents sur les dernières 24 h (filtre). */
  contextes: { contexte: string; nb: number }[];
  /** Plus ancien identifiant renvoyé (page suivante) ; null s'il n'y en a plus. */
  suivant: number | null;
}

export interface DashboardHourDto {
  heure: string;
  nb: number;
  nb_4xx: number;
  nb_5xx: number;
  moyenne_ms: number | null;
  max_ms: number;
}

export interface DashboardRouteDto {
  methode: string;
  route: string;
  nb: number;
  nb_5xx: number;
  moyenne_ms: number;
  max_ms: number;
  /** Borne supérieure approchée du 95e centile (ms) ; null au-delà de 3 s. */
  p95_ms: number | null;
  part_temps: number;
}

export interface ConnectedUserDto {
  nigend: string;
  grade: string | null;
  nom: string | null;
  prenom: string | null;
  libelle_profil: string | null;
  libelle_region: string | null;
  derniere_activite: string;
  derniere_route: string | null;
  nb_requetes_jour: number;
}

export interface AdminDashboardDto {
  genere_le: string;
  fenetre_connexion_min: number;
  kpis: {
    connectes: number;
    utilisateurs_jour: number;
    requetes_jour: number;
    requetes_par_minute: number;
    erreurs_jour: number;
    erreurs_5xx_jour: number;
    journal_erreurs_jour: number;
    avertissements_jour: number;
    refus_jour: number;
    lentes_jour: number;
    /** Seuil « lent » appliqué (rni.log.slow_ms). */
    seuil_lent_ms: number;
    temps_moyen_jour_ms: number | null;
    temps_moyen_heure_ms: number | null;
    p95_jour_ms: number | null;
    disponibilite_jour: number | null;
  };
  heures: DashboardHourDto[];
  routes: DashboardRouteDto[];
  connectes: ConnectedUserDto[];
  dernieres_erreurs: AppLogDto[];
  metier: {
    plannings_crees_jour: number;
    plannings_modifies_jour: number;
    comptes_actifs: number;
    comptes_par_profil: { libelle: string; nb: number }[];
    fiches_ouvertes: number;
    fiches_creees_jour: number;
  };
  systeme: {
    version: string;
    environnement: string;
    node: string;
    pid: number;
    hote: string;
    demarre_le: string;
    workers: number;
    memoire_mo: { rss: number; tas: number };
    cache: { entrees: number; taille_mo: number; taux_succes: number; ecoute: boolean };
    journalisation: { niveau: string; source: string; niveau_base: string; contextes: Record<string, string>; sql: boolean };
    base: { nom: string; taille_mo: number; connexions_api: number; version: string | null; migration: string | null };
    journal: { lignes: number; plus_ancien: string | null };
  };
}

// -----------------------------------------------------------------------------
// Réglages de journalisation (écran Administration)
// -----------------------------------------------------------------------------

export type LogThreshold = 'error' | 'warn' | 'log' | 'debug' | 'verbose';
export const LOG_THRESHOLDS: readonly LogThreshold[] = ['error', 'warn', 'log', 'debug', 'verbose'];
/** Seuil de conservation en base : verbose exclu (volume). */
export const LOG_DB_THRESHOLDS: readonly LogThreshold[] = ['error', 'warn', 'log', 'debug'];
/** Durées de validité proposées pour un réglage verbeux (minutes ; null = permanent). */
export const LOG_DURATIONS: readonly (number | null)[] = [15, 60, 240, null];
/** Nom de contexte (nom de service, HTTP, SQL…). */
export const LOG_CONTEXT_PATTERN = /^[A-Za-z][\w.-]{0,79}$/;
export const MAX_LOG_CONTEXTS = 30;

export interface LogContextLevel {
  contexte: string;
  niveau: LogThreshold;
}

/** Valeurs modifiables (formulaire). `level` vide = valeur par défaut du serveur (LOG_LEVEL). */
export interface LogSettingsValues {
  level: LogThreshold | '';
  contexts: LogContextLevel[];
  sql: boolean;
  slow_ms: number;
  db_level: LogThreshold;
  retention_days: number;
  metrics_retention_days: number;
}

export interface LogSettingsUpdateDto extends LogSettingsValues {
  /** Validité des réglages verbeux (niveau, contextes, SQL) en minutes ; null = permanent. */
  duree_min: number | null;
}

export interface LogSettingsDto {
  enregistre: LogSettingsValues & { expires_at: string | null; expire: boolean };
  /** Réglages effectivement appliqués par le processus qui a répondu. */
  applique: { pid: number; level: LogThreshold; source: 'base' | 'environnement'; contexts: Record<string, LogThreshold>; sql: boolean; slow_ms: number; db_level: string };
  /** Valeurs de l'environnement du serveur (LOG_LEVEL, PG_LOGGING). */
  defaut: { level: LogThreshold; sql: boolean };
  contextes_connus: string[];
  derniere_modification: { par: string; nom: string | null; le: string } | null;
}

// -----------------------------------------------------------------------------
// Paramétrage (Administration du super administrateur)
// -----------------------------------------------------------------------------

/** Droit du catalogue (`ref_droit`). */
export interface DroitDefDto {
  code: DroitCode;
  module: DroitModule;
  libelle: string;
  description: string | null;
  /** Portées proposées (`['oui']` pour un droit simple). */
  portees: Portee[];
  ordre: number;
}

export interface ProfilDroitsDto {
  id_profil: number;
  libelle: string;
  droits: DroitsMap;
  /** Droits non modifiables pour ce profil. */
  locked: DroitCode[];
  nb_utilisateurs: number;
}

export interface DroitsMatrixDto {
  catalogue: DroitDefDto[];
  profils: ProfilDroitsDto[];
  updated_at: string | null;
  updated_by: string | null;
}

export interface DroitsUpdateDto {
  /** `portee: null` = droit retiré. */
  items: { id_profil: number; code: DroitCode; portee: Portee | null }[];
}

export interface ProfilAdminDto extends ProfilDto {
  nb_utilisateurs: number;
  /** Profil livré (1 à 8) : non supprimable. */
  systeme: boolean;
  /** Profils listés / gérés dans la gestion du personnel par ce profil. */
  visibles: number[];
  gerables: number[];
}

export interface ProfilInputDto {
  libelle: string;
  code: string | null;
  classement: number;
  has_planning: boolean;
}

export interface ProfilCreateDto extends ProfilInputDto {
  /** Profil modèle dont les droits, périmètres et règles de gestion sont copiés. */
  modele: number | null;
}

export interface ProfilGestionUpdateDto {
  items: { id_profil: number; id_profil_cible: number; visible: boolean; gerable: boolean }[];
}

export interface PositionInputDto {
  libelle: string;
  color: string;
  is_actif: boolean;
  is_restreinte: boolean;
  priorite_cluster: number | null;
}

export interface TypeCriseDto {
  id_type_crise: number;
  libelle: string;
  ordre: number;
  is_actif: boolean;
}

export interface FormulaireSectionDto {
  id: SectionId;
  libelle: string;
  imprimable: boolean;
  ordre: number;
}

export interface FormulaireChampDto {
  key: string;
  label: string;
  section: SectionId;
  kind: FieldKind;
  required: boolean;
  ordre: number;
}

/** Structure de la fiche de crise (`GET /referentiel/formulaire`). */
export interface FormulaireConfigDto {
  crises: TypeCriseDto[];
  sections: FormulaireSectionDto[];
  champs: FormulaireChampDto[];
}

export interface FormulaireConfigUpdateDto {
  /** Liste complète des types (sans `id_type_crise` = nouveau). */
  crises: { id_type_crise?: number | null; libelle: string; is_actif: boolean }[];
  sections: { id: SectionId; libelle: string; imprimable: boolean }[];
  champs: { key: string; label: string; required: boolean; ordre: number }[];
}

/** Paramètre applicatif (`t_param_app`). */
export interface ParamAppDto {
  cle: string;
  /** Masquée (`null`) pour un secret. */
  valeur: string | null;
  description: string | null;
  is_front: boolean;
  secret: boolean;
  /** Réglé par un autre écran (ex. Journalisation) : lecture seule ici. */
  gere_par: string | null;
}

export interface ParamAppUpdateDto {
  cle: string;
  valeur: string;
}

export interface MessageDto {
  code_message: string;
  libelle: string;
  type: MessageType;
}
