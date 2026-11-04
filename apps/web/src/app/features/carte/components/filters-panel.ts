import { Component, inject, input, output } from '@angular/core';
import { ReferentielService } from '../../../core/referentiel/referentiel.service';

/** Filtres par position de service (cases à cocher + « tout »). */
@Component({
  selector: 'rni-filters-panel',
  template: `
    <p class="label">Positions de service</p>
    <label class="flex items-center gap-2 py-1">
      <input type="checkbox" class="accent-rni-700" [checked]="value().size === ref.positions().length" (change)="toggleAll.emit()" />
      <span class="font-medium">Tout</span>
    </label>
    @for (p of ref.positions(); track p.id_pos_service) {
      <label class="flex items-center gap-2 py-1">
        <input type="checkbox" class="accent-rni-700" [checked]="value().has(p.id_pos_service)" (change)="toggle.emit(p.id_pos_service)" />
        <span class="inline-block size-3 rounded-full" [style.background]="p.color"></span>
        {{ p.libelle }}
      </label>
    }
    <p class="mt-2 text-xs text-slate-500">Les personnels sans planning (gris) sont comptés comme « Indisponible ».</p>
  `,
})
export class FiltersPanel {
  protected readonly ref = inject(ReferentielService);
  readonly value = input.required<Set<number>>();
  readonly toggle = output<number>();
  readonly toggleAll = output<void>();
}
