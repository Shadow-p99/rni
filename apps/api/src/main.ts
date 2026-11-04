import 'reflect-metadata';
import cluster from 'node:cluster';
import { availableParallelism } from 'node:os';
import { ConfigError, loadConfig, type AppConfig } from './config/configuration.js';
import { loadDotEnv } from './config/dotenv.js';
import { createLogger } from './common/runtime/logger.js';
import { runMigrations } from './database/migrator.js';
import { runPrimary } from './runtime/primary.js';
import { startServer, type RunningServer } from './runtime/server.js';

/**
 * Point d'entrée unique : `node dist/main.js` (sans pm2).
 * - développement / tests, WEB_CONCURRENCY=1 : un seul processus HTTP ;
 * - WEB_CONCURRENCY=N | auto, ou production : primaire + N workers (node:cluster, cf.
 *   runtime/primary.ts). En production le primaire existe même avec 1 worker : il assure le
 *   redémarrage progressif sans interruption (SIGHUP) et la relance en cas de plantage.
 * MIGRATE_ON_START=true : migrations appliquées avant le démarrage des workers.
 */
loadDotEnv();

let cfg: AppConfig;
try {
  cfg = loadConfig(process.env, availableParallelism());
} catch (e) {
  console.error(e instanceof ConfigError ? e.message : e);
  process.exit(78); // EX_CONFIG : systemd ne relance pas en boucle une configuration invalide
}
const logger = createLogger(cfg);

if (cluster.isPrimary && cfg.runtime.migrateOnStart) {
  try {
    await runMigrations(cfg.db, { log: (m) => logger.log(m, 'Migrations'), warn: (m) => logger.warn(m, 'Migrations') });
  } catch (e) {
    logger.fatal(`Démarrage interrompu : ${(e as Error).message}`, 'Migrations');
    process.exit(1);
  }
}

if (cluster.isPrimary && (cfg.runtime.workers > 1 || cfg.isProduction)) {
  runPrimary(cfg, logger);
} else {
  let server: RunningServer | null = null;
  const stop = (reason: string, code = 0) => {
    const force = setTimeout(() => {
      logger.error(`Arrêt forcé après ${cfg.runtime.shutdownTimeoutMs} ms.`, undefined, 'Lifecycle');
      process.exit(code || 1);
    }, cfg.runtime.shutdownTimeoutMs);
    force.unref();
    void (server?.shutdown(reason) ?? Promise.resolve()).then(
      () => process.exit(code),
      (e: Error) => (logger.error(`Arrêt en erreur : ${e.message}`, e.stack, 'Lifecycle'), process.exit(1)),
    );
  };

  // Erreur non rattrapée : état incertain → journalisation puis arrêt (relancé par le cluster / systemd)
  process.on('uncaughtException', (e) => {
    logger.fatal(`Exception non rattrapée : ${e.message}`, e.stack, 'Process');
    stop('exception non rattrapée', 1);
  });
  process.on('unhandledRejection', (r) => {
    const e = r instanceof Error ? r : new Error(String(r));
    logger.fatal(`Promesse rejetée non gérée : ${e.message}`, e.stack, 'Process');
    stop('promesse rejetée non gérée', 1);
  });

  if (cluster.isWorker) {
    process.on('message', (m) => m === 'shutdown' && stop('demande du primaire'));
    // Le primaire coordonne : un Ctrl+C reçu par tout le groupe n'arrête pas le worker deux fois.
    process.on('SIGINT', () => undefined);
    process.on('SIGTERM', () => stop('SIGTERM'));
  } else {
    process.on('SIGTERM', () => stop('SIGTERM'));
    process.on('SIGINT', () => stop('SIGINT'));
  }

  try {
    server = await startServer(cfg, logger);
  } catch (e) {
    logger.fatal(`Démarrage impossible : ${(e as Error).message}`, (e as Error).stack, 'Bootstrap');
    process.exit(1);
  }
}
