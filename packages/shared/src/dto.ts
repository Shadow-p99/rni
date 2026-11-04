/**
 * Contrats d'échange API ↔ client.
 */
import type { FormulaireContent } from './formulaire.js';
import type { Perimetre, PerimetreModule } from './profils.js';

export interface PositionServiceDto {
  id_pos_service: number;
  libelle: string;
  color: string;
  is_actif: boolean;
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
  is_admin: boolean;
  is_super_admin: boolean;
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
