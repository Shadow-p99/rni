import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { DEFAULT_MESSAGES, ErrorCode, MessageType } from '@rni/shared';
import { AdminMessage } from '../database/models/index.js';

/** Catalogue des messages métier (`t_admin_messages`), mis en cache avec repli intégré. */
@Injectable()
export class MessagesService implements OnModuleInit {
  private readonly logger = new Logger(MessagesService.name);
  private cache = new Map<string, { libelle: string; type: MessageType }>();
  private loadedAt = 0;

  constructor(@InjectModel(AdminMessage) private readonly messages: typeof AdminMessage) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      const rows = await this.messages.findAll({ raw: true });
      this.cache = new Map(rows.map((r) => [r.code_message, { libelle: r.libelle, type: r.type as MessageType }]));
      this.loadedAt = Date.now();
    } catch (e) {
      this.logger.warn(`Catalogue des messages indisponible, repli sur les libellés intégrés : ${(e as Error).message}`);
    }
  }

  get(code: string): { libelle: string; type: MessageType } {
    if (Date.now() - this.loadedAt > 10 * 60_000) void this.refresh();
    return (
      this.cache.get(code) ??
      DEFAULT_MESSAGES[code as ErrorCode] ??
      DEFAULT_MESSAGES[ErrorCode.TECHNIQUE]
    );
  }
}
