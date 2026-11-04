import { Logger } from '@nestjs/common';
import { currentLogSettings } from './log-settings.service.js';

const logger = new Logger('SQL');
const MAX_SQL = 2000;

/** Une requête : espaces normalisés, tronquée (les valeurs liées ne sont pas journalisées). */
function compact(sql: string): string {
  const s = sql.replace(/^Executed \((?:default|[\w-]+)\): /, '').replace(/\s+/g, ' ').trim();
  return s.length > MAX_SQL ? `${s.slice(0, MAX_SQL)}…` : s;
}

/**
 * Journal SQL de Sequelize (option `logging`, `benchmark: true`), piloté à chaud :
 * - `rni.log.sql=true` : chaque requête en debug (contexte SQL) avec sa durée ;
 * - toujours : requête plus lente que `rni.log.slow_ms` en warn.
 * Les paramètres liés (`replacements`) ne sont pas écrits : ni secrets ni données personnelles.
 */
export function sqlLogging(sql: string, timing?: number): void {
  const ms = typeof timing === 'number' ? timing : undefined;
  if (ms != null && ms >= currentLogSettings.slowMs) {
    logger.warn(`Requête lente (${ms} ms) : ${compact(sql)}`);
  } else if (currentLogSettings.sql) {
    logger.debug(`${ms != null ? `${ms} ms ` : ''}${compact(sql)}`);
  }
}
