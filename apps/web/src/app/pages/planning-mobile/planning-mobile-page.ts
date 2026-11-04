import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Creneau, MobileDayCountsDto, PlanningDetailDto, currentSlotBound, dateRange, localDateIso, monthBounds, toSlot } from '@rni/shared';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { PlanningApi } from '../../core/data.service';
import { ReferentielService } from '../../core/referentiel.service';
import { PositionBadge } from '../../shared/position-badge';
import { PlanningForm, PlanningFormInit } from '../planning/planning-form';

/** Planning mobile (§5.4) : compteurs par jour / créneau / position, planning du jour courant. */
@Component({
  selector: 'rni-planning-mobile-page',
  imports: [FormsModule, DatePipe, PositionBadge, PlanningForm],
  template: `
    <div class="mx-auto flex w-full max-w-xl flex-col gap-3 p-3">
      <div class="card flex items-center justify-between p-2">
        <button type="button" class="btn-secondary px-3" (click)="shiftMonth(-1)" aria-label="Mois précédent">‹</button>
        <span class="font-semibold capitalize">{{ monthDate() | date: 'MMMM yyyy' }}</span>
        <button type="button" class="btn-secondary px-3" (click)="shiftMonth(1)" aria-label="Mois suivant">›</button>
      </div>

      <div class="card space-y-2 p-3">
        <div class="flex gap-2">
          <select class="input" [ngModel]="region()" (ngModelChange)="setRegion($event)" aria-label="Région">
            <option [ngValue]="null">{{ auth.isGign() || auth.profil() === 2 ? 'National' : 'Toutes mes régions' }}</option>
            @for (r of ref.regions(); track r.id_region) {
              <option [ngValue]="r.id_region">{{ r.libelle }}</option>
            }
          </select>
          <div class="inline-flex shrink-0 rounded-md border border-slate-300 p-0.5 text-sm">
            <button type="button" class="rounded px-3" [class.bg-rni-700]="creneau() === 1" [class.text-white]="creneau() === 1" (click)="creneau.set(1)">Jour</button>
            <button type="button" class="rounded px-3" [class.bg-rni-700]="creneau() === 2" [class.text-white]="creneau() === 2" (click)="creneau.set(2)">Nuit</button>
          </div>
        </div>
        <div class="flex flex-wrap gap-1">
          @for (p of ref.positions(); track p.id_pos_service) {
            <button type="button" class="chip border" [style.borderColor]="p.color" [style.background]="positions().has(p.id_pos_service) ? p.color : 'transparent'" [style.color]="positions().has(p.id_pos_service) ? '#fff' : p.color" (click)="togglePos(p.id_pos_service)">{{ p.libelle }}</button>
          }
        </div>
      </div>

      <div class="card p-2">
        <div class="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-500">
          @for (d of ['L', 'M', 'M', 'J', 'V', 'S', 'D']; track $index) {
            <div>{{ d }}</div>
          }
          @for (pad of padding(); track $index) {
            <div></div>
          }
          @for (d of calendar(); track d.date) {
            <button type="button" class="flex min-h-14 flex-col items-center rounded-md border p-0.5" [class.border-rni-700]="d.date === selectedDate()" [class.border-2]="d.date === selectedDate()" [class.border-slate-200]="d.date !== selectedDate()" [class.bg-amber-50]="d.date === today" (click)="selectDay(d.date)">
              <span class="text-xs font-semibold text-slate-800">{{ d.day }}</span>
              <span class="mt-0.5 flex flex-wrap justify-center gap-0.5">
                @for (c of d.counts; track c.id) {
                  <span class="rounded px-1 text-[10px] leading-4 font-bold text-white" [style.background]="c.color">{{ c.n }}</span>
                }
              </span>
            </button>
          }
        </div>
      </div>

      <div class="card">
        <div class="flex items-center justify-between border-b border-slate-200 p-3">
          <h2 class="text-sm font-semibold">{{ selectedDateObj() | date: 'EEEE d MMMM' }} — {{ creneau() === 1 ? 'Jour (08h-18h)' : 'Nuit (18h-08h)' }}</h2>
          @if (auth.canWritePlanning()) {
            <button type="button" class="btn-primary px-2 py-1 text-xs" (click)="newSlot()">+ Créneau</button>
          }
        </div>
        <ul class="divide-y divide-slate-100">
          @for (p of dayList(); track p.id_planning) {
            <li>
              <button type="button" class="flex w-full items-center gap-2 p-3 text-left text-sm" (click)="open(p)">
                <span class="flex-1">
                  <span class="font-medium">{{ p.grade }} {{ p.nom }} {{ p.prenom }}</span>
                  <span class="block text-xs text-slate-500">{{ p.libelle_unite }}</span>
                  @if (p.adresse_temp) {
                    <span class="block text-xs text-slate-400">{{ p.adresse_temp }}</span>
                  }
                </span>
                <rni-position-badge [position]="p.id_pos_service" />
              </button>
            </li>
          } @empty {
            <li class="p-4 text-center text-sm text-slate-500">{{ loadingDay() ? 'Chargement…' : 'Aucun planning sur ce créneau.' }}</li>
          }
        </ul>
      </div>
    </div>

    @if (form(); as f) {
      <rni-planning-form [init]="f" (closed)="form.set(null)" (saved)="onSaved()" />
    }
  `,
})
export class PlanningMobilePage {
  protected readonly auth = inject(AuthService);
  protected readonly ref = inject(ReferentielService);
  private readonly api = inject(PlanningApi);

  protected readonly today = localDateIso(new Date());
  private readonly now = currentSlotBound(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  protected readonly month = signal(this.today.slice(0, 7));
  protected readonly region = signal<number | null>(null);
  /** Créneau courant par défaut (bascule à 8h / 18h). */
  protected readonly creneau = signal<Creneau>(this.now.creneau);
  protected readonly selectedDate = signal(this.now.date);
  protected readonly positions = signal<Set<number>>(new Set([1, 3, 4]));
  protected readonly counts = signal<MobileDayCountsDto[]>([]);
  protected readonly day = signal<PlanningDetailDto[]>([]);
  protected readonly loadingDay = signal(false);
  protected readonly form = signal<PlanningFormInit | null>(null);

  protected readonly monthDate = computed(() => new Date(`${this.month()}-01T12:00:00`));
  protected readonly selectedDateObj = computed(() => new Date(`${this.selectedDate()}T12:00:00`));
  protected readonly padding = computed(() => Array((new Date(`${this.month()}-01T12:00:00`).getDay() + 6) % 7));

  protected readonly calendar = computed(() => {
    const byDate = new Map(this.counts().map((c) => [c.date, c]));
    const { first, last } = monthBounds(this.month());
    const cr = this.creneau();
    return dateRange(first, last).map((date) => {
      const total = byDate.get(date)?.creneaux[cr]?.total ?? {};
      return {
        date,
        day: Number(date.slice(8)),
        counts: [...this.positions()]
          .sort()
          .map((id) => ({ id, n: total[id] ?? 0, color: this.ref.color(id) }))
          .filter((c) => c.n > 0),
      };
    });
  });

  protected readonly dayList = computed(() => {
    const slot = toSlot(this.selectedDate(), this.creneau());
    const pos = this.positions();
    return this.day()
      .filter((p) => toSlot(p.date_debut, p.id_creneaux_debut) <= slot && toSlot(p.date_fin, p.id_creneaux_fin) >= slot)
      .filter((p) => pos.has(p.id_pos_service))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  });

  constructor() {
    void this.ref.load().then(() => {
      void this.loadCounts();
      void this.loadDay();
    });
  }

  async loadCounts(): Promise<void> {
    const { first, last } = monthBounds(this.month());
    this.counts.set(await firstValueFrom(this.api.mobileCounts(first, last, this.region())).catch(() => []));
  }

  async loadDay(): Promise<void> {
    this.loadingDay.set(true);
    try {
      this.day.set(await firstValueFrom(this.api.byDate(this.selectedDate(), this.region())));
    } catch {
      this.day.set([]);
    } finally {
      this.loadingDay.set(false);
    }
  }

  shiftMonth(delta: number): void {
    const [y, m] = this.month().split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    this.month.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    void this.loadCounts();
  }

  setRegion(r: number | null): void {
    this.region.set(r);
    void this.loadCounts();
    void this.loadDay();
  }

  selectDay(date: string): void {
    this.selectedDate.set(date);
    void this.loadDay();
  }

  togglePos(id: number): void {
    const s = new Set(this.positions());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.positions.set(s);
  }

  open(p: PlanningDetailDto): void {
    const me = this.auth.user();
    if (!me || !this.auth.canWritePlanning()) return;
    const allowed = me.id_profil === 1 || (me.id_profil === 4 ? p.id_user === me.id_user : p.id_region === me.id_region);
    if (!allowed) return;
    this.form.set({ planning: p, user: { nigend: p.nigend, label: `${p.nigend} — ${p.prenom} ${p.nom}` } });
  }

  newSlot(): void {
    this.form.set({ date: this.selectedDate(), creneau: this.creneau() });
  }

  onSaved(): void {
    this.form.set(null);
    void this.loadCounts();
    void this.loadDay();
  }
}
