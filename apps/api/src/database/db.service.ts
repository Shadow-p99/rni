import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

/**
 * Accès SQL **paramétré** (dette §9.1) : toutes les valeurs passent par des `replacements`
 * nommés (`:nom`), jamais par concaténation.
 */
@Injectable()
export class Db {
  constructor(@InjectConnection() readonly sequelize: Sequelize) {}

  select<T extends object>(sql: string, replacements: Record<string, unknown> = {}, transaction?: Transaction): Promise<T[]> {
    return this.sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT, transaction });
  }

  async one<T extends object>(sql: string, replacements: Record<string, unknown> = {}, transaction?: Transaction): Promise<T | null> {
    const rows = await this.select<T>(sql, replacements, transaction);
    return rows[0] ?? null;
  }

  transaction<T>(fn: (t: Transaction) => Promise<T>): Promise<T> {
    return this.sequelize.transaction(fn);
  }
}
