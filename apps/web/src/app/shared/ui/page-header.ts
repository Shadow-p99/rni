import { Component, input } from '@angular/core';

/** Barre de titre d'une page : titre, sous-titre, filtres et actions projetés. */
@Component({
  selector: 'rni-page-header',
  host: { class: 'card flex flex-wrap items-end gap-3 p-3' },
  template: `
    <div class="mr-2 self-center">
      <h1 class="text-lg font-semibold">{{ title() }}</h1>
      @if (subtitle()) {
        <p class="text-xs text-slate-500">{{ subtitle() }}</p>
      }
    </div>
    <ng-content />
    <div class="ml-auto flex flex-wrap items-center gap-2 self-center"><ng-content select="[actions]" /></div>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
