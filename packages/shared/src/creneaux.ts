/**
 * Créneaux et arithmétique des plages de planning.
 *
 * Un créneau est soit le **Jour** (08h–18h), soit la **Nuit** (18h–08h le lendemain).
 * Pour fiabiliser les contrôles (dette §9.7), chaque couple (date, créneau) est converti en
 * un **index de créneau** entier : `jours depuis 1970-01-01 × 2 + (créneau − 1)`.
 * Une plage de planning couvre alors l'intervalle fermé `[slotDebut, slotFin]`.
 * La même formule est utilisée en base (colonnes générées `slot_debut` / `slot_fin`).
 */
export enum Creneau {
  JOUR = 1,
  NUIT = 2,
}

export const CRENEAU_LIBELLES: Record<Creneau, string> = {
  [Creneau.JOUR]: 'Jour (08h-18h)',
  [Creneau.NUIT]: 'Nuit (18h-08h)',
};

export const CRENEAU_COURT: Record<Creneau, string> = {
  [Creneau.JOUR]: 'Jour',
  [Creneau.NUIT]: 'Nuit',
};

/** Heure de début de chaque créneau (heure locale du département). */
export const HEURE_DEBUT_JOUR = 8;
export const HEURE_DEBUT_NUIT = 18;

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface SlotBound {
  /** Date au format `YYYY-MM-DD`. */
  date: string;
  creneau: Creneau;
}

export interface PlageBounds {
  date_debut: string;
  id_creneaux_debut: number;
  date_fin: string;
  id_creneaux_fin: number;
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function isCreneau(value: unknown): value is Creneau {
  return value === Creneau.JOUR || value === Creneau.NUIT;
}

/** Nombre de jours écoulés depuis le 1970-01-01 (UTC) pour une date `YYYY-MM-DD`. */
export function dayNumber(date: string): number {
  const m = ISO_DATE.exec(date);
  if (!m) throw new Error(`Date invalide : ${date}`);
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS);
}

export function dateFromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return dateFromDayNumber(dayNumber(date) + days);
}

export function toSlot(date: string, creneau: number): number {
  return dayNumber(date) * 2 + (creneau - 1);
}

export function fromSlot(slot: number): SlotBound {
  const day = Math.floor(slot / 2);
  return { date: dateFromDayNumber(day), creneau: (slot - day * 2 + 1) as Creneau };
}

export function plageSlots(p: PlageBounds): { start: number; end: number } {
  return { start: toSlot(p.date_debut, p.id_creneaux_debut), end: toSlot(p.date_fin, p.id_creneaux_fin) };
}

export function slotsToPlage(start: number, end: number): PlageBounds {
  const a = fromSlot(start);
  const b = fromSlot(end);
  return { date_debut: a.date, id_creneaux_debut: a.creneau, date_fin: b.date, id_creneaux_fin: b.creneau };
}

/** BR-PLA-5 : deux plages fermées se chevauchent-elles ? */
export function plagesOverlap(a: PlageBounds, b: PlageBounds): boolean {
  const x = plageSlots(a);
  const y = plageSlots(b);
  return x.start <= y.end && y.start <= x.end;
}

/** Composantes locales (date, heure) d'un instant dans un fuseau IANA. */
export function localParts(now: Date, timeZone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

/**
 * Créneau « en cours » à un instant donné, dans le fuseau du département (§8 Fuseaux) :
 * avant 08h → Nuit de la veille ; 08h–18h → Jour ; après 18h → Nuit du jour.
 */
export function currentSlotBound(now: Date, timeZone = 'Europe/Paris'): SlotBound {
  const { date, hour } = localParts(now, timeZone);
  if (hour < HEURE_DEBUT_JOUR) return { date: addDays(date, -1), creneau: Creneau.NUIT };
  if (hour < HEURE_DEBUT_NUIT) return { date, creneau: Creneau.JOUR };
  return { date, creneau: Creneau.NUIT };
}

export function currentSlot(now: Date, timeZone = 'Europe/Paris'): number {
  const b = currentSlotBound(now, timeZone);
  return toSlot(b.date, b.creneau);
}

/** Premier et dernier jour d'un mois `YYYY-MM`. */
export function monthBounds(month: string): { first: string; last: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m || +m[2] < 1 || +m[2] > 12) throw new Error(`Mois invalide : ${month}`);
  const y = +m[1];
  const mo = +m[2];
  const first = `${m[1]}-${m[2]}-01`;
  const last = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  return { first, last };
}

/** Liste des dates `YYYY-MM-DD` d'un intervalle fermé. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = dayNumber(from); d <= dayNumber(to); d++) out.push(dateFromDayNumber(d));
  return out;
}

/** `YYYYMMDD` ↔ `YYYY-MM-DD`. */
export function compactToIso(compact: string): string {
  if (!/^\d{8}$/.test(compact)) throw new Error(`Date compacte invalide : ${compact}`);
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

export function isoToCompact(iso: string): string {
  return iso.replaceAll('-', '');
}

/** Date locale `YYYY-MM-DD` (fuseau du navigateur ou fuseau IANA donné). */
export function todayIso(now = new Date(), timeZone?: string): string {
  return timeZone ? localParts(now, timeZone).date : localDateIso(now);
}

export function localDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Décalage (ms) du fuseau IANA par rapport à UTC à un instant donné. */
function zoneOffsetMs(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(at / 1000) * 1000;
}

/**
 * Instant du minuit local d'une date `YYYY-MM-DD` dans un fuseau IANA (changements d'heure
 * pris en compte) : bornes « du jour » des requêtes.
 */
export function zonedMidnight(date: string, timeZone = 'Europe/Paris'): Date {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - zoneOffsetMs(guess, timeZone);
  t = guess - zoneOffsetMs(t, timeZone);
  return new Date(t);
}

/** Minuit local du jour en cours (Europe/Paris par défaut). */
export function startOfLocalDay(now = new Date(), timeZone = 'Europe/Paris'): Date {
  return zonedMidnight(localParts(now, timeZone).date, timeZone);
}
