import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import type { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

/**
 * Accès à la connexion Sequelize : **transactions**. Les données se lisent et s'écrivent par les
 * modèles (`database/models`) ; les rares requêtes natives sans équivalent ORM sont regroupées
 * et justifiées dans `database/postgres.ts`.
 */
@Injectable()
export class Db {
  constructor(@InjectConnection() readonly sequelize: Sequelize) {}

  transaction<T>(fn: (t: Transaction) => Promise<T>): Promise<T> {
    return this.sequelize.transaction(fn);
  }
}
