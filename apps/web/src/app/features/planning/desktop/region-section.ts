import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, input, output } from '@angular/core';
import { ReferentielService } from '../../../core/referentiel/referentiel.service';
import { AsyncView } from '../../../shared/ui/async-view';
import { Spinner } from '../../../shared/ui/spinner';
import { RegionView } from './planning-desktop.store';
import { CellClick, DayHeader, PlanningGrid } from './planning-grid';

/**
 * Section dépliable d'une région. L'en-tête (effectifs au créneau courant) est toujours affiché ;
 * la grille n'est chargée et affichée qu'une fois la région dépliée.
 */
@Component({
  selector: 'rni-region-section',
  imports: [NgTemplateOutlet, PlanningGrid, AsyncView, Spinner],
  host: { class: 'card block overflow-hidden' },
  template: `
    @let r = region();
    @if (collapsible()) {
      <button type="button" class="flex w-full flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left" (click)="toggled.emit()" [attr.aria-expanded]="r.expanded">
        <span class="text-slate-400" aria-hidden="true">{{ r.expanded ? '▾' : '▸' }}</span>
        <ng-container *ngTemplateOutlet="header" />
      </button>
    } @else {
      <!-- Seule région visible : en-tête fixe, toujours dépliée -->
      <div class="flex w-full flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <ng-container *ngTemplateOutlet="header" />
      </div>
    }
    <ng-template #header>
      <span class="font-semibold">{{ r.libelle }}</span>
      <span class="text-xs text-slate-500">
        @if (r.matches != null) {
          {{ r.matches }} résultat(s){{ r.total != null ? ' sur ' + r.total + ' personnel(s)' : '' }}
        } @else if (r.total != null) {
          {{ r.total }} personnel(s)
        }
      </span>
      @if (r.loading) {
        <rni-spinner [size]="12" />
      }
      @if (r.counts; as c) {
        <span class="ml-auto flex flex-wrap gap-1" title="Effectifs au créneau courant">
          @for (p of ref.positions(); track p.id_pos_service) {
            @if (c.counts[p.id_pos_service]) {
              <span class="chip text-white" [style.background]="p.color">{{ p.libelle }} {{ c.counts[p.id_pos_service] }}</span>
            }
          }
          @if (c.sans_planning) {
            <span class="chip bg-slate-400 text-white">Sans planning {{ c.sans_planning }}</span>
          }
        </span>
      }
    </ng-template>
    @if (r.expanded) {
      <rni-async-view [loading]="r.loading" [pending]="r.pending || (!r.loaded && !r.error)" [error]="r.error" loadingText="Chargement de la région…" (retry)="retry.emit()">
        <rni-planning-grid [rows]="r.rows" [days]="days()" [libelle]="libelle" (cellClick)="cellClick.emit($event)" />
      </rni-async-view>
    }
  `,
})
export class RegionSection {
  protected readonly ref = inject(ReferentielService);
  readonly region = input.required<RegionView>();
  readonly days = input.required<DayHeader[]>();
  /** Faux s'il n'y a qu'une région visible : en-tête non cliquable, région toujours dépliée. */
  readonly collapsible = input(true);
  readonly toggled = output<void>();
  readonly retry = output<void>();
  readonly cellClick = output<CellClick>();
  protected readonly libelle = (id: number) => this.ref.libelle(id);
}
