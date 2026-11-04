import { Component, input, model } from '@angular/core';

let seq = 0;

/** Interrupteur avec libellé et description. */
@Component({
  selector: 'rni-toggle',
  host: { class: 'block' },
  template: `
    <label [for]="id" class="flex items-center justify-between gap-4 rounded-md border border-slate-200 p-3" [class.opacity-60]="disabled()">
      <span>
        <span class="font-medium">{{ label() }}</span>
        @if (description()) {
          <span class="block text-xs text-slate-500">{{ description() }}</span>
        }
      </span>
      <span class="relative inline-flex shrink-0">
        <input [id]="id" type="checkbox" role="switch" class="peer sr-only" [checked]="checked()" [disabled]="disabled()" (change)="checked.set($any($event.target).checked)" />
        <span class="h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-rni-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rni-600"></span>
        <span class="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"></span>
      </span>
    </label>
  `,
})
export class Toggle {
  readonly label = input.required<string>();
  readonly description = input('');
  readonly disabled = input(false);
  readonly checked = model(false);
  protected readonly id = `rni-toggle-${++seq}`;
}
