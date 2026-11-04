import { HttpContext, HttpParams } from '@angular/common/http';
import { ALLOW_401, SILENT, TIMEOUT_MS } from '../errors/http-error.interceptor';

/** Préfixe de l'API (même origine, derrière le reverse-proxy SSO — BR-AUTH-4). */
export const API = '/rni/api';

export interface RequestOptions {
  /** Ne pas notifier l'erreur automatiquement (l'appelant l'affiche). */
  silent?: boolean;
  timeoutMs?: number;
  allow401?: boolean;
}

export function ctx(opts: RequestOptions = {}): { context: HttpContext } {
  let c = new HttpContext();
  if (opts.silent) c = c.set(SILENT, true);
  if (opts.timeoutMs) c = c.set(TIMEOUT_MS, opts.timeoutMs);
  if (opts.allow401) c = c.set(ALLOW_401, true);
  return { context: c };
}

/** Paramètres de requête en ignorant les valeurs vides. */
export function toParams(obj: object): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(obj)) if (v != null && v !== '') p = p.set(k, String(v));
  return p;
}
