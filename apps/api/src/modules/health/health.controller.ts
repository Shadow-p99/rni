import { Controller, Get, HttpCode, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';
import { NoAudit, Public } from '../../common/auth/decorators.js';
import { LifecycleService } from '../../common/runtime/lifecycle.service.js';
import { Db } from '../../database/db.service.js';

/**
 * Sondes d'exploitation (systemd, Docker, Kubernetes, load-balancer) :
 * - `live` : le processus répond (aucune dépendance) ;
 * - `ready` : il peut servir du trafic (base joignable, pas d'arrêt en cours) — 503 sinon.
 */
@Controller('health')
@Public()
@NoAudit()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly db: Db,
    private readonly lifecycle: LifecycleService,
  ) {}

  @Get('live')
  @HttpCode(200)
  live() {
    return { status: 'ok', pid: process.pid, uptimeS: Math.round(process.uptime()) };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    if (this.lifecycle.draining) {
      res.status(503);
      return { status: 'draining' };
    }
    try {
      await Promise.race([
        this.db.one('SELECT 1 AS ok'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('délai dépassé')), 2000).unref()),
      ]);
      return { status: 'ready' };
    } catch (e) {
      res.status(503);
      this.logger.warn(`Sonde de disponibilité en échec : base de données ${(e as Error).message}`);
      return { status: 'unavailable', reason: `base de données : ${(e as Error).message}` };
    }
  }
}
