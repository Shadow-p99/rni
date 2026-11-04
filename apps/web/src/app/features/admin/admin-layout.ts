import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** Administration (super administrateur) : onglets tableau de bord, journal, périmètres. */
@Component({
  selector: 'rni-admin-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="flex min-h-full flex-col">
      <nav class="border-b border-slate-200 bg-white px-3 desk:px-4" aria-label="Administration">
        <div class="mx-auto flex max-w-7xl gap-1 overflow-x-auto">
          @for (t of tabs; track t.path) {
            <a
              [routerLink]="t.path"
              routerLinkActive="!border-rni-700 font-semibold text-rni-800"
              ariaCurrentWhenActive="page"
              class="-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm text-slate-500 hover:text-slate-800"
              >{{ t.label }}</a
            >
          }
        </div>
      </nav>
      <router-outlet />
    </div>
  `,
})
export class AdminLayout {
  protected readonly tabs = [
    { path: 'tableau-de-bord', label: 'Tableau de bord' },
    { path: 'journal', label: 'Journal' },
    { path: 'perimetres', label: 'Périmètres' },
  ];
}
