import { Creneau, NO_PLANNING_COLOR, TimetablePlanningDto, dayNumber, plageSlots, toSlot } from '@rni/shared';

export interface HalfCell {
  date: string;
  creneau: Creneau;
  /** Index de créneau (cf. @rni/shared) : sert à la sélection par glisser. */
  slot: number;
  planning: TimetablePlanningDto | null;
  color: string;
}

export interface DayCell {
  date: string;
  day: number;
  weekend: boolean;
  today: boolean;
  jour: HalfCell;
  nuit: HalfCell;
  /** Même plage sur le Jour et la Nuit → case entière (BR-PLA-1). */
  full: boolean;
}

/**
 * BR-PLA-1 : une journée = deux demi-cases (haut = Jour 08h-18h, bas = Nuit 18h-08h),
 * colorées selon la position de service ; vide = gris clair.
 */
export function buildCells(
  plannings: TimetablePlanningDto[],
  days: string[],
  colorOf: (idPos: number) => string,
  today: string,
): DayCell[] {
  const bySlot = new Map<number, TimetablePlanningDto>();
  for (const p of plannings) {
    const { start, end } = plageSlots(p.affiche);
    for (let s = start; s <= end; s++) bySlot.set(s, p);
  }
  const half = (date: string, creneau: Creneau): HalfCell => {
    const slot = toSlot(date, creneau);
    const planning = bySlot.get(slot) ?? null;
    return { date, creneau, slot, planning, color: planning ? colorOf(planning.id_pos_service) : '' };
  };
  return days.map((date) => {
    const jour = half(date, Creneau.JOUR);
    const nuit = half(date, Creneau.NUIT);
    const wd = new Date(dayNumber(date) * 86_400_000).getUTCDay();
    return {
      date,
      day: Number(date.slice(8, 10)),
      weekend: wd === 0 || wd === 6,
      today: date === today,
      jour,
      nuit,
      full: !!jour.planning && jour.planning === nuit.planning,
    };
  });
}

/** Plage couvrant un créneau donné (filtre « jour en cours »). */
export function planningAt(plannings: TimetablePlanningDto[], slot: number): TimetablePlanningDto | null {
  return plannings.find((p) => {
    const s = plageSlots(p);
    return s.start <= slot && s.end >= slot;
  }) ?? null;
}

export { NO_PLANNING_COLOR };
