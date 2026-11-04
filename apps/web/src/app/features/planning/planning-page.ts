import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { Creneau } from '@rni/shared';
import { AuthService } from '../../core/auth/auth.service';
import { ExportService } from '../../core/export/export.service';
import { ReferentielService } from '../../core/referentiel/referentiel.service';
import { ErrorPanel } from '../../shared/ui/error-panel';
import { MonthNav } from '../../shared/ui/month-nav';
import { PositionFilter } from '../../shared/ui/position-filter';
import { PositionLegend } from '../../shared/ui/position-legend';
import { SearchInput } from '../../shared/ui/search-input';
import { CellClick } from './components/planning-grid';
import { PlanningFormInit, PlanningSlotDialog } from './components/planning-slot-dialog';
import { RegionSection } from './components/region-section';
import { PlanningStore } from './planning.store';

/** Planning national : calendrier mensuel par région (§5.1). */
@Component({
  selector: 'rni-planning-page',
  imports: [MonthNav, SearchInput, PositionFilter, PositionLegend, ErrorPanel, RegionSection, PlanningSlotDialog],
  providers: [PlanningStore],
  template: `
    <div class="flex flex-1 flex-col gap-3 p-3 desk:p-4">
      <div class="card no-print flex flex-wrap items-center gap-3 p-2">
        <rni-month-nav [value]="store.month()" (valueChange)="store.setMonth($event)" />
        <rni-search-input class="w-56" placeholder="Rechercher un personnel…" [debounceMs]="150" (search)="store.search.set($event)" />
        <rni-position-filter label="Maintenant :" [withNone]="true" [clearable]="true" [value]="store.positions()" (valueChange)="store.positions.set($event)" />
        <div class="ml-auto flex gap-2">
          <button type="button" class="btn-secondary" (click)="exportPdf()" [disabled]="exporter.busy() || !store.hasData()">{{ exporter.busy() ? 'Export…' : '⤓ PDF' }}</button>
          @if (auth.canWritePlanning()) {
            <button type="button" class="btn-primary" (click)="form.set({ date: store.today, creneau: Jour })">+ Nouveau créneau</button>
          }
        </div>
      </div>

      @if (store.counts.error()) {
        <rni-error-panel [error]="store.counts.error()" [retryable]="true" (retry)="store.loadCounts()" />
      }

      @if (store.regions().length) {
        <div #print class="flex flex-col gap-3">
          @for (r of store.regions(); track r.id_region) {
            <rni-region-section
              [region]="r"
              [days]="store.dayHeaders()"
              [filtered]="filtered()"
              (toggle)="store.toggleRegion(r.id_region)"
              (retry)="store.loadRegion(r.id_region)"
              (cellClick)="open($event)"
            />
          }
        </div>
      } @else {
        <p class="card p-8 text-center text-sm text-slate-500">Aucune région dans votre périmètre.</p>
      }

      <rni-position-legend class="px-1">
        <span class="flex items-center gap-1">
          <span class="inline-flex h-3 w-3 flex-col overflow-hidden rounded-sm"><span class="h-1/2 bg-slate-200"></span><span class="h-1/2 bg-slate-300"></span></span>
          Case : haut = Jour (08h-18h), bas = Nuit (18h-08h)
        </span>
      </rni-position-legend>
    </div>

    @if (form(); as f) {
      <rni-planning-slot-dialog [init]="f" (closed)="form.set(null)" (saved)="onSaved()" />
    }
  `,
})
export class PlanningPage {
  protected readonly auth = inject(AuthService);
  protected readonly ref = inject(ReferentielService);
  protected readonly store = inject(PlanningStore);
  protected readonly exporter = inject(ExportService);
  private readonly printEl = viewChild<ElementRef<HTMLElement>>('print');
  protected readonly form = signal<PlanningFormInit | null>(null);
  protected readonly Jour = Creneau.JOUR;

  protected readonly filtered = computed(() => !!this.store.search().trim() || this.store.positions().size > 0);

  constructor() {
    this.store.init();
  }

  open({ user: u, half }: CellClick): void {
    const label = `${u.nigend} — ${u.prenom} ${u.nom}`;
    if (half.planning) {
      const { affiche: _a, ...planning } = half.planning;
      this.form.set({ planning, user: { nigend: u.nigend, label } });
    } else {
      this.form.set({ user: { nigend: u.nigend, label }, date: half.date, creneau: half.creneau });
    }
  }

  onSaved(): void {
    this.form.set(null);
    this.store.refresh();
  }

  exportPdf(): void {
    void this.exporter.pdf(this.printEl()?.nativeElement, `planning_rni_${this.store.month()}.pdf`, 'landscape');
  }
}
