import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AdminLog } from '../database/models/index.js';


/**
 * Journaux d'audit métier (BR-SEC-2, BR-SEC-3) ; l'audit Splunk (BR-SEC-1) est dans common/audit. Une indisponibilité de la base ne doit jamais
 * empêcher la réponse (dette §9.10) : repli sur la journalisation applicative.
 */
@Injectable()
export class AdminLogService {
  private readonly logger = new Logger('Audit');

  constructor(
    @InjectModel(AdminLog) private readonly logs: typeof AdminLog,
  ) {}

  async business(entry: { code: string; nigend: string | null; methode: string; url: string; body: unknown; description: string }): Promise<void> {
    const description = entry.description.slice(0, 4000);
    try {
      await this.logs.create({
        code_message: entry.code,
        nigend: entry.nigend,
        methode: entry.methode,
        url: entry.url.slice(0, 1024),
        body: entry.body == null ? null : JSON.stringify(entry.body).slice(0, 100_000),
        description,
      });
    } catch (e) {
      this.logger.error(`[${entry.code}] ${entry.methode} ${entry.url} (${entry.nigend ?? '-'}) ${description} — journal en base KO : ${(e as Error).message}`);
    }
  }

  /** BR-SEC-3 : traçabilité des écritures sur les comptes. */
  trace(action: string, nigendConnected: string, details: Record<string, unknown>): void {
    this.logger.log(`${action} nigend_connected=${nigendConnected} ${JSON.stringify(details)}`);
  }
}
