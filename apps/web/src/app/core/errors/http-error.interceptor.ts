import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, retry, throwError, timeout, timer } from 'rxjs';
import { toAppError } from './app-error';
import { ErrorReporter } from './error-reporter.service';

/** Pas de notification automatique : l'appelant affiche l'erreur lui-même (formulaire, état vide…). */
export const SILENT = new HttpContextToken<boolean>(() => false);
/** Délai maximal d'une requête (ms). */
export const TIMEOUT_MS = new HttpContextToken<number>(() => 30_000);
/** 401 attendu (ex. `/users/isUser`) : pas de redirection. */
export const ALLOW_401 = new HttpContextToken<boolean>(() => false);

const TRANSIENT = new Set([0, 502, 503, 504]);

/**
 * Intercepteur HTTP :
 *  - envoie les cookies (SSO) ;
 *  - applique un délai maximal ;
 *  - réessaie une fois les lectures (GET) en cas d'erreur réseau transitoire ;
 *  - normalise l'erreur en `AppError`, la notifie sauf `SILENT`, et redirige vers /unauthorized
 *    si la session SSO a expiré.
 */
export const httpErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const reporter = inject(ErrorReporter);
  const router = inject(Router);
  const isRead = req.method === 'GET' || req.method === 'HEAD';

  return next(req.clone({ withCredentials: true })).pipe(
    timeout(req.context.get(TIMEOUT_MS)),
    retry({
      count: isRead ? 1 : 0,
      delay: (e) => (e instanceof HttpErrorResponse && TRANSIENT.has(e.status) ? timer(800) : throwError(() => e)),
    }),
    catchError((e: unknown) => {
      const err = toAppError(e);
      if (err.kind === 'unauthenticated' && !req.context.get(ALLOW_401)) {
        void router.navigateByUrl('/unauthorized');
      }
      if (!req.context.get(SILENT)) reporter.report(err);
      return throwError(() => err);
    }),
  );
};
