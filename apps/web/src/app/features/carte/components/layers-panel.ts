import { Component, input, output } from '@angular/core';
import type { BaseLayerDto } from '@rni/shared';

/** Sélecteur de fond cartographique (BR-CAR-1). */
@Component({
  selector: 'rni-layers-panel',
  template: `
    <p class="label">Fond cartographique</p>
    @for (l of layers(); track l.id) {
      <label class="flex items-center gap-2 py-1">
        <input type="radio" name="fond" class="accent-rni-700" [checked]="active() === l.id" (change)="select.emit(l.id)" />
        {{ l.label }}
      </label>
    }
  `,
})
export class LayersPanel {
  readonly layers = input.required<BaseLayerDto[]>();
  readonly active = input.required<string>();
  readonly select = output<string>();
}
