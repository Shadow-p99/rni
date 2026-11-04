import { Component, input, model } from '@angular/core';

export interface TabDef {
  id: string;
  label: string;
}

/** Onglets (barre seule ; le contenu est affiché par le parent selon `active`). */
@Component({
  selector: 'rni-tabs',
  host: { class: 'mb-4 flex gap-1 border-b border-slate-200', role: 'tablist' },
  template: `
    @for (t of tabs(); track t.id) {
      <button type="button" role="tab" [attr.aria-selected]="t.id === active()" class="-mb-px border-b-2 px-3 py-2 text-sm" [class]="t.id === active() ? 'border-rni-700 font-semibold text-rni-800' : 'border-transparent text-slate-500 hover:text-slate-700'" (click)="active.set(t.id)">
        {{ t.label }}
      </button>
    }
  `,
})
export class Tabs {
  readonly tabs = input.required<TabDef[]>();
  readonly active = model.required<string>();
}
