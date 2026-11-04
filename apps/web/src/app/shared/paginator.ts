import { DecimalPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { PAGE_SIZES, pageCount, pageWindow } from '@rni/shared';

/** Pagination : « 21–40 sur 1 234 », pages numérotées avec ellipses, taille de page. */
@Component({
  selector: 'rni-paginator',
  imports: [DecimalPipe],
  template: `
    <nav class="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Pagination">
      <p class="text-slate-600" aria-live="polite">
        @if (total() === 0) {
          Aucun résultat
        } @else {
          <span class="font-medium">{{ from() | number }}–{{ to() | number }}</span>
          sur <span class="font-medium">{{ total() | number }}{{ capped() ? '+' : '' }}</span>
          @if (capped()) {
            <span class="text-amber-700"> — affinez la recherche pour accéder aux suivants</span>
          }
        }
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-1.5 text-slate-600">
          Par page
          <select class="input w-auto py-1" [value]="size()" (change)="sizeChange.emit(+$any($event.target).value)">
            @for (s of sizes; track s) {
              <option [value]="s" [selected]="s === size()">{{ s }}</option>
            }
          </select>
        </label>
        <div class="flex items-center gap-1">
          <button type="button" class="btn-secondary px-2.5" [disabled]="page() <= 1" (click)="go(page() - 1)" aria-label="Page précédente">‹</button>
          @for (p of window(); track $index) {
            @if (p === null) {
              <span class="px-1 text-slate-400">…</span>
            } @else {
              <button
                type="button"
                class="min-w-9 rounded-md border px-2 py-1.5 text-sm"
                [class]="p === page() ? 'border-rni-700 bg-rni-700 font-semibold text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'"
                [attr.aria-current]="p === page() ? 'page' : null"
                (click)="go(p)"
              >
                {{ p | number }}
              </button>
            }
          }
          <button type="button" class="btn-secondary px-2.5" [disabled]="page() >= pages()" (click)="go(page() + 1)" aria-label="Page suivante">›</button>
        </div>
      </div>
    </nav>
  `,
})
export class Paginator {
  readonly page = input.required<number>();
  readonly size = input.required<number>();
  readonly total = input.required<number>();
  readonly capped = input(false);
  readonly pageChange = output<number>();
  readonly sizeChange = output<number>();

  protected readonly sizes = PAGE_SIZES;
  protected readonly pages = computed(() => pageCount(this.total(), this.size()));
  protected readonly window = computed(() => pageWindow(this.page(), this.pages()));
  protected readonly from = computed(() => (this.page() - 1) * this.size() + 1);
  protected readonly to = computed(() => Math.min(this.page() * this.size(), this.total()));

  go(p: number): void {
    if (p >= 1 && p <= this.pages() && p !== this.page()) this.pageChange.emit(p);
  }
}
