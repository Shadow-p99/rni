import { Component, computed, inject, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { FormulaireChampDto, NOTE_MAX, NOTE_MIN } from '@rni/shared';
import { FormulaireConfigService } from '../../../core/formulaire/formulaire-config.service';

/** Un champ de la fiche, rendu selon son type (texte, zone, note, liste, téléphone). */
@Component({
  selector: 'rni-formulaire-field',
  imports: [ReactiveFormsModule],
  host: { class: 'block', '[class.sm:col-span-2]': "def().kind === 'textarea'" },
  template: `
    @let d = def();
    <label class="label" [for]="id()">
      {{ d.label }}
      @if (d.required && d.kind !== 'note') {
        <span class="text-red-600" aria-hidden="true">*</span>
      }
      @if (d.kind === 'note') {
        <span class="font-normal normal-case text-slate-400">({{ noteMin }} à {{ noteMax }})</span>
      }
    </label>
    @switch (d.kind) {
      @case ('textarea') {
        <textarea [id]="id()" class="input" rows="2" [formControl]="control()" [class.input-error]="invalid()"></textarea>
      }
      @case ('select') {
        <select [id]="id()" class="input" [formControl]="control()">
          @for (c of crises(); track c) {
            <option [value]="c">{{ c }}</option>
          }
        </select>
      }
      @case ('note') {
        <input [id]="id()" type="number" class="input" [min]="noteMin" [max]="noteMax" step="1" [formControl]="control()" [class.input-error]="invalid()" />
      }
      @case ('number') {
        <input [id]="id()" type="text" inputmode="numeric" class="input" [formControl]="control()" [class.input-error]="invalid()" />
      }
      @case ('phone') {
        <input [id]="id()" type="tel" class="input" placeholder="06 12 34 56 78 / +33 6…" [formControl]="control()" [class.input-error]="invalid()" />
      }
      @default {
        <input [id]="id()" type="text" class="input" [formControl]="control()" [class.input-error]="invalid()" />
      }
    }
    @if (invalid()) {
      <p class="field-error" role="alert">{{ message() }}</p>
    }
  `,
})
export class FormulaireField {
  readonly def = input.required<Pick<FormulaireChampDto, 'key' | 'label' | 'kind' | 'required'>>();
  readonly control = input.required<FormControl>();
  readonly submitted = input(false);

  private readonly structure = inject(FormulaireConfigService);
  /** Types de crise actifs (Administration › Fiche de crise) + valeur enregistrée si désactivée depuis. */
  protected readonly crises = computed(() => {
    const actives = this.structure.crisesActives();
    const v = this.control().value as string | null;
    return v && !actives.includes(v) ? [...actives, v] : actives;
  });
  protected readonly noteMin = NOTE_MIN;
  protected readonly noteMax = NOTE_MAX;
  protected readonly id = computed(() => `f-${this.def().key}`);

  protected invalid(): boolean {
    const c = this.control();
    return c.invalid && (c.touched || this.submitted());
  }

  protected message(): string {
    const c = this.control();
    if (c.hasError('required')) return 'Champ obligatoire.';
    if (c.hasError('phone')) return 'Numéro invalide : format national (0X XX XX XX XX) ou international (+XX / 00XX).';
    if (c.hasError('min') || c.hasError('max') || c.hasError('pattern')) return `Note entière de ${NOTE_MIN} à ${NOTE_MAX}.`;
    return 'Valeur invalide.';
  }
}
