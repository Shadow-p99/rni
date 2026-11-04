import { Component, inject, input, output } from '@angular/core';
import { ReferentielService } from '../../../core/referentiel/referentiel.service';
import { RegionView } from '../planning.store';
import { CellClick, DayHeader, PlanningGrid } from './planning-grid';

/** Section dépliable d'une région : effectifs au créneau courant et grille mensuelle. */
@Component({
  selector: 'rni-region-section',
  imports: [PlanningGrid],
  host: { class: 'card block overflow-hidden' },
  template: `
    @let r = region();
    <button type="button" class="flex w-full flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left" (click)="toggle.emit()" [attr.aria-expanded]="!collapsed()">
      <span class="text-slate-400" aria-hidden="true">{{ collapsed() ? '▸' : '▾' }}</span>
      <span class="font-semibold">{{ r.libelle }}</span>
      <span class="text-xs text-slate-500">{{ r.rows.length }} personnel(s)</span>
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
    </button>
    @if (!collapsed()) {
      <rni-planning-grid [rows]="r.rows" [days]="days()" [libelle]="libelle" (cellClick)="cellClick.emit($event)" />
    }
  `,
})
export class RegionSection {
  protected readonly ref = inject(ReferentielService);
  readonly region = input.required<RegionView>();
  readonly days = input.required<DayHeader[]>();
  readonly collapsed = input(false);
  readonly toggle = output<void>();
  readonly cellClick = output<CellClick>();
  protected readonly libelle = (id: number) => this.ref.libelle(id);
}
