import { Component, input, output } from '@angular/core';
import type { PlanningDetailDto } from '@rni/shared';
import { PositionBadge } from '../../../shared/ui/position-badge';

/** Personnels planifiés sur le créneau sélectionné. */
@Component({
  selector: 'rni-day-list',
  imports: [PositionBadge],
  template: `
    <ul class="divide-y divide-slate-100">
      @for (p of items(); track p.id_planning) {
        <li>
          <button type="button" class="flex w-full items-center gap-2 p-3 text-left text-sm" [disabled]="!canEdit()(p)" (click)="picked.emit(p)">
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
        <li class="p-4 text-center text-sm text-slate-500">Aucun planning sur ce créneau.</li>
      }
    </ul>
  `,
})
export class DayList {
  readonly items = input.required<PlanningDetailDto[]>();
  readonly canEdit = input<(p: PlanningDetailDto) => boolean>(() => false);
  readonly picked = output<PlanningDetailDto>();
}
