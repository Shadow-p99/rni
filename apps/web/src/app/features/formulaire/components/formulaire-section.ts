import { Component, computed, inject, input, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { SECTIONS, SectionId } from '@rni/shared';
import { AddressAutocomplete } from '../../../shared/ui/address-autocomplete';
import { FormulaireEditorStore } from '../formulaire-editor.store';
import { fieldsOf } from '../formulaire-form';
import { FormulaireField } from './formulaire-field';

/** Section dépliable de la fiche (profil, situation, terrain, renseignements auteur). */
@Component({
  selector: 'rni-formulaire-section',
  imports: [FormulaireField, AddressAutocomplete],
  host: { class: 'card block' },
  template: `
    <button type="button" class="flex w-full items-center gap-2 border-b border-slate-200 px-4 py-2.5 text-left font-semibold" (click)="open.set(!open())" [attr.aria-expanded]="open()">
      <span class="text-slate-400" aria-hidden="true">{{ open() ? '▾' : '▸' }}</span>{{ libelle() }}
      @if (errors() > 0 && store.submitted()) {
        <span class="chip ml-auto bg-red-100 text-red-700">{{ errors() }} champ(s) à compléter</span>
      }
    </button>
    @if (open()) {
      <div class="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        @for (f of fields(); track f.key) {
          @if (f.kind === 'address') {
            <div class="sm:col-span-2">
              <label class="label">{{ f.label }}</label>
              <rni-address-autocomplete
                [minChars]="3"
                [disabled]="store.closed()"
                [invalid]="store.addressInvalid() || store.addressMissing()"
                [text]="store.addressText()"
                (textChange)="store.setAddressText($event)"
                (selected)="store.setAddress($event)"
              />
              @if (store.addressInvalid() || store.addressMissing()) {
                <p class="field-error" role="alert">Sélectionnez une adresse proposée par le géocodeur.</p>
              }
            </div>
          } @else {
            <rni-formulaire-field [def]="f" [control]="control(f.key)" [submitted]="store.submitted()" />
          }
        }
      </div>
    }
  `,
})
export class FormulaireSection {
  protected readonly store = inject(FormulaireEditorStore);
  readonly section = input.required<SectionId>();
  readonly open = signal(true);
  protected readonly fields = computed(() => fieldsOf(this.section()));
  protected readonly libelle = computed(() => SECTIONS.find((s) => s.id === this.section())?.libelle ?? '');

  protected control(key: string): FormControl {
    return this.store.form.get(key) as FormControl;
  }

  /** Nombre de champs invalides (affiché après une tentative d'enregistrement). */
  protected errors(): number {
    const invalidFields = this.fields().filter((f) => f.kind !== 'address' && this.store.form.get(f.key)?.invalid).length;
    const address = this.fields().some((f) => f.kind === 'address') && !this.store.address() ? 1 : 0;
    return invalidFields + address;
  }
}
