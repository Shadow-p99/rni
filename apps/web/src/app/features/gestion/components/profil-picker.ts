import { Component, computed, inject, input, model } from '@angular/core';
import { Profil } from '@rni/shared';
import { AuthService } from '../../../core/auth/auth.service';
import { ReferentielService } from '../../../core/referentiel/referentiel.service';

let seq = 0;

/** BR-GPU-3 : choix du profil parmi ceux que le profil connecté gère (Administration › Profils). */
@Component({
  selector: 'rni-profil-picker',
  template: `
    <fieldset>
      <legend class="label">{{ label() }}</legend>
      <div class="flex flex-wrap gap-3 text-sm">
        @for (id of profils(); track id) {
          <label class="flex items-center gap-1.5">
            <input type="radio" class="accent-rni-700" [name]="name" [checked]="value() === id" (change)="value.set(id)" />{{ ref.profilLibelle(id) }}
          </label>
        }
      </div>
    </fieldset>
  `,
})
export class ProfilPicker {
  private readonly auth = inject(AuthService);
  readonly label = input('Profil');
  readonly value = model<number | null>(Profil.NEGOCIATEUR);
  protected readonly name = `rni-profil-${++seq}`;
  protected readonly ref = inject(ReferentielService);
  protected readonly profils = computed(() => this.ref.sortProfils(this.auth.profilsGerables()));
}
