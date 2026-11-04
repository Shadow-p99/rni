import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { AppConfig } from '../config/configuration.js';

/** Dossier des migrations (`db/migrations`), identique depuis `src/` et `dist/`. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../db/migrations/', import.meta.url));

/** Verrou consultatif PostgreSQL : une seule exécution à la fois, même avec plusieurs instances. */
const LOCK_KEY = 4_242_017;

export interface MigrationLogger {
  log(message: string): void;
  warn(message: string): void;
}

export interface MigrationStatus {
  version: string;
  applied: boolean;
  appliedAt: string | null;
  /** Fichier modifié depuis son application. */
  changed: boolean;
}

export function pgClientConfig(db: AppConfig['db']): pg.ClientConfig {
  return {
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
    application_name: 'rni-api',
    ...(db.ssl ? { ssl: { rejectUnauthorized: true, ...(db.sslCa ? { ca: readFileSync(db.sslCa, 'utf8') } : {}) } } : {}),
  };
}

/** Fichiers `<version>-<libellé>.sql`, dans l'ordre des versions (2.9.0 < 2.10.0). */
export function migrationFiles(dir = MIGRATIONS_DIR): { version: string; file: string; sql: string; checksum: string }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .map((file) => {
      const sql = readFileSync(`${dir}/${file}`, 'utf8');
      return { version: file.replace(/\.sql$/, ''), file, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    });
}

const TABLE = `CREATE TABLE IF NOT EXISTS t_schema_migrations (
  version     varchar(128) PRIMARY KEY,
  checksum    char(64)     NOT NULL,
  applied_at  timestamptz  NOT NULL DEFAULT now(),
  applied_by  varchar(128) NOT NULL DEFAULT current_user
)`;

/**
 * Applique les migrations non encore appliquées, **chacune dans sa transaction**, sous verrou
 * consultatif (plusieurs instances / workers qui démarrent ensemble : une seule les exécute,
 * les autres attendent puis constatent qu'il n'y a plus rien à faire). Historique dans
 * `t_schema_migrations`. Les scripts restent idempotents (bases installées avant ce mécanisme).
 */
export async function runMigrations(db: AppConfig['db'], logger: MigrationLogger, dir = MIGRATIONS_DIR): Promise<string[]> {
  const client = new pg.Client(pgClientConfig(db));
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(TABLE);
    const done = new Map(
      (await client.query<{ version: string; checksum: string }>('SELECT version, checksum FROM t_schema_migrations')).rows.map((r) => [r.version, r.checksum]),
    );
    for (const m of migrationFiles(dir)) {
      const previous = done.get(m.version);
      if (previous) {
        if (previous !== m.checksum) logger.warn(`Migration ${m.version} modifiée depuis son application (non rejouée).`);
        continue;
      }
      const t = Date.now();
      try {
        await client.query('BEGIN');
        await client.query(m.sql);
        await client.query('INSERT INTO t_schema_migrations (version, checksum) VALUES ($1, $2)', [m.version, m.checksum]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new Error(`Migration ${m.file} en échec (annulée) : ${(e as Error).message}`);
      }
      applied.push(m.version);
      logger.log(`Migration ${m.version} appliquée (${Date.now() - t} ms).`);
    }
    if (!applied.length) logger.log('Schéma à jour : aucune migration à appliquer.');
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}

export async function migrationStatus(db: AppConfig['db'], dir = MIGRATIONS_DIR): Promise<MigrationStatus[]> {
  const client = new pg.Client(pgClientConfig(db));
  await client.connect();
  try {
    const exists = (await client.query(`SELECT to_regclass('t_schema_migrations') IS NOT NULL AS ok`)).rows[0].ok as boolean;
    const rows = exists
      ? (await client.query<{ version: string; checksum: string; applied_at: Date }>('SELECT version, checksum, applied_at FROM t_schema_migrations')).rows
      : [];
    const done = new Map(rows.map((r) => [r.version, r]));
    return migrationFiles(dir).map((m) => {
      const r = done.get(m.version);
      return { version: m.version, applied: !!r, appliedAt: r ? r.applied_at.toISOString() : null, changed: !!r && r.checksum !== m.checksum };
    });
  } finally {
    await client.end();
  }
}
