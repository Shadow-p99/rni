import { Component, input, model } from '@angular/core';

export interface SegmentOption<T> {
  value: T;
  label: string;
}

/** Choix exclusif compact (ex. Jour / Nuit, Modifier / Insérer). */
@Component({
  selector: 'rni-segmented',
  host: { class: 'inline-flex shrink-0 rounded-md border border-slate-300 p-0.5 text-sm', role: 'radiogroup', '[attr.aria-label]': 'label()' },
  template: `
    @for (o of options(); track o.value) {
      <button type="button" role="radio" class="rounded px-3 py-1" [attr.aria-checked]="o.value === value()" [class.bg-rni-700]="o.value === value()" [class.text-white]="o.value === value()" (click)="value.set(o.value)">
        {{ o.label }}
      </button>
    }
  `,
})
export class Segmented<T> {
  readonly options = input.required<SegmentOption<T>[]>();
  readonly label = input('');
  readonly value = model.required<T>();
}
