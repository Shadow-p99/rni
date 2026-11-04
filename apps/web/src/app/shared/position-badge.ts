import { Component, computed, inject, input } from '@angular/core';
import { ReferentielService } from '../core/referentiel.service';

@Component({
  selector: 'rni-position-badge',
  template: `<span class="chip text-white" [style.background]="color()">{{ label() }}</span>`,
})
export class PositionBadge {
  private readonly ref = inject(ReferentielService);
  readonly position = input<number | null>(null);
  readonly sansPlanning = input(false);
  protected readonly color = computed(() => (this.sansPlanning() ? '#808080' : this.ref.color(this.position())));
  protected readonly label = computed(() => (this.sansPlanning() ? 'Sans planning' : this.ref.libelle(this.position())));
}
