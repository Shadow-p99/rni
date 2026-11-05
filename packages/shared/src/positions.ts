/** Positions de service livrées (`ref_pos_service`). Cf. §3.1. */
export enum PosService {
  DISPONIBLE = 1,
  INDISPONIBLE = 2,
  EN_SERVICE = 3,
  ALERTE = 4,
  FORMATEUR = 5,
}

/**
 * Libellés, couleurs, activation, caractère « restreint » (BR-PLA-4) et priorité de couleur des
 * clusters (BR-CAR-4) sont en base (`ref_pos_service`) et se règlent dans Administration ›
 * Positions. Repli du client si le référentiel n'est pas chargé :
 */
export const FALLBACK_POS_COLOR = '#64748b';

/** BR-CAR-3 : couleur par défaut d'un personnel sans planning (`rni.carte.couleur_sans_planning`). */
export const NO_PLANNING_COLOR = '#808080';
export const PARAM_COULEUR_SANS_PLANNING = 'rni.carte.couleur_sans_planning';
