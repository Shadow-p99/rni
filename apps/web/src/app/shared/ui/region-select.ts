import { Component, computed, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReferentielService } from '../../core/referentiel/referentiel.service';

let seq = 0;

/** Liste des régions : visibles par l'utilisateur (défaut) ou toutes. */
@Component({
  selector: 'rni-region-select',
  imports: [FormsModule],
  host: { class: 'block' },
  template: `
    @if (label()) {
      <label class="label" [for]="id">{{ label() }}</label>
    }
    <select [id]="id" class="input" [ngModel]="value()" (ngModelChange)="value.set($event)" [attr.aria-label]="label() ? null : 'Région'">
      @if (nullLabel()) {
        <option [ngValue]="null">{{ nullLabel() }}</option>
      }
      @for (r of regions(); track r.id_region) {
        <option [ngValue]="r.id_region">{{ r.libelle }}</option>
      }
    </select>
  `,
})
export class RegionSelect {
  private readonly ref = inject(ReferentielService);
  readonly label = input('');
  readonly nullLabel = input('Toutes les régions');
  readonly scope = input<'visible' | 'all'>('visible');
  readonly value = model<number | null>(null);
  protected readonly id = `rni-region-${++seq}`;
  protected readonly regions = computed(() => (this.scope() === 'all' ? this.ref.allRegions() : this.ref.regions()));
}
