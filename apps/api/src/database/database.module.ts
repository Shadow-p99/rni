import { readFileSync } from 'node:fs';
import { Global, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { sqlLogging } from '../common/logging/sql-logger.js';
import { APP_CONFIG, AppConfig } from '../config/configuration.js';
import { ALL_MODELS } from './models/index.js';
import { Db } from './db.service.js';

@Global()
@Module({
  imports: [
    SequelizeModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (cfg: AppConfig) => ({
        dialect: 'postgres' as const,
        host: cfg.db.host,
        port: cfg.db.port,
        username: cfg.db.user,
        password: cfg.db.password,
        database: cfg.db.database,
        models: ALL_MODELS,
        autoLoadModels: false,
        synchronize: false,
        // Journal SQL piloté à chaud (rni.log.sql, rni.log.slow_ms) ; durée mesurée pour les requêtes lentes
        logging: sqlLogging,
        benchmark: true,
        dialectOptions: {
          application_name: 'rni-api',
          // JIT désactivé : sur des requêtes transactionnelles il coûte plus (compilation) qu'il ne rapporte.
          options: '-c jit=off',
          // Aucune requête ne peut monopoliser une connexion indéfiniment.
          ...(cfg.db.statementTimeoutMs ? { statement_timeout: cfg.db.statementTimeoutMs } : {}),
          keepAlive: true,
          ...(cfg.db.ssl ? { ssl: { rejectUnauthorized: true, ...(cfg.db.sslCa ? { ca: readFileSync(cfg.db.sslCa, 'utf8') } : {}) } } : {}),
        },
        // Par processus : prévoir PG_POOL_MAX × workers × instances < max_connections de PostgreSQL.
        pool: { max: cfg.db.poolMax, min: 0, idle: 10_000, acquire: 30_000, evict: 1000 },
        retryAttempts: 10,
        retryDelay: 3000,
        define: { underscored: true, freezeTableName: true },
      }),
    }),
    SequelizeModule.forFeature(ALL_MODELS),
  ],
  providers: [Db],
  exports: [SequelizeModule, Db],
})
export class DatabaseModule {}
