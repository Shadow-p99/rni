import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Op } from 'sequelize';
import { Db } from '../../database/db.service.js';
import { AppLog, RequestMetric, UserActivity } from '../../database/models/index.js';
import { tryAdvisoryXactLock } from '../../database/postgres.js';
import { ParamService } from '../../modules/external/param.service.js';
import { CacheService, CacheTag } from '../cache/cache.service.js';
import { logSink } from '../logging/log-sink.js';
import { isLogLevel, type RniLogLevel } from '../runtime/logger.js';

const FLUSH_MS = 2000;
const HOUR = 3_600_000;
/** Verrou consultatif : une seule purge à la fois, quel que soit le nombre de processus. */
const PURGE_LOCK = 4_242_018;

/**
 * Conservation du journal en base (`t_app_logs`) : écriture par lots toutes les 2 s, seuil
 * `rni.log.db_level` relu à chaque changement de paramètres, purge horaire selon
 * `rni.log.retention_days` (et `rni.metrics.retention_days` pour les métriques).
 */
@Injectable()
export class LogPersistService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(LogPersistService.name);
  private flushTimer: NodeJS.Timeout | null = null;
  private purgeTimer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> | null = null;
  private failures = 0;

  constructor(
    private readonly db: Db,
    private readonly params: ParamService,
    private readonly cache: CacheService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.readLevel();
    logSink.active = true;
    this.cache.onInvalidate((tags) => tags.includes(CacheTag.PARAM) && void this.readLevel());
    this.flushTimer = setInterval(() => void this.flush(), FLUSH_MS);
    this.flushTimer.unref();
    // Première purge peu après le démarrage (décalée par processus), puis toutes les heures
    const first = setTimeout(() => void this.purge(), 60_000 + Math.floor(Math.random() * 60_000));
    first.unref();
    this.purgeTimer = setInterval(() => void this.purge(), HOUR);
    this.purgeTimer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.purgeTimer) clearInterval(this.purgeTimer);
    await this.flush();
    logSink.active = false;
  }

  private async readLevel(): Promise<void> {
    const raw = (await this.params.get('rni.log.db_level').catch(() => null))?.trim().toLowerCase();
    const level: RniLogLevel = raw && isLogLevel(raw) && raw !== 'fatal' ? raw : 'log';
    if (level !== logSink.level) this.logger.log(`Journal conservé en base à partir du niveau ${level}`);
    logSink.level = level;
  }

  flush(): Promise<void> {
    this.flushing ??= this.write().finally(() => (this.flushing = null));
    return this.flushing;
  }

  private async write(): Promise<void> {
    const rows = logSink.drain();
    if (logSink.dropped) {
      rows.push({ ...rows[rows.length - 1], niveau: 'warn', contexte: 'LogPersistService', message: `${logSink.dropped} entrée(s) de journal perdue(s) (tampon plein)`, pile: null, request_id: null, nigend: null, horodatage: new Date() });
      logSink.dropped = 0;
    }
    if (!rows.length) return;
    for (let i = 0; i < rows.length; i += 500) {
      try {
        // logging: false — l'écriture du journal ne doit pas produire de journal (pas de boucle)
        await AppLog.bulkCreate(rows.slice(i, i + 500) as unknown as Record<string, unknown>[], { logging: false, hooks: false, validate: false });
        this.failures = 0;
      } catch (e) {
        logSink.restore(rows.slice(i));
        // Sortie standard seulement (logSink inactif pour ce message afin d'éviter une boucle)
        if (this.failures++ % 30 === 0) {
          const active = logSink.active;
          logSink.active = false;
          this.logger.warn(`Journal en base indisponible, ${rows.length - i} entrée(s) en attente : ${(e as Error).message}`);
          logSink.active = active;
        }
        return;
      }
    }
  }

  /** Purge des anciennes données (un seul processus à la fois). */
  async purge(): Promise<void> {
    try {
      const days = async (key: string, def: number) => {
        const n = Number(await this.params.get(key));
        return Number.isInteger(n) && n > 0 ? n : def;
      };
      const [logs, metrics] = await Promise.all([days('rni.log.retention_days', 14), days('rni.metrics.retention_days', 30)]);
      // Verrou lié à la transaction (même connexion du pool, libéré au commit)
      const counts = await this.db.transaction(async (transaction) => {
        if (!(await tryAdvisoryXactLock(this.db.sequelize, PURGE_LOCK, transaction))) return null;
        const before = (days: number) => new Date(Date.now() - days * 86_400_000);
        const opts = { transaction, logging: false } as const;
        return [
          await AppLog.destroy({ where: { horodatage: { [Op.lt]: before(logs) } }, ...opts }),
          await RequestMetric.destroy({ where: { minute: { [Op.lt]: before(metrics) } }, ...opts }),
          await UserActivity.destroy({ where: { derniere_activite: { [Op.lt]: before(metrics) } }, ...opts }),
        ];
      });
      if (counts && counts.some((n) => n > 0)) {
        this.logger.log(`Purge : ${counts[0]} ligne(s) de journal (> ${logs} j), ${counts[1]} métrique(s) et ${counts[2]} activité(s) (> ${metrics} j)`);
      }
    } catch (e) {
      this.logger.warn(`Purge des données de supervision impossible : ${(e as Error).message}`);
    }
  }
}
