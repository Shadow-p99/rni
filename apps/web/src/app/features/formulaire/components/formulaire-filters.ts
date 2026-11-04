import { Component, inject, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import { RegionSelect } from '../../../shared/ui/region-select';

/** Filtres de la liste des fiches : région (GIGN), état, période de dernière modification. */
@Component({
  selector: 'rni-formulaire-filters',
  imports: [FormsModule, RegionSelect],
  host: { class: 'contents' },
  template: `
    @if (auth.isGign()) {
      <rni-region-select class="w-56" label="Région" nullLabel="Toutes" scope="all" [(value)]="region" />
    }
    <div>
      <label class="label" for="f-etat">État</label>
      <select id="f-etat" class="input w-40" [ngModel]="closed()" (ngModelChange)="closed.set($event)">
        <option [ngValue]="null">Toutes</option>
        <option [ngValue]="false">Actives</option>
        <option [ngValue]="true">Clôturées</option>
      </select>
    </div>
    <div>
      <label class="label" for="f-from">Modifiées du</label>
      <input id="f-from" type="date" class="input" [max]="to() || null" [ngModel]="from()" (ngModelChange)="from.set($event ?? '')" />
    </div>
    <div>
      <label class="label" for="f-to">au</label>
      <input id="f-to" type="date" class="input" [min]="from() || null" [ngModel]="to()" (ngModelChange)="to.set($event ?? '')" />
    </div>
  `,
})
export class FormulaireFilters {
  protected readonly auth = inject(AuthService);
  readonly region = model<number | null>(null);
  readonly closed = model<boolean | null>(null);
  readonly from = model('');
  readonly to = model('');
}
