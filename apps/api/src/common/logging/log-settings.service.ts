import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import {
  LOG_CONTEXT_PATTERN,
  LOG_DB_THRESHOLDS,
  MAX_LOG_CONTEXTS,
  type LogContextLevel,
  type LogSettingsDto,
  type LogSettingsUpdateDto,
  type LogSettingsValues,
  type LogThreshold,
} from '@rni/shared';
import { Op } from 'sequelize';
import { APP_CONFIG, type AppConfig } from '../../config/configuration.js';
import { Db } from '../../database/db.service.js';
import { AppLog, ParamApp, RefUser } from '../../database/models/index.js';
import { tryAdvisoryXactLock } from '../../database/postgres.js';
import { ParamService } from '../../modules/external/param.service.js';
import { BusinessException } from '../business.exception.js';
import { CacheService, CacheTag } from '../cache/cache.service.js';
import { logSink } from './log-sink.js';
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
  /** Niveau à partir duquel les journaux sont conservés en base. */
  DB_LEVEL: 'rni.log.db_level',
  RETENTION_DAYS: 'rni.log.retention_days',
  METRICS_RETENTION_DAYS: 'rni.metrics.retention_days',
  /** Fin de validité (ISO) des réglages verbeux (niveau, contextes, SQL) ; vide = permanent. */
  EXPIRES_AT: 'rni.log.expires_at',
  UPDATED_BY: 'rni.log.updated_by',
  UPDATED_AT: 'rni.log.updated_at',
} as const;

export interface LogSettings {
  level: RniLogLevel;
  levelSource: 'base' | 'environnement';
  contexts: Record<string, RniLogLevel>;
  sql: boolean;
  slowMs: number;
  /** Fin de validité des réglages verbeux appliqués (null : permanent ou défauts). */
  expiresAt: string | null;
}

/** Réglages courants, lisibles sans injection (journal SQL de Sequelize, middleware HTTP). */
export const currentLogSettings: LogSettings = { level: 'log', levelSource: 'environnement', contexts: {}, sql: false, slowMs: 1000, expiresAt: null };

/** Contextes proposés dans le formulaire (complétés par ceux vus récemment dans le journal). */
const KNOWN_CONTEXTS = [
  'HTTP', 'SQL', 'AuthGuard', 'PerimetreService', 'PlanningService', 'UsersService', 'FormulaireService', 'ParamService',
  'CacheService', 'CacheNotifyService', 'LogSettingsService', 'LogPersistService', 'MetricsService', 'DashboardService',
  'ExternalHttp', 'Geoloc', 'Remop', 'Facade', 'HealthController', 'ErrorHandler', 'Audit', 'Security', 'MockAuth', 'Lifecycle',
];

const EXPIRY_LOCK = 4_242_019;
const MAX_TIMER_MS = 24 * 3_600_000;

const int = (v: string | null, def: number, min: number, max: number) => {
  const n = Number(v);
  return v != null && v !== '' && Number.isInteger(n) && n >= min && n <= max ? n : def;
};

/**
 * Niveau de journalisation **piloté par la base** (`t_param_app`, clés `rni.log.*`), appliqué à
 * chaud dans chaque processus :
 * - au démarrage ;
 * - à chaque modification de `t_param_app` (notification PostgreSQL → tous les workers / serveurs) ;
 * - et au plus tard toutes les 60 s (filet de sécurité).
 * Une valeur absente ou invalide retombe sur la variable d'environnement (`LOG_LEVEL`, `PG_LOGGING`).
 * Les réglages verbeux peuvent avoir une **fin de validité** (`rni.log.expires_at`) : passé ce
 * délai, chaque processus revient aux valeurs par défaut et l'un d'eux nettoie la base.
 */
@Injectable()
export class LogSettingsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(LogSettingsService.name);
  private timer: NodeJS.Timeout | null = null;
  private expiryTimer: NodeJS.Timeout | null = null;
  private pending: Promise<void> | null = null;
  private signature = '';

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly params: ParamService,
    private readonly cache: CacheService,
    private readonly db: Db,
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
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
  }

  get settings(): LogSettings {
    return { ...currentLogSettings, contexts: { ...currentLogSettings.contexts } };
  }

  /** Relit les paramètres et applique les changements (appels concurrents mutualisés). */
  refresh(): Promise<void> {
    this.pending ??= this.load().finally(() => (this.pending = null));
    return this.pending;
  }

  private async raw(): Promise<Record<keyof typeof LogParam, string | null>> {
    const keys = Object.keys(LogParam) as (keyof typeof LogParam)[];
    const values = await Promise.all(keys.map((k) => this.params.get(LogParam[k])));
    return Object.fromEntries(keys.map((k, i) => [k, values[i]])) as Record<keyof typeof LogParam, string | null>;
  }

  private async load(): Promise<void> {
    let raw: Awaited<ReturnType<LogSettingsService['raw']>>;
    try {
      raw = await this.raw();
    } catch (e) {
      // Base indisponible : on conserve les réglages courants.
      this.logger.warn(`Paramètres de journalisation illisibles, réglages conservés : ${(e as Error).message}`);
      return;
    }

    // Fin de validité des réglages verbeux
    const expiresAt = raw.EXPIRES_AT ? new Date(raw.EXPIRES_AT) : null;
    const validExpiry = expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null;
    const expired = !!validExpiry && validExpiry.getTime() <= Date.now();
    this.scheduleExpiry(expired ? null : validExpiry);
    if (expired) void this.clearExpired(raw.EXPIRES_AT!);

    const wanted = expired ? '' : (raw.LEVEL?.trim().toLowerCase() ?? '');
    if (wanted && !isLogLevel(wanted)) this.logger.warn(`${LogParam.LEVEL}=« ${raw.LEVEL} » invalide (${LOG_LEVELS.slice(1).join(', ')}) : ignoré.`);
    const fromDb = !!wanted && isLogLevel(wanted) && wanted !== 'fatal';
    const level: RniLogLevel = fromDb ? (wanted as RniLogLevel) : this.cfg.log.level;
    const { levels: contexts, invalid } = parseContextLevels(expired ? '' : raw.CONTEXTS);
    if (invalid.length) this.logger.warn(`${LogParam.CONTEXTS} : entrée(s) ignorée(s) ${invalid.join(', ')} (format Contexte=niveau).`);
    const sqlRaw = expired ? '' : raw.SQL?.trim().toLowerCase();
    const sql = sqlRaw ? ['true', '1', 'on', 'yes'].includes(sqlRaw) : this.cfg.db.logging;
    const slowMs = int(raw.SLOW_MS, 1000, 1, 3_600_000);
    const verbose = fromDb || contexts.size > 0 || (!!sqlRaw && sql);
    const effectiveExpiry = !expired && verbose && validExpiry ? validExpiry.toISOString() : null;

    const signature = JSON.stringify([level, [...contexts], sql, slowMs, effectiveExpiry]);
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
      expiresAt: effectiveExpiry,
    } satisfies LogSettings);

    const summary =
      `Journalisation : niveau ${level} (${currentLogSettings.levelSource})` +
      (contexts.size ? `, contextes ${[...contexts].map(([c, l]) => `${c}=${l}`).join(', ')}` : '') +
      `, SQL ${sql ? 'actif' : 'inactif'}, seuil lent ${slowMs} ms` +
      (effectiveExpiry ? `, jusqu'au ${new Date(effectiveExpiry).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}` : '');
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

  /** Relecture à l'échéance (le minuteur de 60 s reste le filet de sécurité). */
  private scheduleExpiry(at: Date | null): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    if (!at) return;
    const ms = Math.min(Math.max(at.getTime() - Date.now(), 0) + 200, MAX_TIMER_MS);
    this.expiryTimer = setTimeout(() => void this.refresh(), ms);
    this.expiryTimer.unref();
  }

  /** Échéance atteinte : un seul processus remet les réglages verbeux à leurs valeurs par défaut. */
  private async clearExpired(expiresAt: string): Promise<void> {
    try {
      const cleared = await this.db.transaction(async (transaction) => {
        if (!(await tryAdvisoryXactLock(this.db.sequelize, EXPIRY_LOCK, transaction))) return false;
        // Une modification faite entre-temps (nouvelle échéance) n'est pas écrasée
        const current = await ParamApp.findByPk(LogParam.EXPIRES_AT, { transaction, lock: transaction.LOCK.UPDATE });
        if (current?.valeur !== expiresAt) return false;
        await ParamApp.update({ valeur: '' }, { where: { cle_param_app: { [Op.in]: [LogParam.LEVEL, LogParam.CONTEXTS, LogParam.EXPIRES_AT] } }, transaction });
        await ParamApp.update({ valeur: 'false' }, { where: { cle_param_app: LogParam.SQL }, transaction });
        return true;
      });
      if (cleared) this.logger.log('Réglages temporaires de journalisation expirés : retour aux valeurs par défaut.');
    } catch (e) {
      this.logger.warn(`Nettoyage des réglages expirés impossible : ${(e as Error).message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Écran Administration
  // ---------------------------------------------------------------------------

  async describe(): Promise<LogSettingsDto> {
    const raw = await this.raw();
    const expiresAt = raw.EXPIRES_AT ? new Date(raw.EXPIRES_AT) : null;
    const expired = !!expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now();
    const level = raw.LEVEL?.trim().toLowerCase() ?? '';
    const dbLevel = raw.DB_LEVEL?.trim().toLowerCase() ?? '';
    const contexts: LogContextLevel[] = [...parseContextLevels(raw.CONTEXTS).levels]
      .filter(([, l]) => l !== 'fatal')
      .map(([contexte, niveau]) => ({ contexte, niveau: niveau as LogThreshold }));

    const [seen, author] = await Promise.all([
      this.cache.wrap('admin:log-contexts', 300_000, () =>
        AppLog.findAll({
          attributes: ['contexte'],
          where: { horodatage: { [Op.gte]: new Date(Date.now() - 7 * 86_400_000) }, contexte: { [Op.ne]: null } },
          group: ['contexte'],
          limit: 200,
          raw: true,
        }).catch(() => [] as { contexte: string | null }[]),
      ),
      raw.UPDATED_BY
        ? RefUser.findOne({ attributes: ['grade', 'prenom', 'nom'], where: { nigend: raw.UPDATED_BY }, raw: true }).then((u) =>
            u ? { nom: `${u.grade ?? ''} ${u.prenom} ${u.nom}`.trim() } : null,
          )
        : Promise.resolve(null),
    ]);
    const known = [...new Set([...KNOWN_CONTEXTS, ...seen.map((s) => s.contexte).filter((c): c is string => !!c)])]
      .filter((c) => LOG_CONTEXT_PATTERN.test(c) && !['RouterExplorer', 'RoutesResolver', 'InstanceLoader', 'NestFactory', 'NestApplication'].includes(c))
      .sort((a, b) => a.localeCompare(b));

    const s = this.settings;
    return {
      enregistre: {
        level: isLogLevel(level) && level !== 'fatal' ? level : '',
        contexts,
        sql: ['true', '1', 'on', 'yes'].includes(raw.SQL?.trim().toLowerCase() ?? ''),
        slow_ms: int(raw.SLOW_MS, 1000, 1, 3_600_000),
        db_level: (LOG_DB_THRESHOLDS as readonly string[]).includes(dbLevel) ? (dbLevel as LogThreshold) : 'log',
        retention_days: int(raw.RETENTION_DAYS, 14, 1, 3650),
        metrics_retention_days: int(raw.METRICS_RETENTION_DAYS, 30, 1, 3650),
        expires_at: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt.toISOString() : null,
        expire: expired,
      },
      applique: {
        pid: process.pid,
        level: s.level as LogThreshold,
        source: s.levelSource,
        contexts: s.contexts as Record<string, LogThreshold>,
        sql: s.sql,
        slow_ms: s.slowMs,
        db_level: logSink.level,
      },
      defaut: { level: this.cfg.log.level, sql: this.cfg.db.logging },
      contextes_connus: known,
      derniere_modification: raw.UPDATED_BY && raw.UPDATED_AT ? { par: raw.UPDATED_BY, nom: author?.nom ?? null, le: raw.UPDATED_AT } : null,
    };
  }

  /**
   * Enregistre les réglages (une transaction) : la notification PostgreSQL les propage à tous les
   * processus ; celui-ci les applique avant de répondre.
   */
  async update(dto: LogSettingsUpdateDto, by: string): Promise<{ before: LogSettingsValues; after: LogSettingsValues }> {
    const contexts = normalizeContexts(dto.contexts);
    const before = (await this.describe()).enregistre;
    const verbose = !!dto.level || contexts.length > 0 || dto.sql;
    const expiresAt = verbose && dto.duree_min ? new Date(Date.now() + dto.duree_min * 60_000).toISOString() : '';
    const values: Record<string, string> = {
      [LogParam.LEVEL]: dto.level,
      [LogParam.CONTEXTS]: contexts.map((c) => `${c.contexte}=${c.niveau}`).join(','),
      [LogParam.SQL]: String(dto.sql),
      [LogParam.SLOW_MS]: String(dto.slow_ms),
      [LogParam.DB_LEVEL]: dto.db_level,
      [LogParam.RETENTION_DAYS]: String(dto.retention_days),
      [LogParam.METRICS_RETENTION_DAYS]: String(dto.metrics_retention_days),
      [LogParam.EXPIRES_AT]: expiresAt,
      [LogParam.UPDATED_BY]: by,
      [LogParam.UPDATED_AT]: new Date().toISOString(),
    };
    await this.db.transaction(async (transaction) => {
      for (const [cle_param_app, valeur] of Object.entries(values)) {
        const [, created] = await ParamApp.findOrCreate({ where: { cle_param_app }, defaults: { cle_param_app, valeur, is_front: false }, transaction });
        if (!created) await ParamApp.update({ valeur }, { where: { cle_param_app }, transaction });
      }
    });
    // Application immédiate dans ce processus (les autres : notification PostgreSQL)
    this.cache.invalidate(CacheTag.PARAM);
    await this.refresh();
    const after: LogSettingsValues = {
      level: dto.level,
      contexts,
      sql: dto.sql,
      slow_ms: dto.slow_ms,
      db_level: dto.db_level,
      retention_days: dto.retention_days,
      metrics_retention_days: dto.metrics_retention_days,
    };
    return { before, after };
  }
}

/** Contextes dédoublonnés (le dernier l'emporte), validés et triés. */
export function normalizeContexts(list: LogContextLevel[]): LogContextLevel[] {
  const map = new Map<string, LogThreshold>();
  for (const c of list) {
    const name = c.contexte.trim();
    if (!LOG_CONTEXT_PATTERN.test(name)) throw BusinessException.invalid(`Contexte invalide : « ${c.contexte} » (lettres, chiffres, . _ -).`);
    map.set(name, c.niveau);
  }
  if (map.size > MAX_LOG_CONTEXTS) throw BusinessException.invalid(`${MAX_LOG_CONTEXTS} contextes au plus.`);
  return [...map].map(([contexte, niveau]) => ({ contexte, niveau })).sort((a, b) => a.contexte.localeCompare(b.contexte));
}
