import { Component, input, model } from '@angular/core';

/** Interrupteur compact (cellule de tableau), libellé accessible obligatoire. */
@Component({
  selector: 'rni-switch',
  host: { class: 'inline-flex' },
  template: `
    <label class="relative inline-flex cursor-pointer" [class.cursor-not-allowed]="disabled()" [class.opacity-50]="disabled()" [title]="label()">
      <input type="checkbox" role="switch" class="peer sr-only" [attr.aria-label]="label()" [checked]="checked()" [disabled]="disabled()" (change)="checked.set($any($event.target).checked)" />
      <span class="h-5 w-9 rounded-full bg-slate-300 transition-colors peer-checked:bg-rni-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rni-600" [class.!ring-2]="changed()" [class.!ring-amber-500]="changed()"></span>
      <span class="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4"></span>
    </label>
  `,
})
export class Switch {
  readonly label = input.required<string>();
  readonly disabled = input(false);
  /** Valeur modifiée et non enregistrée (liseré). */
  readonly changed = input(false);
  readonly checked = model(false);
}
