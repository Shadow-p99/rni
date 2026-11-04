import { Component, input, output, signal } from '@angular/core';
import { GEOCODER_CRISE_MIN_CHARS, GeocodeCandidate } from '@rni/shared';
import type { AppError } from '../../../core/errors/app-error';
import { AddressAutocomplete } from '../../../shared/ui/address-autocomplete';
import { ErrorPanel } from '../../../shared/ui/error-panel';
import { Spinner } from '../../../shared/ui/spinner';
import type { Crise } from '../carte.store';

/** BR-CAR-5..7 : localisation d'une crise (adresse ou clic) et isochrones. */
@Component({
  selector: 'rni-crise-panel',
  imports: [AddressAutocomplete, ErrorPanel, Spinner],
  template: `
    <p class="label">Localiser une crise</p>
    <rni-address-autocomplete [minChars]="minChars" placeholder="Adresse de la crise…" [(text)]="text" (selected)="onAddress($event)" />
    <div class="mt-2 flex flex-wrap gap-2">
      <button type="button" class="btn-secondary" [class.!bg-red-50]="placing()" [attr.aria-pressed]="placing()" (click)="placeByClick.emit()">⌖ Placer par clic</button>
      @if (crise()) {
        <button type="button" class="btn-secondary" (click)="toggleIso.emit()" [disabled]="isoLoading() || !hasIso()">{{ isoVisible() ? 'Masquer' : 'Afficher' }} les isochrones</button>
        <button type="button" class="btn-ghost text-red-700" (click)="clear.emit(); text.set('')">Retirer</button>
      }
    </div>
    @if (crise(); as c) {
      <p class="mt-2 text-xs text-slate-600">
        <span class="font-semibold">Crise :</span> {{ c.label }}<br />
        {{ c.lat.toFixed(5) }}, {{ c.lng.toFixed(5) }}
      </p>
      @if (isoLoading()) {
        <p class="mt-1 flex items-center gap-2 text-xs text-slate-500"><rni-spinner [size]="12" /> Calcul des isochrones…</p>
      } @else {
        <p class="mt-1 text-xs text-slate-500">Isochrones d'accessibilité 30 / 60 / 90 min. Point éphémère, non enregistré.</p>
      }
      <rni-error-panel class="mt-2 block" [error]="isoError()" [retryable]="true" (retry)="retryIso.emit()" />
    }
  `,
})
export class CrisePanel {
  readonly crise = input<Crise | null>(null);
  readonly placing = input(false);
  readonly isoVisible = input(true);
  readonly isoLoading = input(false);
  readonly hasIso = input(false);
  readonly isoError = input<AppError | null>(null);
  readonly locate = output<Crise>();
  readonly placeByClick = output<void>();
  readonly toggleIso = output<void>();
  readonly retryIso = output<void>();
  readonly clear = output<void>();
  protected readonly text = signal('');
  protected readonly minChars = GEOCODER_CRISE_MIN_CHARS;

  onAddress(c: GeocodeCandidate | null): void {
    if (c) this.locate.emit({ lat: c.y, lng: c.x, label: c.address });
  }
}
