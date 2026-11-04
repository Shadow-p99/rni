import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import type { ApiError } from '@rni/shared';
import { catchError, throwError } from 'rxjs';
import { ToastService } from './toast.service';

/** Désactive la notification automatique d'erreur pour une requête. */
export const SILENT = new HttpContextToken<boolean>(() => false);

export function apiErrorOf(e: unknown): ApiError | null {
  if (e instanceof HttpErrorResponse && e.error && typeof e.error === 'object' && 'code' in e.error) return e.error as ApiError;
  return null;
}

/** Affiche les erreurs métier de l'API (code + libellé `t_admin_messages` + détail). */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const toasts = inject(ToastService);
  return next(req.clone({ withCredentials: true })).pipe(
    catchError((e: unknown) => {
      if (!req.context.get(SILENT) && e instanceof HttpErrorResponse) {
        const api = apiErrorOf(e);
        if (api) {
          toasts.show(api.type === 'AVERTISSEMENT' ? 'warning' : 'error', api.message, [api.details, api.code].filter(Boolean).join(' — '));
        } else if (e.status === 0) {
          toasts.error('Serveur injoignable', 'Vérifiez votre connexion au réseau.');
        } else {
          toasts.error('Erreur technique', `HTTP ${e.status}`);
        }
      }
      return throwError(() => e);
    }),
  );
};
