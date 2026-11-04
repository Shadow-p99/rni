import { Component, input, output } from '@angular/core';
import type { AppError } from '../../core/errors/app-error';
import { Spinner } from './spinner';

/**
 * Enveloppe d'une zone chargée depuis l'API : chargement initial, erreur (avec « Réessayer »),
 * état vide, puis contenu projeté. Pendant un rechargement, le contenu reste affiché (barre fine).
 */
@Component({
  selector: 'rni-async-view',
  imports: [Spinner],
  host: { class: 'relative block' },
  template: `
    @if (loading() && !pending()) {
      <div class="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-rni-600" aria-hidden="true"></div>
    }
    @if (pending()) {
      <div class="flex items-center justify-center gap-2 p-8 text-sm text-slate-500"><rni-spinner /> {{ loadingText() }}</div>
    } @else if (error(); as e) {
      <div class="flex flex-col items-center gap-3 p-8 text-center" role="alert">
        <p class="text-3xl" aria-hidden="true">{{ e.kind === 'network' || e.kind === 'timeout' || e.kind === 'server' ? '📡' : '⚠' }}</p>
        <div>
          <p class="font-semibold text-slate-800">{{ e.title }}</p>
          @if (e.detail) {
            <p class="mt-1 text-sm text-slate-600">{{ e.detail }}</p>
          }
          @if (e.code) {
            <p class="mt-1 text-xs text-slate-400">Code {{ e.code }}</p>
          }
        </div>
        <button type="button" class="btn-primary" (click)="retry.emit()">Réessayer</button>
      </div>
    } @else if (empty()) {
      <div class="p-8 text-center text-sm text-slate-500">
        <ng-content select="[empty]" />
        @if (emptyText()) {
          {{ emptyText() }}
        }
      </div>
    } @else {
      <div [class.opacity-60]="loading()" [attr.aria-busy]="loading()"><ng-content /></div>
    }
  `,
})
export class AsyncView {
  readonly loading = input(false);
  /** Premier chargement (aucune donnée encore disponible). */
  readonly pending = input(false);
  readonly error = input<AppError | null>(null);
  readonly empty = input(false);
  readonly emptyText = input('');
  readonly loadingText = input('Chargement…');
  readonly retry = output<void>();
}
