import cluster from 'node:cluster';
import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import type { AppConfig } from '../../config/configuration.js';

const ORDER: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

/**
 * Journalisation applicative sur la sortie standard (collectée par journald / Docker) :
 * JSON une ligne par événement en production (`LOG_FORMAT=json`), texte en développement.
 * Le préfixe identifie le processus (primaire ou worker du cluster).
 */
export function createLogger(cfg: AppConfig): ConsoleLogger {
  const prefix = cluster.isWorker ? `rni-api:w${cluster.worker?.id}` : 'rni-api';
  const levels = ORDER.slice(0, ORDER.indexOf(cfg.log.level) + 1);
  return new ConsoleLogger({ json: cfg.log.format === 'json', colors: cfg.log.format === 'text' && process.stdout.isTTY, logLevels: levels, prefix });
}
