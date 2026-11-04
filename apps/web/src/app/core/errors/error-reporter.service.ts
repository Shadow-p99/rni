import { Injectable, inject } from '@angular/core';
import { ToastService } from '../notifications/toast.service';
import { AppError, toAppError } from './app-error';

/** Point unique de notification des erreurs (toasts + journal console). */
@Injectable({ providedIn: 'root' })
export class ErrorReporter {
  private readonly toasts = inject(ToastService);

  /** Notifie l'erreur (une seule fois) et la renvoie normalisée. */
  report(e: unknown, opts: { retry?: () => void } = {}): AppError {
    const err = toAppError(e);
    if (err.reported) return err;
    err.reported = true;

    if (err.kind === 'unexpected' || err.kind === 'server') console.error('[RNI]', err, err.cause ?? '');

    if (err.kind === 'chunk') {
      this.toasts.error(err.title, err.detail, { sticky: true, action: { label: 'Recharger', run: () => location.reload() } });
      return err;
    }
    const detail = [err.detail, err.code].filter(Boolean).join(' — ') || undefined;
    const action = opts.retry && err.retryable ? { label: 'Réessayer', run: opts.retry } : undefined;
    this.toasts.show(err.severity === 'AVERTISSEMENT' ? 'warning' : 'error', err.title, detail, { action });
    return err;
  }
}
