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
}

export const PROFIL_LIBELLES: Record<Profil, string> = {
  [Profil.GIGN]: 'GIGN',
  [Profil.LECTURE_SEULE]: 'Lecture seule',
  [Profil.REFERENT]: 'Référent',
  [Profil.NEGOCIATEUR]: 'Négociateur',
  [Profil.FICHE_CRISE]: 'Fiche de crise',
  [Profil.OMS]: 'OMS',
  [Profil.REFERENT_ADJOINT]: 'Référent adjoint',
};

/** BR-AUTH-5 : profils « admin » au sens applicatif (accès /gestion, droits étendus). */
export const ADMIN_PROFILS: readonly Profil[] = [Profil.GIGN, Profil.REFERENT, Profil.REFERENT_ADJOINT];

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

/** BR-GPU-3 : profils réservés au GIGN dans la gestion du personnel. */
export const GIGN_ONLY_PROFILS: readonly Profil[] = [Profil.GIGN, Profil.OMS];

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
  if (current === Profil.GIGN) return [...REGIONAL_ASSIGNABLE_PROFILS, ...GIGN_ONLY_PROFILS];
  if (isAdminProfil(current)) return [...REGIONAL_ASSIGNABLE_PROFILS];
  return [];
}

/** BR-GPU-1 : profils listés dans la gestion du personnel. */
export function listableProfils(current: number): Profil[] {
  return current === Profil.GIGN
    ? [Profil.GIGN, Profil.REFERENT, Profil.NEGOCIATEUR, Profil.OMS, Profil.REFERENT_ADJOINT]
    : [...PLANNING_PROFILS];
}

/**
 * BR-AUTH-6 : nature du périmètre géographique.
 *  - `national` : toute la France (GIGN, lecture seule technique) ;
 *  - `region+voisines` : région + régions limitrophes (3, 4, 5, 7) ;
 *  - `region` : région seule (OMS).
 */
export type Perimetre = 'national' | 'region+voisines' | 'region';

export function perimetreOf(id: number): Perimetre {
  if (id === Profil.GIGN || id === Profil.LECTURE_SEULE) return 'national';
  if (id === Profil.OMS) return 'region';
  return 'region+voisines';
}
