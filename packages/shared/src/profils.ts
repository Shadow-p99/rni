/**
 * Profils applicatifs (`ref_profil`).
 * Cf. cahier des charges §2.2.
 */
export enum Profil {
  /** Administrateur national. */
  GIGN = 1,
  /** Lecture seule technique (GET uniquement). */
  LECTURE_SEULE = 2,
  /** Référent régional. */
  REFERENT = 3,
  /** Négociateur. */
  NEGOCIATEUR = 4,
  /** Profil « fiche de crise » (historique). */
  FICHE_CRISE = 5,
  /** Observateur (OMS) : consultation de sa région seule. */
  OMS = 6,
  /** Référent adjoint (mêmes droits que le référent). */
  REFERENT_ADJOINT = 7,
  /** Super administrateur : droits du GIGN + paramétrage des périmètres de visualisation. */
  SUPER_ADMIN = 8,
}

export const PROFIL_LIBELLES: Record<Profil, string> = {
  [Profil.GIGN]: 'GIGN',
  [Profil.LECTURE_SEULE]: 'Lecture seule',
  [Profil.REFERENT]: 'Référent',
  [Profil.NEGOCIATEUR]: 'Négociateur',
  [Profil.FICHE_CRISE]: 'Fiche de crise',
  [Profil.OMS]: 'OMS',
  [Profil.REFERENT_ADJOINT]: 'Référent adjoint',
  [Profil.SUPER_ADMIN]: 'Super administrateur',
};

/** Administrateurs nationaux : GIGN et super administrateur (droits identiques hors paramétrage). */
export const NATIONAL_ADMIN_PROFILS: readonly Profil[] = [Profil.GIGN, Profil.SUPER_ADMIN];

export function isNationalAdmin(id: number | null | undefined): boolean {
  return id != null && NATIONAL_ADMIN_PROFILS.includes(id);
}

/** BR-AUTH-5 : profils « admin » au sens applicatif (accès /gestion, droits étendus). */
export const ADMIN_PROFILS: readonly Profil[] = [Profil.GIGN, Profil.REFERENT, Profil.REFERENT_ADJOINT, Profil.SUPER_ADMIN];

/** Profils portant un planning et apparaissant sur la carte / le planning. */
export const PLANNING_PROFILS: readonly Profil[] = [
  Profil.REFERENT,
  Profil.NEGOCIATEUR,
  Profil.REFERENT_ADJOINT,
];

/** BR-FOR-1 : profils exclus du module fiche de crise. */
export const FORMULAIRE_EXCLUDED_PROFILS: readonly Profil[] = [
  Profil.LECTURE_SEULE,
  Profil.FICHE_CRISE,
  Profil.OMS,
];

/** Profils en consultation seule (aucune écriture métier hors appareil/géolocalisation). */
export const READ_ONLY_PROFILS: readonly Profil[] = [Profil.LECTURE_SEULE, Profil.OMS, Profil.FICHE_CRISE];

/** BR-GPU-3 : profils réservés aux administrateurs nationaux dans la gestion du personnel. */
export const GIGN_ONLY_PROFILS: readonly Profil[] = [Profil.GIGN, Profil.OMS, Profil.SUPER_ADMIN];

/** BR-GPU-3 : profils attribuables par un référent / référent adjoint. */
export const REGIONAL_ASSIGNABLE_PROFILS: readonly Profil[] = [
  Profil.REFERENT,
  Profil.REFERENT_ADJOINT,
  Profil.NEGOCIATEUR,
];

export function isAdminProfil(id: number | null | undefined): boolean {
  return id != null && ADMIN_PROFILS.includes(id);
}

export function canAccessFormulaire(id: number | null | undefined): boolean {
  return id != null && !FORMULAIRE_EXCLUDED_PROFILS.includes(id);
}

/** Profils qu'un utilisateur donné peut attribuer (BR-GPU-3). */
export function assignableProfils(current: number): Profil[] {
  // Le profil super administrateur n'est attribuable que par un super administrateur.
  if (current === Profil.SUPER_ADMIN) return [...REGIONAL_ASSIGNABLE_PROFILS, Profil.GIGN, Profil.OMS, Profil.SUPER_ADMIN];
  if (current === Profil.GIGN) return [...REGIONAL_ASSIGNABLE_PROFILS, Profil.GIGN, Profil.OMS];
  if (isAdminProfil(current)) return [...REGIONAL_ASSIGNABLE_PROFILS];
  return [];
}

/** BR-GPU-1 : profils listés dans la gestion du personnel. */
export function listableProfils(current: number): Profil[] {
  return isNationalAdmin(current)
    ? [Profil.SUPER_ADMIN, Profil.GIGN, Profil.REFERENT, Profil.NEGOCIATEUR, Profil.OMS, Profil.REFERENT_ADJOINT]
    : [...PLANNING_PROFILS];
}

/**
 * BR-AUTH-6 : périmètre géographique, **paramétrable par profil et par module** (écran
 * Administration du super administrateur, table `t_perimetre_profil`).
 *  - `national` : toutes les régions ;
 *  - `region_voisines` : sa région + régions limitrophes ;
 *  - `region` : sa région seule.
 */
export type Perimetre = 'national' | 'region_voisines' | 'region';
export const PERIMETRES: readonly Perimetre[] = ['national', 'region_voisines', 'region'];
export const PERIMETRE_LIBELLES: Record<Perimetre, string> = {
  national: 'Toutes les régions',
  region_voisines: 'Sa région + régions limitrophes',
  region: 'Sa région seule',
};

/** Modules dont la visibilité géographique est paramétrable. */
export type PerimetreModule = 'carte' | 'planning';
export const PERIMETRE_MODULES: readonly PerimetreModule[] = ['carte', 'planning'];
export const PERIMETRE_MODULE_LIBELLES: Record<PerimetreModule, string> = { carte: 'Carte opérationnelle', planning: 'Planning' };

/**
 * Valeurs initiales (et de repli si la table est incomplète) :
 *  - carte : cahier des charges (GIGN et lecture seule nationaux, OMS sa région, autres + limitrophes) ;
 *  - planning : seul le GIGN voit toutes les régions, les autres profils leur région.
 * Le super administrateur est toujours national (non modifiable).
 */
export function defaultPerimetre(profil: number, module: PerimetreModule): Perimetre {
  if (isNationalAdmin(profil)) return 'national';
  if (module === 'planning') return 'region';
  if (profil === Profil.LECTURE_SEULE) return 'national';
  if (profil === Profil.OMS) return 'region';
  return 'region_voisines';
}

/** Profils dont le périmètre n'est pas modifiable (évite que le super administrateur se prive d'accès). */
export const LOCKED_PERIMETRE_PROFILS: readonly Profil[] = [Profil.SUPER_ADMIN];
