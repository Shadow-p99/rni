import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger, NestMiddleware, Optional } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/configuration.js';
import type { RniRequest } from '../auth/current-user.js';
import { currentLogSettings } from '../logging/log-settings.service.js';
import { LifecycleService } from '../runtime/lifecycle.service.js';
import { requestStore } from '../runtime/request-store.js';
import { MetricsService, routePattern } from '../supervision/metrics.service.js';

export const PROXY_SECRET_HEADER = 'x-rni-proxy-secret';
const REQUEST_ID = /^[\w.:-]{8,128}$/;
/** Sondes accessibles sans secret (appelées localement par systemd / Docker / l'orchestrateur). */
const PROBES = /\/(health\/(live|ready)|service\/alive)$/;

export type RequestWithId = Request & RniRequest & { id?: string };

const access = new Logger('HTTP');

/**
 * Journal d'accès (contexte HTTP), une ligne par requête terminée :
 * méthode, chemin (sans paramètres de requête : ils peuvent contenir des noms), statut, durée,
 * taille, nigend, identifiant de corrélation. Niveau selon l'importance :
 * - sondes → verbose ; lecture → debug ; écriture → log ;
 * - 401 / 403, réponse ≥ 500 ou plus lente que `rni.log.slow_ms` → warn.
 */
function logAccess(req: RequestWithId, res: Response, started: bigint, aborted: boolean, metrics?: MetricsService | null): void {
  const ms = Number((process.hrtime.bigint() - started) / 1_000_000n);
  const path = req.originalUrl.split('?')[0];
  // Métriques (tableau de bord) : toutes les requêtes sauf les sondes
  if (metrics && !PROBES.test(path)) {
    const matched = (req.route as { path?: string } | undefined)?.path;
    metrics.record(req.method, routePattern(matched, path), aborted ? 499 : res.statusCode, ms, req.rniUser?.nigend ?? null);
  }
  const size = res.getHeader('content-length');
  const who = req.rniUser?.nigend ?? (typeof req.headers['nigend'] === 'string' ? `${req.headers['nigend']}?` : '-');
  const line = `${req.method} ${path} ${aborted ? 'interrompue' : res.statusCode} ${ms} ms${size ? ` ${size} o` : ''} nigend=${who} [${req.id}]`;
  if (PROBES.test(path)) return access.verbose(line);
  if (aborted) return access.debug(line);
  if (res.statusCode >= 500 || res.statusCode === 401 || res.statusCode === 403) return access.warn(line);
  if (ms >= currentLogSettings.slowMs) return access.warn(`Lente : ${line}`);
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return access.debug(line);
  access.log(line);
}

/**
 * Premier maillon de chaque requête :
 * - identifiant de corrélation `X-Request-Id` (celui de Nginx, sinon généré), renvoyé au client ;
 * - en-têtes de sécurité par défaut (réponses d'API : jamais mises en cache par défaut) ;
 * - si `PROXY_SHARED_SECRET` est défini, refus de toute requête qui ne vient pas du reverse-proxy
 *   SSO (seul habilité à fournir les en-têtes d'identité nigend / cn / title).
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('Security');
  private readonly secret: Buffer | null;

  constructor(
    @Inject(APP_CONFIG) cfg: AppConfig,
    private readonly lifecycle: LifecycleService,
    @Optional() private readonly metrics?: MetricsService,
  ) {
    this.secret = cfg.proxySecret ? Buffer.from(cfg.proxySecret) : null;
  }

  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'];
    req.id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', req.id);
    const started = process.hrtime.bigint();
    let done = false;
    res.once('finish', () => ((done = true), logAccess(req, res, started, false, this.metrics)));
    res.once('close', () => !done && logAccess(req, res, started, true, this.metrics));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    // Arrêt en cours : le client (Nginx) ne réutilise plus cette connexion → aucune requête perdue.
    if (this.lifecycle.draining) res.setHeader('Connection', 'close');

    if (this.secret && !PROBES.test(req.originalUrl.split('?')[0])) {
      const given = req.headers[PROXY_SECRET_HEADER];
      const ok = typeof given === 'string' && given.length === this.secret.length && timingSafeEqual(Buffer.from(given), this.secret);
      if (!ok) {
        this.logger.warn(`Requête refusée (hors reverse-proxy) ${req.method} ${req.originalUrl} depuis ${req.ip} [${req.id}]`);
        res.status(401).json({ code: 'RNI-0401', message: 'Utilisateur non authentifié ou non habilité à RNI.', type: 'ERREUR' });
        return;
      }
    }
    delete req.headers[PROXY_SECRET_HEADER];
    // Contexte de la requête (corrélation des journaux) pour toute la suite du traitement
    requestStore.run({ id: req.id }, next);
  }
}
