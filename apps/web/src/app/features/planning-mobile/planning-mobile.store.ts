import { Injectable, computed, inject, signal } from '@angular/core';
import { Creneau, MobileDayCountsDto, PlanningDetailDto, currentSlotBound, dateRange, localDateIso, monthBounds, toSlot } from '@rni/shared';
import { PlanningApi } from '../../core/api/planning.api';
import { ReferentielService } from '../../core/referentiel/referentiel.service';
import { AsyncState } from '../../core/state/async-state';

export interface CalendarDay {
  date: string;
  day: number;
  counts: { id: number; n: number; color: string }[];
}

/** Planning mobile (§5.4) : compteurs mensuels et liste du créneau sélectionné. */
@Injectable()
export class PlanningMobileStore {
  private readonly api = inject(PlanningApi);
  private readonly ref = inject(ReferentielService);

  readonly today = localDateIso(new Date());
  private readonly now = currentSlotBound(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);

  readonly month = signal(this.today.slice(0, 7));
  readonly region = signal<number | null>(null);
  /** Créneau courant par défaut (bascule à 8h / 18h). */
  readonly creneau = signal<Creneau>(this.now.creneau);
  readonly selectedDate = signal(this.now.date);
  readonly positions = signal<Set<number>>(new Set([1, 3, 4]));
  readonly counts = new AsyncState<MobileDayCountsDto[]>([]);
  readonly day = new AsyncState<PlanningDetailDto[]>([]);

  readonly calendar = computed<CalendarDay[]>(() => {
    const byDate = new Map(this.counts.data().map((c) => [c.date, c]));
    const { first, last } = monthBounds(this.month());
    const cr = this.creneau();
    const pos = [...this.positions()].sort();
    return dateRange(first, last).map((date) => {
      const total = byDate.get(date)?.creneaux[cr]?.total ?? {};
      return {
        date,
        day: Number(date.slice(8)),
        counts: pos.map((id) => ({ id, n: total[id] ?? 0, color: this.ref.color(id) })).filter((c) => c.n > 0),
      };
    });
  });

  /** Décalage du premier jour (semaine commençant le lundi). */
  readonly padding = computed(() => (new Date(`${this.month()}-01T12:00:00`).getDay() + 6) % 7);

  readonly dayList = computed(() => {
    const slot = toSlot(this.selectedDate(), this.creneau());
    const pos = this.positions();
    return this.day
      .data()
      .filter((p) => toSlot(p.date_debut, p.id_creneaux_debut) <= slot && toSlot(p.date_fin, p.id_creneaux_fin) >= slot && pos.has(p.id_pos_service))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  });

  loadAll(): void {
    void this.loadCounts();
    void this.loadDay();
  }

  loadCounts(): Promise<unknown> {
    const { first, last } = monthBounds(this.month());
    const region = this.region();
    return this.counts.load(() => this.api.mobileCounts(first, last, region, { silent: true }));
  }

  loadDay(): Promise<unknown> {
    const date = this.selectedDate();
    const region = this.region();
    return this.day.load(() => this.api.byDate(date, region, { silent: true }));
  }

  setMonth(month: string): void {
    this.month.set(month);
    void this.loadCounts();
  }

  setRegion(region: number | null): void {
    this.region.set(region);
    this.loadAll();
  }

  selectDay(date: string): void {
    this.selectedDate.set(date);
    void this.loadDay();
  }
}
