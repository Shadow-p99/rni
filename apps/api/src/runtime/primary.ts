import cluster, { type Worker } from 'node:cluster';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { LoggerService } from '@nestjs/common';
import type { AppConfig } from '../config/configuration.js';

/** Au-delà de ce nombre de plantages en une minute, le primaire abandonne (le superviseur système relance). */
const MAX_CRASHES_PER_MINUTE = 5;

/**
 * Processus primaire du cluster (remplace pm2) : lance `workers` processus HTTP qui partagent le
 * port, relance un worker qui s'arrête de façon inattendue, et pilote les arrêts :
 * - SIGTERM / SIGINT : arrêt gracieux de tous les workers (délai SHUTDOWN_TIMEOUT_MS) ;
 * - SIGHUP : **redémarrage progressif** sans interruption de service (un worker à la fois : le
 *   remplaçant écoute avant que l'ancien ne s'arrête) — `systemctl reload rni-api`.
 */
export function runPrimary(cfg: AppConfig, logger: LoggerService): void {
  const ctx = 'Cluster';
  const crashes: number[] = [];
  /** Workers dont l'arrêt est voulu (arrêt, remplacement) : pas de relance. */
  const retiring = new Set<number>();
  let stopping = false;
  let reloading = false;

  const fork = (): Worker => cluster.fork();

  /**
   * Déploiement par lien symbolique (`APP_ROOT=/srv/nodejs/rni/current`) : à chaque redémarrage
   * progressif, les nouveaux workers sont lancés depuis la version **désignée par le lien à cet
   * instant** (et non depuis le dossier résolu au démarrage du primaire).
   */
  const resolveRelease = () => {
    const root = process.env.APP_ROOT;
    if (!root) return;
    const dir = realpathSync(root);
    cluster.setupPrimary({ exec: join(dir, 'dist', 'main.js'), cwd: dir });
    logger.log(`Version servie : ${dir}`, ctx);
  };

  const listening = (w: Worker, timeoutMs = 60_000) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`worker ${w.id} : démarrage trop long`)), timeoutMs);
      w.once('listening', () => (clearTimeout(t), resolve()));
      w.once('exit', () => (clearTimeout(t), reject(new Error(`worker ${w.id} arrêté au démarrage`))));
    });

  /** Arrêt gracieux d'un worker, forcé au-delà du délai. */
  const retire = (w: Worker) =>
    new Promise<void>((resolve) => {
      if (w.isDead()) return resolve();
      retiring.add(w.id);
      const kill = setTimeout(() => {
        logger.warn?.(`Worker ${w.id} (pid ${w.process.pid}) : arrêt forcé après ${cfg.runtime.shutdownTimeoutMs} ms.`, ctx);
        w.process.kill('SIGKILL');
      }, cfg.runtime.shutdownTimeoutMs + 2000);
      w.once('exit', () => (clearTimeout(kill), resolve()));
      w.send('shutdown');
    });

  cluster.on('exit', (w, code, signal) => {
    const planned = retiring.delete(w.id);
    if (stopping || planned) return;
    const now = Date.now();
    crashes.push(now);
    while (crashes.length && crashes[0] < now - 60_000) crashes.shift();
    logger.error(`Worker ${w.id} (pid ${w.process.pid}) arrêté de façon inattendue (code ${code ?? '-'}, signal ${signal ?? '-'}).`, undefined, ctx);
    if (crashes.length > MAX_CRASHES_PER_MINUTE) {
      logger.error(`Plus de ${MAX_CRASHES_PER_MINUTE} plantages en une minute : arrêt du service.`, undefined, ctx);
      void shutdown('plantages répétés', 1);
      return;
    }
    // Relance avec un léger délai (évite une boucle serrée sur une dépendance indisponible)
    setTimeout(() => !stopping && fork(), Math.min(1000 * crashes.length, 5000));
  });

  const shutdown = async (reason: string, exitCode = 0) => {
    if (stopping) return;
    stopping = true;
    logger.log(`Arrêt du cluster (${reason}) : ${Object.keys(cluster.workers ?? {}).length} worker(s).`, ctx);
    await Promise.all(Object.values(cluster.workers ?? {}).map((w) => retire(w!)));
    logger.log('Cluster arrêté.', ctx);
    process.exit(exitCode);
  };

  const reload = async () => {
    if (stopping || reloading) return;
    reloading = true;
    const old = Object.values(cluster.workers ?? {}).filter((w): w is Worker => !!w && !retiring.has(w.id));
    logger.log(`Redémarrage progressif de ${old.length} worker(s).`, ctx);
    try {
      resolveRelease();
      for (const w of old) {
        const next = fork();
        await listening(next);
        await retire(w);
      }
      logger.log('Redémarrage progressif terminé.', ctx);
    } catch (e) {
      logger.error(`Redémarrage progressif interrompu : ${(e as Error).message}`, undefined, ctx);
    } finally {
      reloading = false;
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGHUP', () => void reload());

  resolveRelease();
  logger.log(`Primaire ${process.pid} : démarrage de ${cfg.runtime.workers} worker(s) sur le port ${cfg.port}.`, ctx);
  for (let i = 0; i < cfg.runtime.workers; i++) fork();
}
