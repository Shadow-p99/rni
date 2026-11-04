import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestScope {
  id: string;
  nigend?: string;
}

/**
 * Contexte de la requête en cours (identifiant de corrélation, nigend), disponible dans tout le
 * code appelé pendant la requête : chaque ligne de journal conservée en base en est enrichie.
 */
export const requestStore = new AsyncLocalStorage<RequestScope>();
