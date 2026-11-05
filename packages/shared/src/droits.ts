/**
 * Droits applicatifs **paramétrables par profil** (écran Administration › Droits du super
 * administrateur, tables `ref_droit` et `t_profil_droit`).
 *
 * Le code ne connaît que les **codes** de droits : chacun correspond à un contrôle de l'API et de
 * l'interface. Les libellés, descriptions et portées proposées sont en base (`ref_droit`), les
 * attributions par profil aussi (`t_profil_droit`) : une ligne absente = droit refusé.
 */
export const Droit = {
  CARTE_VOIR: 'carte.voir',
  CARTE_GEOLOC: 'carte.geoloc',
  CARTE_ISOCHRONE: 'carte.isochrone',
  PLANNING_VOIR: 'planning.voir',
  PLANNING_ECRIRE: 'planning.ecrire',
  PLANNING_POSITIONS_RESTREINTES: 'planning.positions_restreintes',
  FORMULAIRE_VOIR: 'formulaire.voir',
  FORMULAIRE_CREER: 'formulaire.creer',
  FORMULAIRE_MODIFIER: 'formulaire.modifier',
  FORMULAIRE_CLOTURER: 'formulaire.cloturer',
  FORMULAIRE_SUPPRIMER: 'formulaire.supprimer',
  GESTION_ACCES: 'gestion.acces',
  ADMIN_ACCES: 'admin.acces',
} as const;

export type DroitCode = (typeof Droit)[keyof typeof Droit];

export const DROIT_CODES: readonly DroitCode[] = Object.values(Droit);

/**
 * Portée d'un droit accordé :
 *  - `oui` : droit simple (accordé / refusé) ;
 *  - `national` / `region` / `soi` : étendue géographique ou personnelle ;
 *  - `perimetre` / `auteur` : toutes les fiches visibles, ou seulement les siennes.
 */
export type Portee = 'oui' | 'national' | 'region' | 'soi' | 'perimetre' | 'auteur';

export const PORTEES: readonly Portee[] = ['oui', 'national', 'region', 'soi', 'perimetre', 'auteur'];

export const PORTEE_LIBELLES: Record<Portee, string> = {
  oui: 'Autorisé',
  national: 'Toutes les régions',
  region: 'Sa région',
  soi: 'Lui-même uniquement',
  perimetre: 'Toutes les fiches visibles',
  auteur: 'Ses propres fiches',
};

/** Droits accordés à un utilisateur (code → portée) ; un code absent = refusé. */
export type DroitsMap = Partial<Record<DroitCode, Portee>>;

export function hasDroit(droits: DroitsMap | null | undefined, code: DroitCode): boolean {
  return !!droits?.[code];
}

export function porteeOf(droits: DroitsMap | null | undefined, code: DroitCode): Portee | null {
  return droits?.[code] ?? null;
}

/** Modules regroupant les droits à l'écran. */
export const DROIT_MODULES = ['carte', 'planning', 'formulaire', 'gestion', 'admin'] as const;
export type DroitModule = (typeof DROIT_MODULES)[number];
export const DROIT_MODULE_LIBELLES: Record<DroitModule, string> = {
  carte: 'Carte opérationnelle',
  planning: 'Planning',
  formulaire: 'Fiches de crise',
  gestion: 'Gestion du personnel',
  admin: 'Administration',
};

/**
 * Droits que le super administrateur ne peut pas se retirer (il perdrait l'accès à l'écran qui
 * permet de les rendre).
 */
export const LOCKED_DROITS: readonly DroitCode[] = [Droit.ADMIN_ACCES];
