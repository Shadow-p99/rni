import { Component, computed, input, output } from '@angular/core';
import type { SortDir } from '@rni/shared';

/** En-tête de colonne triable (cycle : croissant → décroissant → tri par défaut). */
@Component({
  selector: 'th[rniSortHeader]',
  host: { class: 'px-3 py-2', '[attr.aria-sort]': 'ariaSort()' },
  template: `
    <button type="button" class="inline-flex items-center gap-1 uppercase hover:text-slate-800" (click)="toggle.emit()">
      <ng-content />
      <span class="text-[10px]" aria-hidden="true">{{ active() ? (dir() === 'asc' ? '▲' : '▼') : '↕' }}</span>
    </button>
  `,
})
export class SortHeader {
  readonly active = input(false);
  readonly dir = input<SortDir>('asc');
  readonly toggle = output<void>();
  protected readonly ariaSort = computed(() => (this.active() ? (this.dir() === 'asc' ? 'ascending' : 'descending') : null));
}
