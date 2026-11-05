/**
 * Profils applicatifs livrés (`ref_profil`), cf. cahier des charges §2.2.
 * Les libellés, l'ordre, le port d'un planning et **tous les droits** sont en base et se règlent
 * dans Administration (Profils, Droits) ; d'autres profils peuvent y être créés. Seul le super
 * administrateur garde des protections codées (il ne peut pas se retirer l'administration).
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
  if (profil === Profil.GIGN || profil === Profil.SUPER_ADMIN) return 'national';
  if (!Object.values(Profil).includes(profil)) return 'region';
  if (module === 'planning') return 'region';
  if (profil === Profil.LECTURE_SEULE) return 'national';
  if (profil === Profil.OMS) return 'region';
  return 'region_voisines';
}

/** Profils dont le périmètre n'est pas modifiable (évite que le super administrateur se prive d'accès). */
export const LOCKED_PERIMETRE_PROFILS: readonly Profil[] = [Profil.SUPER_ADMIN];
