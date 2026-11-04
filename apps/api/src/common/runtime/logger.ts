import cluster from 'node:cluster';
import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import type { AppConfig } from '../../config/configuration.js';

/** Du moins au plus bavard. */
export const LOG_LEVELS = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'] as const satisfies readonly LogLevel[];
export type RniLogLevel = (typeof LOG_LEVELS)[number];

export function isLogLevel(v: unknown): v is RniLogLevel {
  return typeof v === 'string' && (LOG_LEVELS as readonly string[]).includes(v);
}

/** Niveaux actifs pour un seuil (`log` → fatal, error, warn, log). */
export function levelsUpTo(level: RniLogLevel): LogLevel[] {
  return LOG_LEVELS.slice(0, LOG_LEVELS.indexOf(level) + 1);
}

/** Lit `Contexte=niveau,Autre=niveau` (entrées invalides ignorées et signalées). */
export function parseContextLevels(raw: string | null | undefined): { levels: Map<string, RniLogLevel>; invalid: string[] } {
  const levels = new Map<string, RniLogLevel>();
  const invalid: string[] = [];
  for (const part of (raw ?? '').split(/[,;\s]+/).filter(Boolean)) {
    const [ctx, lvl] = part.split('=').map((s) => s.trim());
    if (ctx && isLogLevel(lvl?.toLowerCase())) levels.set(ctx, lvl.toLowerCase() as RniLogLevel);
    else invalid.push(part);
  }
  return { levels, invalid };
}

/**
 * Journalisation applicative (sortie standard → journald / Docker) : JSON en production, texte en
 * développement. En plus du seuil global, un seuil **par contexte** (nom passé à `new Logger(…)`)
 * permet par exemple de passer `PlanningService` en debug sans inonder le reste. Les seuils sont
 * modifiables à chaud (cf. LogSettingsService, paramètres `rni.log.*` de `t_param_app`).
 */
export class RniLogger extends ConsoleLogger {
  private threshold: RniLogLevel = 'log';
  private contexts = new Map<string, RniLogLevel>();

  configure(threshold: RniLogLevel, contexts: Map<string, RniLogLevel> = new Map()): void {
    this.threshold = threshold;
    this.contexts = contexts;
    // Le ConsoleLogger laisse passer le plus bavard des seuils ; le filtrage fin est fait ci-dessous.
    const widest = [threshold, ...contexts.values()].reduce((a, b) => (LOG_LEVELS.indexOf(b) > LOG_LEVELS.indexOf(a) ? b : a));
    this.setLogLevels(levelsUpTo(widest));
  }

  get level(): RniLogLevel {
    return this.threshold;
  }

  get contextLevels(): ReadonlyMap<string, RniLogLevel> {
    return this.contexts;
  }

  /** Le message de ce niveau, dans ce contexte, doit-il être écrit ? */
  enabledFor(level: RniLogLevel, context?: string): boolean {
    const limit = (context && this.contexts.get(context)) || this.threshold;
    return LOG_LEVELS.indexOf(level) <= LOG_LEVELS.indexOf(limit);
  }

  private contextOf(params: unknown[]): string | undefined {
    const last = params[params.length - 1];
    return typeof last === 'string' ? last : this.context;
  }

  override log(message: unknown, ...params: unknown[]): void {
    if (this.enabledFor('log', this.contextOf(params))) super.log(message, ...params);
  }
  override warn(message: unknown, ...params: unknown[]): void {
    if (this.enabledFor('warn', this.contextOf(params))) super.warn(message, ...params);
  }
  override debug(message: unknown, ...params: unknown[]): void {
    if (this.enabledFor('debug', this.contextOf(params))) super.debug(message, ...params);
  }
  override verbose(message: unknown, ...params: unknown[]): void {
    if (this.enabledFor('verbose', this.contextOf(params))) super.verbose(message, ...params);
  }
}

let current: RniLogger | null = null;

/** Logger du processus (null dans les tests qui n'utilisent pas createLogger). */
export function appLogger(): RniLogger | null {
  return current;
}

export function createLogger(cfg: AppConfig): RniLogger {
  const prefix = cluster.isWorker ? `rni-api:w${cluster.worker?.id}` : 'rni-api';
  const logger = new RniLogger({ json: cfg.log.format === 'json', colors: cfg.log.format === 'text' && process.stdout.isTTY, prefix });
  logger.configure(cfg.log.level);
  current = logger;
  return logger;
}
