import { Global, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
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
        logging: cfg.db.logging ? console.log : false,
        dialectOptions: cfg.db.ssl ? { ssl: { rejectUnauthorized: true } } : {},
        pool: { max: 10, min: 0, idle: 10_000 },
        define: { underscored: true, freezeTableName: true },
      }),
    }),
    SequelizeModule.forFeature(ALL_MODELS),
  ],
  providers: [Db],
  exports: [SequelizeModule, Db],
})
export class DatabaseModule {}
