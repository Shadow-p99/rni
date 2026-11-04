import { Injectable, computed, inject, signal } from '@angular/core';
import {
  PLANNING_SEARCH_MIN_CHARS,
  RegionCountsDto,
  TimetableDto,
  TimetableRegionDto,
  TimetableUserDto,
  currentSlot,
  dateRange,
  localDateIso,
  monthBounds,
} from '@rni/shared';
import { map } from 'rxjs';
import { PlanningApi } from '../../../core/api/planning.api';
import { AuthService } from '../../../core/auth/auth.service';
import type { AppError } from '../../../core/errors/app-error';
import { ReferentielService } from '../../../core/referentiel/referentiel.service';
import { AsyncState } from '../../../core/state/async-state';
import { DayCell, buildCells } from '../planning-cells';

export interface PlanningRow {
  user: TimetableUserDto;
  cells: DayCell[];
  /** En-tête de département à afficher avant la ligne. */
  departementHeader: string | null;
  editable: boolean;
}

export interface RegionView {
  id_region: number;
  libelle: string;
  /** Compteurs au créneau courant : toujours disponibles, même région repliée. */
  counts: RegionCountsDto | null;
  /** Effectif de la région (d'après les compteurs). */
  total: number | null;
  expanded: boolean;
  /** Données de la région chargées pour le mois affiché. */
  loaded: boolean;
  loading: boolean;
  pending: boolean;
  error: AppError | null;
  /** Nombre d'agents correspondant au filtre (mode filtré). */
  matches?: number;
  /** Lignes affichées (vide tant que la région n'est pas chargée). */
  rows: PlanningRow[];
}

const WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

/**
 * État du planning mensuel (§5.1).
 * - Sans filtre : personnels et plannings chargés **région par région, au dépliage** ; à l'ouverture
 *   seule la première région (la sienne) est chargée.
 * - Avec une recherche ou un filtre « Maintenant » : la recherche est faite **par l'API dans tout le
 *   périmètre** ; seules les régions ayant des résultats sont affichées, dépliées.
 * Les compteurs par position, légers, sont toujours chargés pour toutes les régions visibles.
 */
@Injectable()
export class PlanningDesktopStore {
  private readonly api = inject(PlanningApi);
  private readonly auth = inject(AuthService);
  private readonly ref = inject(ReferentielService);

  readonly today = localDateIso(new Date());
  /** « Jour en cours » : avant 8h / après 18h ⇒ créneau Nuit, sinon Jour. */
  readonly nowSlot = currentSlot(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);

  readonly month = signal(this.today.slice(0, 7));
  readonly counts = new AsyncState<RegionCountsDto[]>([]);
  readonly search = signal('');
  readonly positions = signal<Set<number>>(new Set());
  readonly expanded = signal<Set<number>>(new Set());

  /** Recherche effective (ignorée sous PLANNING_SEARCH_MIN_CHARS caractères). */
  readonly query = computed(() => {
    const q = this.search().trim();
    return q.length >= PLANNING_SEARCH_MIN_CHARS ? q : '';
  });
  readonly filterActive = computed(() => !!this.query() || this.positions().size > 0);
  /** Résultat de la recherche serveur. */
  readonly filtered = new AsyncState<TimetableDto | null>(null);
  /** Régions repliées manuellement dans les résultats filtrés. */
  private readonly filterCollapsed = signal<Set<number>>(new Set());
  readonly filterSummary = computed(() => (this.filterActive() ? (this.filtered.data()?.filter ?? null) : null));

  /** Régions visibles (BR-AUTH-6), la sienne en premier. */
  readonly regionList = computed(() => {
    const own = this.auth.user()?.id_region;
    return [...this.ref.regions()].sort((a, b) => Number(b.id_region === own) - Number(a.id_region === own));
  });

  /** Un état de chargement par région (créé une fois : les régions visibles sont connues à l'ouverture). */
  private readonly states = new Map<number, AsyncState<TimetableRegionDto | null>>();
  /** Mois pour lequel chaque région a été chargée. */
  private readonly loadedMonth = new Map<number, string>();

  readonly days = computed(() => {
    const { first, last } = monthBounds(this.month());
    return dateRange(first, last);
  });

  readonly dayHeaders = computed(() =>
    this.days().map((date) => {
      const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
      return { date, day: Number(date.slice(8)), letter: WEEKDAYS[wd], weekend: wd === 0 || wd === 6, today: date === this.today };
    }),
  );

  readonly regions = computed<RegionView[]>(() => (this.filterActive() ? this.filteredRegions() : this.lazyRegions()));

  private rowsOf(users: TimetableUserDto[], idRegion: number): PlanningRow[] {
    const days = this.days();
    const color = (id: number) => this.ref.color(id);
    let lastDep: string | null = null;
    return users.map((u) => {
      const dep = u.id_departement ? `${u.id_departement} — ${u.libelle_departement ?? ''}` : 'Sans département';
      const row: PlanningRow = {
        user: u,
        cells: buildCells(u.plannings, days, color, this.today),
        departementHeader: dep !== lastDep ? dep : null,
        editable: this.auth.canEditPlanningOf({ id_user: u.id_user, id_region: idRegion }),
      };
      lastDep = dep;
      return row;
    });
  }

  private totalOf(c: RegionCountsDto | null): number | null {
    return c ? Object.values(c.counts).reduce((s, n) => s + n, 0) + c.sans_planning : null;
  }

  /** Affichage normal : toutes les régions visibles, données chargées au dépliage. */
  private lazyRegions(): RegionView[] {
    const expanded = this.expanded();
    const counts = this.counts.data();
    return this.regionList().map((r) => {
      const state = this.state(r.id_region);
      const data = state.data();
      const c = counts.find((x) => x.id_region === r.id_region) ?? null;
      const open = expanded.has(r.id_region);
      return {
        id_region: r.id_region,
        libelle: r.libelle,
        counts: c,
        total: this.totalOf(c),
        expanded: open,
        loaded: !!data,
        loading: state.loading(),
        pending: state.pending(),
        error: state.error(),
        rows: data && open ? this.rowsOf(data.users, r.id_region) : [],
      };
    });
  }

  /** Résultats filtrés : seules les régions ayant des agents correspondants (dépliées). */
  private filteredRegions(): RegionView[] {
    const data = this.filtered.data();
    if (!data) return [];
    const counts = this.counts.data();
    const collapsed = this.filterCollapsed();
    const order = new Map(this.regionList().map((r, i) => [r.id_region, i]));
    return [...data.regions]
      .sort((a, b) => (order.get(a.id_region) ?? 99) - (order.get(b.id_region) ?? 99))
      .map((r) => {
        const c = counts.find((x) => x.id_region === r.id_region) ?? null;
        const open = !collapsed.has(r.id_region);
        return {
          id_region: r.id_region,
          libelle: r.libelle,
          counts: c,
          total: this.totalOf(c),
          matches: r.users.length,
          expanded: open,
          loaded: true,
          loading: false,
          pending: false,
          error: null,
          rows: open ? this.rowsOf(r.users, r.id_region) : [],
        };
      });
  }

  /** Au moins une région dépliée et chargée (export PDF possible). */
  readonly hasData = computed(() => this.regions().some((r) => r.expanded && r.loaded));

  private state(id: number): AsyncState<TimetableRegionDto | null> {
    let s = this.states.get(id);
    if (!s) this.states.set(id, (s = new AsyncState<TimetableRegionDto | null>(null)));
    return s;
  }

  /** Ouverture de la page : compteurs de toutes les régions + première région dépliée et chargée. */
  init(): void {
    for (const r of this.regionList()) this.state(r.id_region);
    const first = this.regionList()[0];
    if (first) this.expanded.set(new Set([first.id_region]));
    void this.loadCounts();
    this.loadExpanded();
  }

  loadCounts(): Promise<unknown> {
    // Compteurs secondaires : leur échec n'empêche pas l'affichage du planning.
    return this.counts.load(() => this.api.regionCounts({ silent: true }));
  }

  /** Charge (ou recharge) les données d'une région pour le mois affiché. */
  loadRegion(id: number): Promise<unknown> {
    const month = this.month();
    return this.state(id)
      .load(() =>
        this.api
          .timetable(month, id, { silent: true })
          .pipe(map((tt) => tt.regions.find((r) => r.id_region === id) ?? { id_region: id, libelle: '', users: [] })),
      )
      .then((region) => {
        if (region) this.loadedMonth.set(id, month);
        return region;
      });
  }

  /** Recharge les régions dépliées (changement de mois, après une saisie). */
  loadExpanded(): void {
    for (const id of this.expanded()) void this.loadRegion(id);
  }

  /** Après une saisie : compteurs, régions dépliées et résultats filtrés. */
  refresh(): void {
    void this.loadCounts();
    this.loadExpanded();
    if (this.filterActive()) void this.loadFiltered();
  }

  /** Recherche serveur dans tout le périmètre. */
  loadFiltered(): Promise<unknown> {
    const month = this.month();
    const filter = { q: this.query() || undefined, positions: [...this.positions()] };
    return this.filtered.load(() => this.api.timetable(month, null, { silent: true }, filter));
  }

  /** Recherche (déjà différée par le champ de saisie). */
  setSearch(q: string): void {
    const before = this.query();
    this.search.set(q);
    if (this.query() !== before) this.applyFilter();
  }

  setPositions(positions: Set<number>): void {
    this.positions.set(positions);
    this.applyFilter();
  }

  clearFilters(): void {
    this.search.set('');
    this.positions.set(new Set());
    this.applyFilter();
  }

  private applyFilter(): void {
    this.filterCollapsed.set(new Set());
    if (this.filterActive()) {
      void this.loadFiltered();
    } else {
      // Retour à l'affichage normal : les régions déjà chargées le restent (aucun nouvel appel).
      this.filtered.reset();
      for (const id of this.expanded()) if (this.loadedMonth.get(id) !== this.month() && !this.state(id).loading()) void this.loadRegion(id);
    }
  }

  setMonth(month: string): void {
    this.month.set(month);
    // Les régions repliées seront rechargées pour le nouveau mois à leur dépliage.
    for (const [id, s] of this.states) if (!this.expanded().has(id)) s.reset();
    this.loadedMonth.clear();
    if (this.filterActive()) void this.loadFiltered();
    else this.loadExpanded();
  }

  /** Dépliage : chargement à la demande (une seule fois par mois). */
  toggleRegion(id: number): void {
    if (this.filterActive()) {
      // Résultats filtrés : simple repli visuel, les données sont déjà là.
      const c = new Set(this.filterCollapsed());
      if (c.has(id)) c.delete(id);
      else c.add(id);
      this.filterCollapsed.set(c);
      return;
    }
    const s = new Set(this.expanded());
    if (s.has(id)) {
      s.delete(id);
      this.expanded.set(s);
      return;
    }
    s.add(id);
    this.expanded.set(s);
    const state = this.state(id);
    if (this.loadedMonth.get(id) !== this.month() && !state.loading()) void this.loadRegion(id);
  }
}
