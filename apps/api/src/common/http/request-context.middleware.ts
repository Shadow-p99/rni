import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/configuration.js';
import { LifecycleService } from '../runtime/lifecycle.service.js';

export const PROXY_SECRET_HEADER = 'x-rni-proxy-secret';
const REQUEST_ID = /^[\w.:-]{8,128}$/;
/** Sondes accessibles sans secret (appelées localement par systemd / Docker / l'orchestrateur). */
const PROBES = /\/(health\/(live|ready)|service\/alive)$/;

export type RequestWithId = Request & { id?: string };

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
  ) {
    this.secret = cfg.proxySecret ? Buffer.from(cfg.proxySecret) : null;
  }

  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'];
    req.id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', req.id);
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
    next();
  }
}
