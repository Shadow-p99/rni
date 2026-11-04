import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { APP_CONFIG, AppConfig } from './config/configuration.js';
import { loadDotEnv } from './config/dotenv.js';

async function bootstrap(): Promise<void> {
  loadDotEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const cfg = app.get<AppConfig>(APP_CONFIG);
  app.set('trust proxy', true);
  app.disable('x-powered-by');
  app.use(cookieParser());
  app.setGlobalPrefix(cfg.prefix);
  // BR-AUTH-4 : CORS restreint (en production l'appel passe par la même origine via le proxy)
  app.enableCors({ origin: cfg.corsOrigins, credentials: true });
  app.enableShutdownHooks();
  await app.listen(cfg.port);
  Logger.log(
    `RNI API sur http://localhost:${cfg.port}/${cfg.prefix} (env=${cfg.env}, mockAuth=${cfg.mockAuth}, mockExternal=${cfg.mockExternal})`,
    'Bootstrap',
  );
}

await bootstrap();
