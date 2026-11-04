import { Injectable, computed, inject, signal } from '@angular/core';
import {
  RegionCountsDto,
  TimetableDto,
  TimetableRegionDto,
  TimetableUserDto,
  currentSlot,
  dateRange,
  localDateIso,
} from '@rni/shared';
import { PlanningApi } from '../../core/api/planning.api';
import { AuthService } from '../../core/auth/auth.service';
import { ReferentielService } from '../../core/referentiel/referentiel.service';
import { AsyncState } from '../../core/state/async-state';
import { SANS_PLANNING } from '../../shared/ui/position-filter';
import { DayCell, buildCells, planningAt } from './planning-cells';

export interface PlanningRow {
  user: TimetableUserDto;
  cells: DayCell[];
  /** En-tête de département à afficher avant la ligne. */
  departementHeader: string | null;
  editable: boolean;
}

export interface RegionView extends Omit<TimetableRegionDto, 'users'> {
  rows: PlanningRow[];
  counts: RegionCountsDto | null;
}

const WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

/** État du planning mensuel (§5.1) : mois, données, compteurs, filtres, sections repliées. */
@Injectable()
export class PlanningStore {
  private readonly api = inject(PlanningApi);
  private readonly auth = inject(AuthService);
  private readonly ref = inject(ReferentielService);

  readonly today = localDateIso(new Date());
  /** « Jour en cours » : avant 8h / après 18h ⇒ créneau Nuit, sinon Jour. */
  readonly nowSlot = currentSlot(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);

  readonly month = signal(this.today.slice(0, 7));
  readonly timetable = new AsyncState<TimetableDto | null>(null);
  readonly counts = new AsyncState<RegionCountsDto[]>([]);
  readonly search = signal('');
  readonly positions = signal<Set<number>>(new Set());
  readonly collapsed = signal<Set<number>>(new Set());
  private collapsedInit = false;

  readonly days = computed(() => {
    const d = this.timetable.data();
    return d ? dateRange(d.first, d.last) : [];
  });

  readonly dayHeaders = computed(() =>
    this.days().map((date) => {
      const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
      return { date, day: Number(date.slice(8)), letter: WEEKDAYS[wd], weekend: wd === 0 || wd === 6, today: date === this.today };
    }),
  );

  /** Régions (la sienne en premier) avec lignes filtrées et cellules calculées. */
  readonly regions = computed<RegionView[]>(() => {
    const d = this.timetable.data();
    if (!d) return [];
    const q = this.search().trim().toLowerCase();
    const filter = this.positions();
    const days = this.days();
    const color = (id: number) => this.ref.color(id);
    const own = this.auth.user()?.id_region;
    const counts = this.counts.data();
    return [...d.regions]
      .sort((a, b) => Number(b.id_region === own) - Number(a.id_region === own))
      .map(({ users, ...r }) => {
        let lastDep: string | null = null;
        const rows: PlanningRow[] = [];
        for (const u of users) {
          if (q && !`${u.nigend} ${u.nom} ${u.prenom} ${u.libelle_unite ?? ''}`.toLowerCase().includes(q)) continue;
          if (filter.size && !filter.has(planningAt(u.plannings, this.nowSlot)?.id_pos_service ?? SANS_PLANNING)) continue;
          const dep = u.id_departement ? `${u.id_departement} — ${u.libelle_departement ?? ''}` : 'Sans département';
          rows.push({
            user: u,
            cells: buildCells(u.plannings, days, color, this.today),
            departementHeader: dep !== lastDep ? dep : null,
            editable: this.auth.canEditPlanningOf({ id_user: u.id_user, id_region: r.id_region }),
          });
          lastDep = dep;
        }
        return { ...r, rows, counts: counts.find((c) => c.id_region === r.id_region) ?? null };
      });
  });

  async load(): Promise<void> {
    const month = this.month();
    const [data] = await Promise.all([
      this.timetable.load(() => this.api.timetable(month, null, { silent: true })),
      // Les compteurs sont secondaires : leur échec n'empêche pas l'affichage du planning.
      this.counts.load(() => this.api.regionCounts({ silent: true })),
    ]);
    if (data && !this.collapsedInit && data.regions.length > 1) {
      // Les régions autres que la sienne sont repliées par défaut
      const own = this.auth.user()?.id_region;
      if (own != null) this.collapsed.set(new Set(data.regions.filter((r) => r.id_region !== own).map((r) => r.id_region)));
      this.collapsedInit = true;
    }
  }

  setMonth(month: string): void {
    this.month.set(month);
    void this.load();
  }

  toggleRegion(id: number): void {
    const s = new Set(this.collapsed());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.collapsed.set(s);
  }
}
