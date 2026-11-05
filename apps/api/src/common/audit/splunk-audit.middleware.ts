import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { RniRequest } from '../auth/current-user.js';
import { SplunkAuditService } from './splunk-audit.service.js';

/** BR-SEC-1 : routes métier auditées (et administration). */
export const AUDITED_ROUTES = [
  /\/admin(\/|$)/,
  /\/users(\/|$)/,
  /\/planning(\/|$)/,
  /\/formulaire(\/|$)/,
  /\/service\/(geoloc|coordinates|isochrone|listTelUser)(\/|$)/,
];

export type AuditedRequest = Request & RniRequest & { id?: string; rniNoAudit?: boolean };

/**
 * Audit Splunk (BR-SEC-1) : **premier middleware** de la chaîne, il enregistre chaque requête sur
 * une route métier à la fin de la réponse — y compris celles **refusées** avant d'atteindre un
 * contrôleur (401 nigend inconnu ou requête hors reverse-proxy, 403 profil non autorisé, 404).
 * Les routes marquées `@NoAudit()` sont exclues (indicateur posé par l'AuthGuard).
 * L'adresse IP est celle du client vue à travers les proxys de confiance (TRUST_PROXY).
 */
@Injectable()
export class SplunkAuditMiddleware implements NestMiddleware {
  constructor(private readonly audit: SplunkAuditService) {}

  use(req: AuditedRequest, res: Response, next: NextFunction): void {
    const path = req.originalUrl.split('?')[0];
    if (!AUDITED_ROUTES.some((r) => r.test(path))) return next();
    const started = process.hrtime.bigint();
    const at = new Date();
    res.once('finish', () => {
      if (req.rniNoAudit) return;
      const user = req.rniUser ?? null;
      const header = req.headers['nigend'];
      const size = Number(res.getHeader('content-length'));
      this.audit.record({
        horodatage: at,
        ip: req.ip ?? null,
        route: path,
        methode: req.method,
        statut: res.statusCode,
        authentifie: !!user,
        // Requête refusée : nigend présenté (non vérifié), utile aux enquêtes de sécurité
        rio_user: user?.nigend ?? (typeof header === 'string' ? header.slice(0, 8) : null),
        code_unite: user?.code_unite ?? null,
        role: user?.libelle_profil ?? null,
        duree_ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
        taille_reponse: Number.isFinite(size) ? size : null,
        request_id: req.id ?? null,
        user_agent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      });
    });
    next();
  }
}
