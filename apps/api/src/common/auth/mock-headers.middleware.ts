import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/configuration.js';

export const MOCK_COOKIE = 'rni_mock_nigend';

/**
 * Développement uniquement (§8 « Comptes de test ») : simule les en-têtes du SSO amont.
 * Le nigend simulé provient du cookie `rni_mock_nigend` (sélecteur du client) ou de MOCK_NIGEND.
 */
@Injectable()
export class MockHeadersMiddleware implements NestMiddleware {
  constructor(@Inject(APP_CONFIG) private readonly cfg: AppConfig) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    if (this.cfg.mockAuth && !req.headers['nigend']) {
      const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[MOCK_COOKIE];
      const nigend = cookie === 'none' || (cookie && /^\d{5,8}$/.test(cookie)) ? cookie : this.cfg.mockNigend;
      if (nigend !== 'none') {
        req.headers['nigend'] = nigend;
        req.headers['cn'] ??= '';
        req.headers['title'] ??= '';
      }
    }
    next();
  }
}
