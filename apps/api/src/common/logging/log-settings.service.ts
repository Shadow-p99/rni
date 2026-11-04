import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/configuration.js';
import { ParamService } from '../../modules/external/param.service.js';
import { CacheService, CacheTag } from '../cache/cache.service.js';
import { LOG_LEVELS, appLogger, isLogLevel, levelsUpTo, parseContextLevels, type RniLogLevel } from '../runtime/logger.js';

/** Clés `t_param_app` du réglage des journaux (non exposées au client). */
export const LogParam = {
  /** Seuil global : error | warn | log | debug | verbose (vide : variable LOG_LEVEL). */
  LEVEL: 'rni.log.level',
  /** Seuils par contexte : `PlanningService=debug,HTTP=warn` (vide : aucun). */
  CONTEXTS: 'rni.log.contexts',
  /** Requêtes SQL journalisées (debug, contexte SQL) : true / false. */
  SQL: 'rni.log.sql',
  /** Seuil « lent » (ms) des requêtes HTTP et SQL, signalées en warn. */
  SLOW_MS: 'rni.log.slow_ms',
} as const;

export interface LogSettings {
  level: RniLogLevel;
  levelSource: 'base' | 'environnement';
  contexts: Record<string, RniLogLevel>;
  sql: boolean;
  slowMs: number;
}

/** Réglages courants, lisibles sans injection (journal SQL de Sequelize, middleware HTTP). */
export const currentLogSettings: LogSettings = { level: 'log', levelSource: 'environnement', contexts: {}, sql: false, slowMs: 1000 };

/**
 * Niveau de journalisation **piloté par la base** (`t_param_app`, clés `rni.log.*`), appliqué à
 * chaud dans chaque processus :
 * - au démarrage ;
 * - à chaque modification de `t_param_app` (notification PostgreSQL → tous les workers / serveurs) ;
 * - et au plus tard toutes les 60 s (filet de sécurité).
 * Une valeur absente ou invalide retombe sur la variable d'environnement (`LOG_LEVEL`, `PG_LOGGING`).
 */
@Injectable()
export class LogSettingsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(LogSettingsService.name);
  private timer: NodeJS.Timeout | null = null;
  private pending: Promise<void> | null = null;
  private signature = '';

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly params: ParamService,
    private readonly cache: CacheService,
  ) {
    currentLogSettings.level = cfg.log.level;
    currentLogSettings.sql = cfg.db.logging;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.refresh();
    this.cache.onInvalidate((tags) => {
      if (tags.includes(CacheTag.PARAM)) void this.refresh();
    });
    this.timer = setInterval(() => void this.refresh(), 60_000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  get settings(): LogSettings {
    return { ...currentLogSettings, contexts: { ...currentLogSettings.contexts } };
  }

  /** Relit les paramètres et applique les changements (appels concurrents mutualisés). */
  refresh(): Promise<void> {
    this.pending ??= this.load().finally(() => (this.pending = null));
    return this.pending;
  }

  private async load(): Promise<void> {
    let raw: { level: string | null; contexts: string | null; sql: string | null; slow: string | null };
    try {
      const [level, contexts, sql, slow] = await Promise.all([
        this.params.get(LogParam.LEVEL),
        this.params.get(LogParam.CONTEXTS),
        this.params.get(LogParam.SQL),
        this.params.get(LogParam.SLOW_MS),
      ]);
      raw = { level, contexts, sql, slow };
    } catch (e) {
      // Base indisponible : on conserve les réglages courants.
      this.logger.warn(`Paramètres de journalisation illisibles, réglages conservés : ${(e as Error).message}`);
      return;
    }

    const wanted = raw.level?.trim().toLowerCase();
    if (wanted && !isLogLevel(wanted)) this.logger.warn(`${LogParam.LEVEL}=« ${raw.level} » invalide (${LOG_LEVELS.slice(1).join(', ')}) : ignoré.`);
    const fromDb = wanted && isLogLevel(wanted) && wanted !== 'fatal';
    const level: RniLogLevel = fromDb ? (wanted as RniLogLevel) : this.cfg.log.level;
    const { levels: contexts, invalid } = parseContextLevels(raw.contexts);
    if (invalid.length) this.logger.warn(`${LogParam.CONTEXTS} : entrée(s) ignorée(s) ${invalid.join(', ')} (format Contexte=niveau).`);
    const sqlRaw = raw.sql?.trim().toLowerCase();
    const sql = sqlRaw ? ['true', '1', 'on', 'yes'].includes(sqlRaw) : this.cfg.db.logging;
    const slowN = Number(raw.slow);
    const slowMs = raw.slow && Number.isInteger(slowN) && slowN > 0 ? slowN : 1000;

    const signature = JSON.stringify([level, [...contexts], sql, slowMs]);
    if (signature === this.signature) return;
    const first = this.signature === '';
    this.signature = signature;

    const previous = currentLogSettings.level;
    Object.assign(currentLogSettings, {
      level,
      levelSource: fromDb ? 'base' : 'environnement',
      contexts: Object.fromEntries(contexts),
      sql,
      slowMs,
    } satisfies LogSettings);

    const summary =
      `Journalisation : niveau ${level} (${currentLogSettings.levelSource})` +
      (contexts.size ? `, contextes ${[...contexts].map(([c, l]) => `${c}=${l}`).join(', ')}` : '') +
      `, SQL ${sql ? 'actif' : 'inactif'}, seuil lent ${slowMs} ms`;
    // Message écrit au niveau « warn » si le nouveau seuil le masquerait (passage en error / warn)
    const quieter = LOG_LEVELS.indexOf(level) < LOG_LEVELS.indexOf('log');
    if (quieter) this.logger.warn(summary);
    this.apply(level, contexts);
    if (!quieter && (!first || level !== previous || contexts.size || sql)) this.logger.log(summary);
  }

  private apply(level: RniLogLevel, contexts: Map<string, RniLogLevel>): void {
    const logger = appLogger();
    if (logger) logger.configure(level, contexts);
    // Sans RniLogger (tests) : seuil global seulement
    else Logger.overrideLogger(levelsUpTo(level));
  }
}
