import type { Server } from 'node:http';
import type { LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module.js';
import { LifecycleService } from '../common/runtime/lifecycle.service.js';
import type { AppConfig } from '../config/configuration.js';

export interface RunningServer {
  /** Arrêt gracieux : « non prêt », délai de retrait, fin des requêtes en cours, fermeture. */
  shutdown(reason: string): Promise<void>;
}

/** Réglages HTTP de l'application (partagés avec les tests d'intégration). */
export function configureApp(app: NestExpressApplication, cfg: AppConfig): void {
  app.set('trust proxy', cfg.trustProxy);
  app.disable('x-powered-by');
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix(cfg.prefix);
  // BR-AUTH-4 : CORS restreint (en production l'appel passe par la même origine via le proxy)
  if (cfg.corsOrigins.length) app.enableCors({ origin: cfg.corsOrigins, credentials: true });
}

/** Démarre l'API HTTP dans le processus courant (processus unique ou worker du cluster). */
export async function startServer(cfg: AppConfig, logger: LoggerService): Promise<RunningServer> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger, bufferLogs: true });
  configureApp(app, cfg);

  await app.listen(cfg.port, cfg.host);
  const server = app.getHttpServer() as Server;
  // Au-delà du keep-alive du reverse-proxy (Nginx : 60 s) pour éviter les 502 sur connexion réutilisée.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 120_000;

  if (!cfg.proxySecret && cfg.isProduction && cfg.host !== '127.0.0.1' && cfg.host !== '::1') {
    logger.warn?.(
      `API à l'écoute sur ${cfg.host} sans PROXY_SHARED_SECRET : elle doit être inaccessible hors du reverse-proxy SSO (pare-feu).`,
      'Security',
    );
  }
  logger.log(
    `RNI API prête sur http://${cfg.host}:${cfg.port}/${cfg.prefix} (env=${cfg.env}, pid=${process.pid}, mockAuth=${cfg.mockAuth}, mockExternal=${cfg.mockExternal})`,
    'Bootstrap',
  );

  const lifecycle = app.get(LifecycleService);
  let closing: Promise<void> | null = null;
  return {
    shutdown(reason: string) {
      closing ??= (async () => {
        logger.log(`Arrêt gracieux (${reason}) : retrait du trafic puis fin des requêtes en cours.`, 'Lifecycle');
        lifecycle.startDraining();
        if (cfg.runtime.shutdownDelayMs) await new Promise((r) => setTimeout(r, cfg.runtime.shutdownDelayMs));
        // Fermeture des connexions inactives : les requêtes en cours se terminent normalement.
        server.closeIdleConnections();
        await app.close(); // serveur HTTP, puis hooks d'arrêt (pool PostgreSQL, écoute du cache)
        logger.log('Arrêt terminé.', 'Lifecycle');
      })();
      return closing;
    },
  };
}
