import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { runMigrations } from '../src/database/migrator.js';

/**
 * Prépare une base PostgreSQL de test (`PG_DATABASE`, par défaut `rni_e2e`) à partir des
 * scripts d'initialisation et du jeu de données fictif.
 */
export default async function setup(): Promise<void> {
  const database = (process.env.PG_DATABASE ??= 'rni_e2e');
  const conn = {
    host: process.env.PG_HOST ?? 'localhost',
    port: Number(process.env.PG_PORT ?? 5432),
    user: process.env.PG_USER ?? 'rni',
    password: process.env.PG_PASSWORD ?? 'rni',
  };
  const admin = new pg.Client({ ...conn, database: 'postgres' });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${database}"`);
  await admin.end();

  const db = new pg.Client({ ...conn, database });
  await db.connect();
  const root = join(import.meta.dirname, '..', 'db');
  const run = async (dir: string) => {
    for (const f of readdirSync(join(root, dir)).filter((x) => x.endsWith('.sql')).sort()) {
      await db.query(readFileSync(join(root, dir, f), 'utf8'));
    }
  };
  // Même enchaînement qu'une installation : schéma initial, migrations versionnées, puis données fictives
  await run('init');
  const silent = { log: () => undefined, warn: (m: string) => console.warn(m) };
  await runMigrations({ ...conn, database, ssl: false, sslCa: null, logging: false, poolMax: 1, statementTimeoutMs: 0 }, silent);
  await run('dev');
  await db.end();
}
