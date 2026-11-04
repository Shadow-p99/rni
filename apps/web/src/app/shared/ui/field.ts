import { Component, input } from '@angular/core';

/** Libellé + contrôle projeté + aide / message d'erreur. */
@Component({
  selector: 'rni-field',
  host: { class: 'block' },
  template: `
    <label class="label" [attr.for]="for() || null">
      {{ label() }}
      @if (note()) {
        <span class="font-normal normal-case text-slate-400">{{ note() }}</span>
      }
    </label>
    <ng-content />
    @if (error()) {
      <p class="field-error" role="alert">{{ error() }}</p>
    } @else if (hint()) {
      <p class="mt-1 text-xs text-slate-500">{{ hint() }}</p>
    }
  `,
})
export class Field {
  readonly label = input.required<string>();
  readonly for = input('');
  readonly note = input('');
  readonly hint = input('');
  readonly error = input<string | null>(null);
}
