import { hostname } from 'node:os';
import { LOG_LEVELS, type RniLogLevel } from '../runtime/logger.js';
import { requestStore } from '../runtime/request-store.js';

export interface LogRow {
  horodatage: Date;
  niveau: RniLogLevel;
  contexte: string | null;
  message: string;
  pile: string | null;
  request_id: string | null;
  nigend: string | null;
  pid: number;
  hote: string;
}

const HOST = hostname().slice(0, 128);
/** Démarrage du framework (une ligne par module / route à chaque démarrage) : console seulement, sauf alerte. */
const FRAMEWORK = new Set(['RouterExplorer', 'RoutesResolver', 'InstanceLoader', 'NestFactory', 'NestApplication']);
const MAX_BUFFER = 5000;
const MAX_MESSAGE = 8000;
const MAX_STACK = 16_000;

function text(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.message;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

/**
 * Tampon des journaux à conserver en base (`t_app_logs`), alimenté par RniLogger et vidé par lots
 * (LogPersistService). Indépendant du seuil d'affichage sur la sortie standard : seuil propre
 * `rni.log.db_level`. Le contexte SQL n'est conservé en dessous de warn que si le journal SQL est
 * activé (Administration › Réglages des journaux).
 */
class LogSink {
  level: RniLogLevel = 'log';
  /**
   * Journal SQL demandé (`rni.log.sql`, durée limitée) : chaque requête SQL est alors conservée en
   * base, quel que soit le seuil `rni.log.db_level`, pour être consultée dans le Journal.
   */
  sql = false;
  /** Actif quand un écrivain est branché (processus avec base de données). */
  active = false;
  private buffer: LogRow[] = [];
  dropped = 0;

  accepts(level: RniLogLevel, context: string | undefined): boolean {
    if (!this.active) return false;
    const belowWarn = LOG_LEVELS.indexOf(level) > LOG_LEVELS.indexOf('warn');
    if (context === 'SQL' && this.sql) return true;
    if (belowWarn && context && (context === 'SQL' || FRAMEWORK.has(context))) return false;
    return LOG_LEVELS.indexOf(level) <= LOG_LEVELS.indexOf(this.level);
  }

  capture(level: RniLogLevel, message: unknown, context: string | undefined, stack?: unknown): void {
    if (!this.accepts(level, context)) return;
    const scope = requestStore.getStore();
    const st = stack instanceof Error ? stack.stack : typeof stack === 'string' ? stack : message instanceof Error ? message.stack : undefined;
    if (this.buffer.length >= MAX_BUFFER) {
      this.buffer.shift();
      this.dropped++;
    }
    this.buffer.push({
      horodatage: new Date(),
      niveau: level,
      contexte: context?.slice(0, 80) ?? null,
      message: text(message).slice(0, MAX_MESSAGE),
      pile: st ? st.slice(0, MAX_STACK) : null,
      request_id: scope?.id ?? null,
      nigend: scope?.nigend ?? null,
      pid: process.pid,
      hote: HOST,
    });
  }

  /** Retire les entrées en attente (l'appelant les écrit, ou les remet en cas d'échec). */
  drain(): LogRow[] {
    const rows = this.buffer;
    this.buffer = [];
    return rows;
  }

  restore(rows: LogRow[]): void {
    this.buffer = [...rows, ...this.buffer].slice(-MAX_BUFFER);
  }

  get pending(): number {
    return this.buffer.length;
  }
}

export const logSink = new LogSink();
