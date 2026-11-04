import { computed, signal } from '@angular/core';
import { PlageBounds, slotsToPlage } from '@rni/shared';

export interface SelectedRange {
  userId: number;
  /** Bornes ordonnées (index de créneaux, inclusives). */
  start: number;
  end: number;
}

/**
 * Sélection d'une période par glisser sur la ligne d'un agent : un point d'ancrage (créneau
 * de départ) et un créneau courant, sur une seule ligne. Indépendant du DOM (testable).
 */
export class RangeSelection {
  private readonly state = signal<{ userId: number; anchor: number; current: number } | null>(null);

  readonly active = computed(() => this.state() !== null);
  readonly range = computed<SelectedRange | null>(() => {
    const s = this.state();
    return s ? { userId: s.userId, start: Math.min(s.anchor, s.current), end: Math.max(s.anchor, s.current) } : null;
  });

  start(userId: number, slot: number): void {
    this.state.set({ userId, anchor: slot, current: slot });
  }

  /** Déplacement : ignoré hors de la ligne de départ. */
  move(userId: number, slot: number): void {
    const s = this.state();
    if (s && s.userId === userId && s.current !== slot) this.state.set({ ...s, current: slot });
  }

  /** Fin du glisser : renvoie la période sélectionnée (un seul créneau = simple clic). */
  end(): SelectedRange | null {
    const r = this.range();
    this.state.set(null);
    return r;
  }

  cancel(): void {
    this.state.set(null);
  }

  contains(userId: number, slot: number): boolean {
    const r = this.range();
    return !!r && r.userId === userId && slot >= r.start && slot <= r.end;
  }
}

/** Période sélectionnée sous forme de bornes de plage (dates + créneaux). */
export function rangeToPlage(r: SelectedRange): PlageBounds {
  return slotsToPlage(r.start, r.end);
}
