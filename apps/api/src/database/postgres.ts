import { QueryTypes, type Transaction } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';

/**
 * Les **seules** requêtes SQL natives de l'application, faute d'équivalent dans Sequelize.
 * Tout autre accès aux données passe par les modèles (`database/models`).
 * (Hors application : migrations de schéma, `database/migrator.ts`, et l'écoute LISTEN / NOTIFY
 * du cache, `common/cache/cache-notify.service.ts`, sur une connexion PostgreSQL dédiée.)
 */

/**
 * Verrou consultatif PostgreSQL lié à la transaction (`pg_try_advisory_xact_lock`) : une seule
 * exécution à la fois, quels que soient le nombre de workers et de serveurs. Libéré au commit.
 */
export async function tryAdvisoryXactLock(sequelize: Sequelize, key: number, transaction: Transaction): Promise<boolean> {
  const [row] = await sequelize.query<{ locked: boolean }>('SELECT pg_try_advisory_xact_lock(:key) AS locked', {
    replacements: { key },
    type: QueryTypes.SELECT,
    transaction,
  });
  return row?.locked === true;
}

/** Statistiques du serveur PostgreSQL (catalogue système) pour le tableau de bord. */
export async function databaseStats(sequelize: Sequelize): Promise<{ taille_mo: number; connexions_api: number; lignes_journal: number }> {
  const [row] = await sequelize.query<{ taille_mo: number; connexions_api: number; lignes_journal: number }>(
    `SELECT (pg_database_size(current_database()) / 1048576.0)::numeric(12,1)::float AS taille_mo,
            (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND application_name LIKE 'rni-api%')::int AS connexions_api,
            GREATEST((SELECT reltuples FROM pg_class WHERE relname = 't_app_logs'), 0)::bigint::int AS lignes_journal`,
    { type: QueryTypes.SELECT },
  );
  return row ?? { taille_mo: 0, connexions_api: 0, lignes_journal: 0 };
}
