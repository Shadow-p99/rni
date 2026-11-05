import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Transaction } from 'sequelize';
import {
  AdminMessage,
  FormulaireChamp,
  FormulaireSection,
  ParamApp,
  PerimetreProfil,
  Planning,
  ProfilClassement,
  ProfilDroit,
  ProfilGestion,
  RefDroit,
  RefPosService,
  RefProfil,
  RefTypeCrise,
  RefUser,
} from '../../database/models/index.js';
import { CacheService, CacheTag } from './cache.service.js';

const HOOKS = ['afterCreate', 'afterUpdate', 'afterDestroy', 'afterBulkCreate', 'afterBulkUpdate', 'afterBulkDestroy', 'afterUpsert'] as const;

/**
 * Invalidation **automatique** : toute écriture Sequelize sur une table mise en cache invalide
 * l'étiquette correspondante. Dans une transaction, l'invalidation est refaite après le commit
 * (une lecture concurrente ne peut pas remettre en cache l'état d'avant l'écriture).
 */
@Injectable()
export class CacheInvalidationService implements OnModuleInit {
  private readonly logger = new Logger(CacheInvalidationService.name);

  constructor(private readonly cache: CacheService) {}

  onModuleInit(): void {
    // Plannings : calendrier, compteurs, carte. Comptes : idem (noms, régions) + authentification.
    this.watch(Planning, [CacheTag.PLANNING]);
    this.watch(RefUser, [CacheTag.USERS, CacheTag.PLANNING]);
    this.watch(ParamApp, [CacheTag.PARAM]);
    // Paramétrage (Administration) : effet immédiat sur ce processus, les autres via PostgreSQL
    for (const m of [ProfilDroit, ProfilGestion, RefDroit, PerimetreProfil, AdminMessage]) this.watch(m, [CacheTag.PARAM]);
    for (const m of [RefProfil, ProfilClassement]) this.watch(m, [CacheTag.REFERENTIEL, CacheTag.USERS, CacheTag.PARAM]);
    this.watch(RefPosService, [CacheTag.REFERENTIEL, CacheTag.PLANNING]);
    for (const m of [RefTypeCrise, FormulaireSection, FormulaireChamp]) this.watch(m, [CacheTag.REFERENTIEL]);
  }

  private watch(model: { getTableName(): unknown }, tags: CacheTag[]): void {
    for (const hook of HOOKS) {
      (model as unknown as { addHook(h: string, n: string, fn: (...a: unknown[]) => void): void }).addHook(hook, `rni-cache-${hook}`, (...args: unknown[]) => {
        this.cache.invalidate(...tags);
        const options = args.find((a): a is { transaction?: Transaction | null } => !!a && typeof a === 'object' && 'transaction' in a);
        options?.transaction?.afterCommit(() => this.cache.invalidate(...tags));
      });
    }
    this.logger.debug(`Invalidation du cache sur ${model.getTableName()} → ${tags.join(', ')}`);
  }
}
