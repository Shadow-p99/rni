/**
 * Migrations du schéma : `node dist/migrate.js` (applique) ou `node dist/migrate.js --status`.
 * Utilise la même configuration que l'API (.env / variables d'environnement).
 */
import { loadDotEnv } from './config/dotenv.js';
import { ConfigError, loadConfig } from './config/configuration.js';
import { migrationStatus, runMigrations } from './database/migrator.js';

loadDotEnv();
try {
  const cfg = loadConfig();
  if (process.argv.includes('--status')) {
    for (const m of await migrationStatus(cfg.db)) {
      console.log(`${m.applied ? '✔' : '·'} ${m.version}${m.appliedAt ? `  (${m.appliedAt})` : '  — à appliquer'}${m.changed ? '  ⚠ modifiée' : ''}`);
    }
  } else {
    await runMigrations(cfg.db, { log: (m) => console.log(m), warn: (m) => console.warn(`⚠ ${m}`) });
  }
} catch (e) {
  console.error(e instanceof ConfigError ? e.message : `Migrations : ${(e as Error).message}`);
  process.exit(e instanceof ConfigError ? 78 : 1);
}
