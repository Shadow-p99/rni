import { hostname } from 'node:os';
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { AdminLogSplunk } from '../../database/models/index.js';

export interface SplunkAuditRow {
  horodatage: Date;
  ip: string | null;
  route: string;
  methode: string;
  statut: number | null;
  authentifie: boolean;
  rio_user: string | null;
  code_unite: string | null;
  role: string | null;
  duree_ms: number;
  taille_reponse: number | null;
  request_id: string | null;
  user_agent: string | null;
}

const FLUSH_MS = 2000;
const MAX_BUFFER = 20_000;
const HOST = hostname().slice(0, 128);

/**
 * BR-SEC-1 : lignes d'audit destinées à Splunk (`t_admin_log_splunk`), alimentées par
 * SplunkAuditMiddleware et écrites **par lots** toutes les 2 s (modèle AdminLogSplunk). Un job
 * Talend les transfère ensuite dans Splunk (docs/SPLUNK-TALEND.md).
 * Base indisponible : lignes conservées en mémoire (20 000 au plus) et réécrites ensuite.
 */
@Injectable()
export class SplunkAuditService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SplunkAuditService.name);
  private buffer: SplunkAuditRow[] = [];
  private dropped = 0;
  private failures = 0;
  private timer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> | null = null;

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }

  record(row: SplunkAuditRow): void {
    if (this.buffer.length >= MAX_BUFFER) {
      this.buffer.shift();
      this.dropped++;
    }
    this.buffer.push(row);
  }

  get pending(): number {
    return this.buffer.length;
  }

  flush(): Promise<void> {
    this.flushing ??= this.write().finally(() => (this.flushing = null));
    return this.flushing;
  }

  private async write(): Promise<void> {
    if (this.dropped) {
      this.logger.error(`${this.dropped} ligne(s) d'audit Splunk perdue(s) : tampon plein (base indisponible trop longtemps).`);
      this.dropped = 0;
    }
    const rows = this.buffer;
    if (!rows.length) return;
    this.buffer = [];
    const values = rows.map((r) => ({
      ...r,
      route: r.route.slice(0, 1024),
      user_agent: r.user_agent?.slice(0, 256) ?? null,
      institution: 'GN',
      hote: HOST,
      pid: process.pid,
    }));
    try {
      for (let i = 0; i < values.length; i += 500) {
        await AdminLogSplunk.bulkCreate(values.slice(i, i + 500), { logging: false, hooks: false, validate: false });
      }
      if (this.failures) this.logger.log(`Audit Splunk rétabli : ${rows.length} ligne(s) en attente écrite(s).`);
      this.failures = 0;
      this.logger.verbose(`Audit Splunk : ${rows.length} ligne(s) écrite(s)`);
    } catch (e) {
      this.buffer = [...rows, ...this.buffer].slice(-MAX_BUFFER);
      if (this.failures++ % 30 === 0) this.logger.warn(`Audit Splunk en base indisponible, ${this.buffer.length} ligne(s) en attente : ${(e as Error).message}`);
    }
  }
}
