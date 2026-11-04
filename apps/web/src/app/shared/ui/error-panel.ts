import { Component, computed, input, output } from '@angular/core';
import type { AppError } from '../../core/errors/app-error';

/** Message d'erreur en ligne (formulaire, dialogue, section), avec « Réessayer » si pertinent. */
@Component({
  selector: 'rni-error-panel',
  template: `
    @if (error(); as e) {
      <div class="flex items-start gap-3 rounded-md border p-3 text-sm" [class]="tone()" role="alert">
        <span aria-hidden="true">{{ e.severity === 'AVERTISSEMENT' ? '⚠' : '⛔' }}</span>
        <div class="flex-1">
          <p class="font-semibold">{{ e.title }}</p>
          @if (e.detail) {
            <p class="mt-0.5">{{ e.detail }}</p>
          }
          @if (e.code) {
            <p class="mt-0.5 text-xs opacity-70">Code {{ e.code }}</p>
          }
        </div>
        @if (retryable() && e.retryable) {
          <button type="button" class="btn-secondary shrink-0" (click)="retry.emit()">Réessayer</button>
        }
      </div>
    }
  `,
})
export class ErrorPanel {
  readonly error = input<AppError | null>(null);
  /** Affiche le bouton « Réessayer » pour les erreurs transitoires. */
  readonly retryable = input(false);
  readonly retry = output<void>();
  protected readonly tone = computed(() =>
    this.error()?.severity === 'AVERTISSEMENT' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-800',
  );
}
