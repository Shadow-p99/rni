import { Component, input } from '@angular/core';

@Component({
  selector: 'rni-spinner',
  host: { class: 'inline-flex', role: 'status', '[attr.aria-label]': 'label()' },
  template: `<span class="animate-spin rounded-full border-2 border-slate-300 border-t-rni-600" [style.width.px]="size()" [style.height.px]="size()"></span>`,
})
export class Spinner {
  readonly size = input(16);
  readonly label = input('Chargement');
}
