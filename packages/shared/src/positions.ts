import { Profil, isAdminProfil } from './profils.js';

/** Positions de service (`ref_pos_service`). Cf. §3.1. */
export enum PosService {
  DISPONIBLE = 1,
  INDISPONIBLE = 2,
  EN_SERVICE = 3,
  ALERTE = 4,
  FORMATEUR = 5,
}

export const POS_SERVICE_LIBELLES: Record<PosService, string> = {
  [PosService.DISPONIBLE]: 'Disponible',
  [PosService.INDISPONIBLE]: 'Indisponible',
  [PosService.EN_SERVICE]: 'En service',
  [PosService.ALERTE]: 'Alerte',
  [PosService.FORMATEUR]: 'Formateur',
};

/** Couleurs par défaut (la source de vérité reste `ref_pos_service.color`). */
export const DEFAULT_POS_COLORS: Record<PosService, string> = {
  [PosService.DISPONIBLE]: '#16a34a',
  [PosService.INDISPONIBLE]: '#dc2626',
  [PosService.EN_SERVICE]: '#2563eb',
  [PosService.ALERTE]: '#f59e0b',
  [PosService.FORMATEUR]: '#9333ea',
};

/** BR-CAR-3 : couleur d'un personnel sans planning. */
export const NO_PLANNING_COLOR = '#808080';

/** BR-PLA-4 : positions réservées aux référents / GIGN / référents adjoints. */
export const RESTRICTED_POSITIONS: readonly PosService[] = [PosService.ALERTE, PosService.FORMATEUR];

/** BR-PLA-3 : positions proposées à un profil donné (avant filtrage `is_actif`). */
export function allowedPositionsFor(profil: number): PosService[] {
  const all = [
    PosService.DISPONIBLE,
    PosService.INDISPONIBLE,
    PosService.EN_SERVICE,
    PosService.ALERTE,
    PosService.FORMATEUR,
  ];
  return isAdminProfil(profil) ? all : all.filter((p) => !RESTRICTED_POSITIONS.includes(p));
}

export function isRestrictedFor(profil: number, position: number | null | undefined): boolean {
  return (
    profil === Profil.NEGOCIATEUR && position != null && RESTRICTED_POSITIONS.includes(position)
  );
}

/** BR-CAR-4 : priorité de couleur d'un cluster (Alerte puis Disponible). */
export const CLUSTER_COLOR_PRIORITY: readonly PosService[] = [PosService.ALERTE, PosService.DISPONIBLE];
