import { DatePipe } from '@angular/common';
import { Component, computed, input, model } from '@angular/core';
import { localDateIso } from '@rni/shared';

/** Navigation mensuelle `‹ novembre 2026 ›` ; `value` au format AAAA-MM. */
@Component({
  selector: 'rni-month-nav',
  imports: [DatePipe],
  host: { class: 'flex items-center gap-1' },
  template: `
    <button type="button" class="btn-secondary px-2.5" (click)="shift(-1)" aria-label="Mois précédent">‹</button>
    <span class="min-w-36 text-center font-semibold capitalize" aria-live="polite">{{ date() | date: 'MMMM yyyy' }}</span>
    <button type="button" class="btn-secondary px-2.5" (click)="shift(1)" aria-label="Mois suivant">›</button>
    @if (showToday() && value() !== current) {
      <button type="button" class="btn-ghost" (click)="value.set(current)">Aujourd'hui</button>
    }
  `,
})
export class MonthNav {
  readonly value = model(localDateIso(new Date()).slice(0, 7));
  readonly showToday = input(true);
  protected readonly current = localDateIso(new Date()).slice(0, 7);
  protected readonly date = computed(() => new Date(`${this.value()}-01T12:00:00`));

  shift(delta: number): void {
    this.value.set(shiftMonth(this.value(), delta));
  }
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
