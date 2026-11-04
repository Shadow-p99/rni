import {
  Creneau,
  PlageBounds,
  dayNumber,
  isCreneau,
  isIsoDate,
  localDateIso,
  plageSlots,
  slotsToPlage,
} from './creneaux.js';
import { ErrorCode } from './errors.js';
import { isRestrictedFor } from './positions.js';

export interface RuleViolation {
  code: ErrorCode;
  message: string;
}

/** BR-PLA-3 : borne minimale = premier jour du mois précédent (M-1). */
export function minPlanningDate(today: Date = new Date()): string {
  return localDateIso(new Date(today.getFullYear(), today.getMonth() - 1, 1));
}

/**
 * BR-PLA-3 : contrôles de cohérence d'une plage (dates obligatoires, ordre, borne M-1,
 * interdiction « même jour, début Nuit / fin Jour »). Partagé client / API.
 */
export function validatePlageBounds(p: Partial<PlageBounds>, today: Date = new Date()): RuleViolation | null {
  if (!p.date_debut || !p.date_fin || p.id_creneaux_debut == null || p.id_creneaux_fin == null) {
    return { code: ErrorCode.PARAMETRE_MANQUANT, message: 'Les dates et créneaux de début et de fin sont obligatoires.' };
  }
  if (!isIsoDate(p.date_debut) || !isIsoDate(p.date_fin)) {
    return { code: ErrorCode.PARAMETRE_INVALIDE, message: 'Format de date invalide (AAAA-MM-JJ attendu).' };
  }
  if (!isCreneau(p.id_creneaux_debut) || !isCreneau(p.id_creneaux_fin)) {
    return { code: ErrorCode.PARAMETRE_INVALIDE, message: 'Créneau invalide (1 = Jour, 2 = Nuit).' };
  }
  if (dayNumber(p.date_fin) < dayNumber(p.date_debut)) {
    return { code: ErrorCode.PARAMETRE_INVALIDE, message: 'La date de fin doit être postérieure ou égale à la date de début.' };
  }
  if (
    p.date_debut === p.date_fin &&
    p.id_creneaux_debut === Creneau.NUIT &&
    p.id_creneaux_fin === Creneau.JOUR
  ) {
    return { code: ErrorCode.PARAMETRE_INVALIDE, message: 'Un même jour ne peut pas commencer de Nuit et finir de Jour.' };
  }
  if (dayNumber(p.date_debut) < dayNumber(minPlanningDate(today))) {
    return {
      code: ErrorCode.INSERTION_INTERDITE,
      message: 'La date de début ne peut pas être antérieure au premier jour du mois précédent.',
    };
  }
  return null;
}

/** BR-PLA-4 : un négociateur ne peut ni poser ni sortir une position Alerte / Formateur. */
export function checkPositionAllowed(
  profil: number,
  newPosition: number | null | undefined,
  previousPosition?: number | null,
): RuleViolation | null {
  if (isRestrictedFor(profil, newPosition) || isRestrictedFor(profil, previousPosition)) {
    return {
      code: ErrorCode.ACTION_NON_AUTORISEE,
      message: 'Les positions Alerte et Formateur sont réservées aux référents et au GIGN.',
    };
  }
  return null;
}

export interface PlageWithPosition extends PlageBounds {
  id_pos_service: number;
}

export interface InsertionPiece extends PlageWithPosition {
  role: 'avant' | 'insertion' | 'apres';
}

export type InsertionResult =
  | { ok: true; pieces: InsertionPiece[] }
  | { ok: false; violation: RuleViolation };

/**
 * BR-PLA-9 / BR-PLA-10 / BR-PLA-11 : scission d'une plage existante par une insertion.
 * L'insertion doit être strictement incluse (créneaux inclus) et différente de l'initiale ;
 * la plage initiale est remplacée par au plus 3 plages contiguës.
 */
export function computeInsertion(
  outer: PlageWithPosition,
  inner: PlageWithPosition,
  today: Date = new Date(),
): InsertionResult {
  const bounds = validatePlageBounds(inner, today);
  if (bounds) return { ok: false, violation: bounds };

  const o = plageSlots(outer);
  const i = plageSlots(inner);
  if (i.start < o.start || i.end > o.end) {
    return {
      ok: false,
      violation: { code: ErrorCode.INSERTION_HORS_BORNES, message: "L'insertion doit être incluse dans la plage initiale." },
    };
  }
  if (i.start === o.start && i.end === o.end) {
    return {
      ok: false,
      violation: {
        code: ErrorCode.INSERTION_INTERDITE,
        message: "La plage insérée est identique à la plage initiale : modifiez directement le planning.",
      },
    };
  }
  if (inner.id_pos_service === outer.id_pos_service) {
    return {
      ok: false,
      violation: { code: ErrorCode.INSERTION_INTERDITE, message: 'Veuillez changer la disponibilité.' },
    };
  }

  const pieces: InsertionPiece[] = [];
  if (i.start > o.start) {
    pieces.push({ ...slotsToPlage(o.start, i.start - 1), id_pos_service: outer.id_pos_service, role: 'avant' });
  }
  pieces.push({ ...slotsToPlage(i.start, i.end), id_pos_service: inner.id_pos_service, role: 'insertion' });
  if (i.end < o.end) {
    pieces.push({ ...slotsToPlage(i.end + 1, o.end), id_pos_service: outer.id_pos_service, role: 'apres' });
  }
  return { ok: true, pieces };
}

/** BR-PLA-2 : troncature d'une plage aux bornes d'une fenêtre de créneaux. */
export function clipPlage(p: PlageBounds, windowStart: number, windowEnd: number): PlageBounds | null {
  const s = plageSlots(p);
  const start = Math.max(s.start, windowStart);
  const end = Math.min(s.end, windowEnd);
  return start > end ? null : slotsToPlage(start, end);
}

export interface RemainingPiece extends PlageWithPosition {
  role: 'avant' | 'apres';
}

/**
 * Écrasement (saisie sur une période déjà planifiée) : parties d'une plage existante conservées
 * hors de la période [start, end] (index de créneaux). Vide si la plage est entièrement recouverte.
 */
export function splitAround(existing: PlageWithPosition, start: number, end: number): RemainingPiece[] {
  const o = plageSlots(existing);
  const out: RemainingPiece[] = [];
  if (o.start < start) out.push({ ...slotsToPlage(o.start, Math.min(o.end, start - 1)), id_pos_service: existing.id_pos_service, role: 'avant' });
  if (o.end > end) out.push({ ...slotsToPlage(Math.max(o.start, end + 1), o.end), id_pos_service: existing.id_pos_service, role: 'apres' });
  return out;
}
