import { Component, computed, inject, input, model } from '@angular/core';
import { PROFIL_LIBELLES, Profil, assignableProfils } from '@rni/shared';
import { AuthService } from '../../../core/auth/auth.service';

let seq = 0;

/** BR-GPU-3 : choix du profil parmi ceux que l'utilisateur connecté peut attribuer. */
@Component({
  selector: 'rni-profil-picker',
  template: `
    <fieldset>
      <legend class="label">{{ label() }}</legend>
      <div class="flex flex-wrap gap-3 text-sm">
        @for (id of profils(); track id) {
          <label class="flex items-center gap-1.5">
            <input type="radio" class="accent-rni-700" [name]="name" [checked]="value() === id" (change)="value.set(id)" />{{ libelles[id] }}
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
  protected readonly libelles = PROFIL_LIBELLES;
  protected readonly profils = computed(() => assignableProfils(this.auth.profil() ?? 0));
}
