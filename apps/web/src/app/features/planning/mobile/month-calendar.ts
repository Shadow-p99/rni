import { Component, input, output } from '@angular/core';
import { CalendarDay } from './planning-mobile.store';

/** Calendrier mensuel compact avec compteurs par position. */
@Component({
  selector: 'rni-month-calendar',
  host: { class: 'block' },
  template: `
    <div class="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-500" role="grid" aria-label="Calendrier du mois">
      @for (d of weekdays; track $index) {
        <div role="columnheader">{{ d }}</div>
      }
      @for (p of pad(); track $index) {
        <div></div>
      }
      @for (d of days(); track d.date) {
        <button
          type="button"
          class="flex min-h-14 flex-col items-center rounded-md border p-0.5"
          [class.border-rni-700]="d.date === selected()"
          [class.border-2]="d.date === selected()"
          [class.border-slate-200]="d.date !== selected()"
          [class.bg-amber-50]="d.date === today()"
          [attr.aria-pressed]="d.date === selected()"
          [attr.aria-label]="d.day + (d.counts.length ? ' : ' + summary(d) : '')"
          (click)="pick.emit(d.date)"
        >
          <span class="text-xs font-semibold text-slate-800">{{ d.day }}</span>
          <span class="mt-0.5 flex flex-wrap justify-center gap-0.5">
            @for (c of d.counts; track c.id) {
              <span class="rounded px-1 text-[10px] leading-4 font-bold text-white" [style.background]="c.color">{{ c.n }}</span>
            }
          </span>
        </button>
      }
    </div>
  `,
})
export class MonthCalendar {
  readonly days = input.required<CalendarDay[]>();
  readonly padding = input(0);
  readonly selected = input<string | null>(null);
  readonly today = input<string | null>(null);
  readonly pick = output<string>();
  protected readonly weekdays = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  protected pad(): number[] {
    return Array.from({ length: this.padding() });
  }

  protected summary(d: CalendarDay): string {
    return d.counts.map((c) => `${c.n}`).join(', ');
  }
}
