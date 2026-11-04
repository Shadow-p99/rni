import { DatePipe } from '@angular/common';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Creneau,
  RegionCountsDto,
  TimetableDto,
  TimetablePlanningDto,
  TimetableUserDto,
  currentSlot,
  dateRange,
  localDateIso,
} from '@rni/shared';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { PlanningApi } from '../../core/data.service';
import { exportElementToPdf } from '../../core/pdf';
import { ReferentielService } from '../../core/referentiel.service';
import { DayCell, HalfCell, buildCells, planningAt } from './planning-cells';
import { PlanningForm, PlanningFormInit } from './planning-form';

const WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
/** Filtre « sans planning » (position implicite). */
const NONE = 0;

interface Row {
  user: TimetableUserDto;
  cells: DayCell[];
  departementHeader: string | null;
}

/** Planning national : calendrier mensuel par région (§5.1). */
@Component({
  selector: 'rni-planning-page',
  imports: [FormsModule, DatePipe, PlanningForm],
  templateUrl: './planning-page.html',
})
export class PlanningPage {
  protected readonly auth = inject(AuthService);
  protected readonly ref = inject(ReferentielService);
  private readonly api = inject(PlanningApi);
  private readonly printEl = viewChild<ElementRef<HTMLElement>>('print');

  protected readonly month = signal(localDateIso(new Date()).slice(0, 7));
  protected readonly data = signal<TimetableDto | null>(null);
  protected readonly counts = signal<RegionCountsDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly collapsed = signal<Set<number>>(new Set());
  protected readonly search = signal('');
  /** Filtre par position au créneau courant ; vide = tous. */
  protected readonly posFilter = signal<Set<number>>(new Set());
  protected readonly form = signal<PlanningFormInit | null>(null);
  protected readonly exporting = signal(false);
  protected readonly NONE = NONE;

  protected readonly today = localDateIso(new Date());
  /** « Jour en cours » : avant 8h / après 18h ⇒ créneau Nuit, sinon Jour. */
  protected readonly nowSlot = currentSlot(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);

  protected readonly days = computed(() => {
    const d = this.data();
    return d ? dateRange(d.first, d.last) : [];
  });

  protected readonly dayHeaders = computed(() =>
    this.days().map((date) => {
      const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
      return { date, day: Number(date.slice(8)), letter: WEEKDAYS[wd], weekend: wd === 0 || wd === 6, today: date === this.today };
    }),
  );

  protected readonly regions = computed(() => {
    const d = this.data();
    if (!d) return [];
    const q = this.search().trim().toLowerCase();
    const filter = this.posFilter();
    const days = this.days();
    const color = (id: number) => this.ref.color(id);
    const own = this.auth.user()?.id_region;
    const ordered = [...d.regions].sort((a, b) => Number(b.id_region === own) - Number(a.id_region === own));
    return ordered.map((r) => {
      let lastDep: string | null = null;
      const rows: Row[] = [];
      for (const u of r.users) {
        if (q && !`${u.nigend} ${u.nom} ${u.prenom} ${u.libelle_unite ?? ''}`.toLowerCase().includes(q)) continue;
        if (filter.size) {
          const cur = planningAt(u.plannings, this.nowSlot);
          if (!filter.has(cur?.id_pos_service ?? NONE)) continue;
        }
        const dep = u.id_departement ? `${u.id_departement} — ${u.libelle_departement ?? ''}` : 'Sans département';
        rows.push({ user: u, cells: buildCells(u.plannings, days, color, this.today), departementHeader: dep !== lastDep ? dep : null });
        lastDep = dep;
      }
      return { ...r, rows, counts: this.counts().find((c) => c.id_region === r.id_region) ?? null };
    });
  });

  constructor() {
    void this.ref.load().then(() => this.load());
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [data, counts] = await Promise.all([
        firstValueFrom(this.api.timetable(this.month())),
        firstValueFrom(this.api.regionCounts()).catch(() => []),
      ]);
      this.data.set(data);
      this.counts.set(counts);
      // Les autres régions que la sienne sont repliées par défaut
      const own = this.auth.user()?.id_region;
      if (!this.collapsedInit && data.regions.length > 1) {
        this.collapsed.set(new Set(data.regions.filter((r) => r.id_region !== own && own != null).map((r) => r.id_region)));
        this.collapsedInit = true;
      }
    } finally {
      this.loading.set(false);
    }
  }
  private collapsedInit = false;

  shiftMonth(delta: number): void {
    const [y, m] = this.month().split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    this.month.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    void this.load();
  }

  goToday(): void {
    this.month.set(this.today.slice(0, 7));
    void this.load();
  }

  toggleRegion(id: number): void {
    const s = new Set(this.collapsed());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.collapsed.set(s);
  }

  togglePos(id: number): void {
    const s = new Set(this.posFilter());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.posFilter.set(s);
  }

  clearPos(): void {
    this.posFilter.set(new Set());
  }

  canEdit(u: TimetableUserDto, regionId: number): boolean {
    const me = this.auth.user();
    if (!me || !this.auth.canWritePlanning()) return false;
    if (me.id_profil === 1) return true;
    if (me.id_profil === 4) return me.id_user === u.id_user;
    return me.id_region === regionId;
  }

  openCell(u: TimetableUserDto, regionId: number, half: HalfCell): void {
    if (!this.canEdit(u, regionId)) return;
    const label = `${u.nigend} — ${u.prenom} ${u.nom}`;
    this.form.set(
      half.planning
        ? { planning: stripAffiche(half.planning), user: { nigend: u.nigend, label } }
        : { user: { nigend: u.nigend, label }, date: half.date, creneau: half.creneau },
    );
  }

  newSlot(): void {
    this.form.set({ date: this.today, creneau: Creneau.JOUR });
  }

  onSaved(): void {
    this.form.set(null);
    void this.load();
  }

  async exportPdf(): Promise<void> {
    const el = this.printEl()?.nativeElement;
    if (!el) return;
    this.exporting.set(true);
    try {
      await exportElementToPdf(el, `planning_rni_${this.month()}.pdf`, 'landscape');
    } finally {
      this.exporting.set(false);
    }
  }

  protected title(h: HalfCell): string {
    const p = h.planning;
    const cr = h.creneau === Creneau.JOUR ? 'Jour' : 'Nuit';
    if (!p) return `${h.date.split('-').reverse().join('/')} ${cr} — aucun planning`;
    return `${h.date.split('-').reverse().join('/')} ${cr} — ${this.ref.libelle(p.id_pos_service)}${p.adresse_temp ? ' — ' + p.adresse_temp : ''}`;
  }

  protected monthLabel = computed(() => {
    const [y, m] = this.month().split('-').map(Number);
    return new Date(y, m - 1, 1);
  });
}

function stripAffiche(p: TimetablePlanningDto) {
  const { affiche: _a, ...rest } = p;
  return rest;
}
