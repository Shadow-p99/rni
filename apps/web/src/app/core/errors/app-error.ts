import { HttpErrorResponse } from '@angular/common/http';
import type { ApiError, MessageType } from '@rni/shared';

/**
 * Catégories d'erreurs gérées par le client. Toute erreur (HTTP, réseau, délai, chargement de
 * module, exception JavaScript) est normalisée en `AppError` avant d'être affichée.
 */
export type ErrorKind =
  | 'business' // erreur métier renvoyée par l'API (HTTP 400 + code RNI-xxxx)
  | 'unauthenticated' // 401 : SSO expiré ou compte non habilité
  | 'forbidden' // 403 : action non autorisée / hors périmètre
  | 'not-found' // 404
  | 'network' // serveur injoignable / hors ligne
  | 'timeout' // délai dépassé
  | 'server' // 5xx
  | 'chunk' // échec de chargement d'un module (nouvelle version déployée, coupure réseau)
  | 'unexpected'; // exception non prévue

export class AppError extends Error {
  /** Déjà notifiée à l'utilisateur (évite les doubles notifications). */
  reported = false;

  constructor(
    readonly kind: ErrorKind,
    readonly title: string,
    readonly detail?: string,
    readonly code?: string,
    readonly status?: number,
    readonly severity: MessageType = 'ERREUR',
    override readonly cause?: unknown,
  ) {
    super(detail ? `${title} — ${detail}` : title);
    this.name = 'AppError';
  }

  /** Erreur susceptible de disparaître en réessayant. */
  get retryable(): boolean {
    return this.kind === 'network' || this.kind === 'timeout' || this.kind === 'server' || this.kind === 'chunk';
  }
}

function isApiError(body: unknown): body is ApiError {
  return !!body && typeof body === 'object' && 'code' in body && 'message' in body;
}

const CHUNK_ERROR = /Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

/** Normalise n'importe quelle erreur en `AppError`. */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;

  if (e instanceof HttpErrorResponse) {
    const body = e.error;
    if (isApiError(body)) {
      const kind: ErrorKind =
        e.status === 401 ? 'unauthenticated' : e.status === 403 ? 'forbidden' : e.status === 404 ? 'not-found' : e.status >= 500 ? 'server' : 'business';
      return new AppError(kind, body.message, body.details, body.code, e.status, body.type, e);
    }
    if (e.status === 0) {
      return new AppError('network', 'Serveur injoignable', 'Vérifiez votre connexion au réseau puis réessayez.', undefined, 0, 'ERREUR', e);
    }
    if (e.status === 401) return new AppError('unauthenticated', 'Session expirée', 'Reconnectez-vous via le SSO.', undefined, 401, 'ERREUR', e);
    if (e.status === 403) return new AppError('forbidden', 'Action non autorisée', undefined, undefined, 403, 'ERREUR', e);
    if (e.status === 404) return new AppError('not-found', 'Ressource introuvable', undefined, undefined, 404, 'ERREUR', e);
    if (e.status === 504 || e.status === 408) return new AppError('timeout', 'Le serveur met trop de temps à répondre', 'Réessayez dans quelques instants.', undefined, e.status, 'ERREUR', e);
    if (e.status >= 500) return new AppError('server', 'Le service est momentanément indisponible', `Erreur HTTP ${e.status}. Réessayez dans quelques instants.`, undefined, e.status, 'ERREUR', e);
    return new AppError('unexpected', 'Réponse inattendue du serveur', `Erreur HTTP ${e.status}.`, undefined, e.status, 'ERREUR', e);
  }

  if (e && typeof e === 'object' && (e as { name?: string }).name === 'TimeoutError') {
    return new AppError('timeout', 'Le serveur met trop de temps à répondre', 'Réessayez dans quelques instants.', undefined, undefined, 'ERREUR', e);
  }

  const message = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  if (CHUNK_ERROR.test(message) || (e as { name?: string })?.name === 'ChunkLoadError') {
    return new AppError('chunk', "Une nouvelle version de l'application est disponible", 'Rechargez la page pour continuer.', undefined, undefined, 'ERREUR', e);
  }
  return new AppError('unexpected', 'Une erreur inattendue est survenue', message || undefined, undefined, undefined, 'ERREUR', e);
}
