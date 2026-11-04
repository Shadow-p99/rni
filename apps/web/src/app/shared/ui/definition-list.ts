import { Component, input } from '@angular/core';

export interface DlItem {
  label: string;
  value: string | number | null | undefined;
}

/** Liste « libellé : valeur » (fiches, confirmations). Les valeurs vides affichent « — ». */
@Component({
  selector: 'rni-dl',
  template: `
    <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm" [class.rounded-md]="boxed()" [class.bg-slate-50]="boxed()" [class.p-3]="boxed()">
      @for (i of items(); track i.label) {
        <dt class="text-slate-500">{{ i.label }}</dt>
        <dd>{{ i.value ?? '—' }}</dd>
      }
    </dl>
  `,
})
export class DefinitionList {
  readonly items = input.required<DlItem[]>();
  readonly boxed = input(true);
}
