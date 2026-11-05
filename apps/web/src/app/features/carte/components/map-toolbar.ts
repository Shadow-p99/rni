import { DatePipe } from '@angular/common';
import { Component, input, model, output } from '@angular/core';
import { Spinner } from '../../../shared/ui/spinner';

export type CartePanel = 'filtres' | 'fonds' | 'crise';

/** Barre d'outils de la carte. */
@Component({
  selector: 'rni-map-toolbar',
  imports: [DatePipe, Spinner],
  host: { class: 'no-print flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2', 'data-export-ignore': '' },
  template: `
    <button type="button" class="btn-secondary shadow" [class.!bg-rni-100]="panel() === 'filtres'" [attr.aria-pressed]="panel() === 'filtres'" (click)="toggle('filtres')">
      ⚑ Filtres <span class="text-xs text-slate-500">({{ visibleCount() }}/{{ totalCount() }})</span>
    </button>
    <button type="button" class="btn-secondary shadow" [class.!bg-rni-100]="panel() === 'fonds'" [attr.aria-pressed]="panel() === 'fonds'" (click)="toggle('fonds')">🗺 Fonds</button>
    @if (canCrise()) {
      <button type="button" class="btn-secondary shadow" [class.!bg-red-50]="panel() === 'crise'" [attr.aria-pressed]="panel() === 'crise'" (click)="toggle('crise')"><span class="text-red-600">⬤</span> Crise</button>
    }
    <button type="button" class="btn-secondary shadow" (click)="exportPng.emit()" [disabled]="exporting()" title="Exporter la carte en PNG">{{ exporting() ? 'Export…' : '⤓ PNG' }}</button>
    <button type="button" class="btn-secondary shadow" (click)="refresh.emit()" [disabled]="refreshing()" title="Actualiser les positions">
      @if (refreshing()) {
        <rni-spinner [size]="12" />
      } @else {
        ⟳
      }
      <span class="hidden text-xs sm:inline" [class.text-amber-700]="stale()" [class.text-slate-500]="!stale()">{{ lastUpdate() | date: 'HH:mm:ss' }}</span>
    </button>
  `,
})
export class MapToolbar {
  readonly panel = model<CartePanel | null>(null);
  readonly visibleCount = input(0);
  readonly totalCount = input(0);
  readonly canCrise = input(false);
  readonly lastUpdate = input<Date | null>(null);
  readonly refreshing = input(false);
  readonly exporting = input(false);
  readonly stale = input(false);
  readonly refresh = output<void>();
  readonly exportPng = output<void>();

  toggle(p: CartePanel): void {
    this.panel.set(this.panel() === p ? null : p);
  }
}
