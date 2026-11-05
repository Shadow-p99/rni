import { Logger } from '@nestjs/common';
import { currentLogSettings } from './log-settings.service.js';

const logger = new Logger('SQL');
const MAX_SQL = 2000;

/** Une requête : espaces normalisés, tronquée à 2 000 caractères. */
function compact(sql: string): string {
  const s = sql.replace(/^Executed \((?:default|[\w-]+)\): /, '').replace(/\s+/g, ' ').trim();
  return s.length > MAX_SQL ? `${s.slice(0, MAX_SQL)}…` : s;
}

/**
 * Journal SQL de Sequelize (option `logging`, `benchmark: true`), piloté à chaud :
 * - `rni.log.sql=true` (durée limitée) : chaque requête en debug (contexte SQL) avec sa durée,
 *   conservée dans le Journal et rattachée à la requête HTTP (request_id) ;
 * - toujours : requête plus lente que `rni.log.slow_ms` en warn.
 * Sequelize écrit les valeurs dans le texte SQL (nigend, termes recherchés) : réservé au
 * diagnostic, consultable par le seul droit `admin.acces`, purgé selon `rni.log.retention_days`.
 */
export function sqlLogging(sql: string, timing?: number): void {
  const ms = typeof timing === 'number' ? timing : undefined;
  if (ms != null && ms >= currentLogSettings.slowMs) {
    logger.warn(`Requête lente (${ms} ms) : ${compact(sql)}`);
  } else if (currentLogSettings.sql) {
    logger.debug(`${ms != null ? `${ms} ms ` : ''}${compact(sql)}`);
  }
}
