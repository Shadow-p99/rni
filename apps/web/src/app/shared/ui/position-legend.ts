import { Component, inject, input } from '@angular/core';
import { NO_PLANNING_COLOR } from '@rni/shared';
import { ReferentielService } from '../../core/referentiel/referentiel.service';

/** Légende des positions de service (couleurs `ref_pos_service.color`). */
@Component({
  selector: 'rni-position-legend',
  host: { class: 'flex gap-x-3 gap-y-1 text-xs text-slate-600', '[class.flex-col]': 'vertical()', '[class.flex-wrap]': '!vertical()' },
  template: `
    @for (p of ref.positions(); track p.id_pos_service) {
      <span class="flex items-center gap-2"><span class="inline-block size-3 rounded-full" [style.background]="p.color"></span>{{ p.libelle }}</span>
    }
    @if (withNone()) {
      <span class="flex items-center gap-2"><span class="inline-block size-3 rounded-full" [style.background]="noneColor"></span>Sans planning</span>
    }
    <ng-content />
  `,
})
export class PositionLegend {
  protected readonly ref = inject(ReferentielService);
  protected readonly noneColor = NO_PLANNING_COLOR;
  readonly vertical = input(false);
  readonly withNone = input(true);
}
