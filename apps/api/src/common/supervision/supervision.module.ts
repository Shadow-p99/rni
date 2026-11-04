import { Global, Module } from '@nestjs/common';
import { LogPersistService } from './log-persist.service.js';
import { MetricsService } from './metrics.service.js';

/** Supervision : journal conservé en base, métriques des requêtes, activité des utilisateurs. */
@Global()
@Module({ providers: [MetricsService, LogPersistService], exports: [MetricsService, LogPersistService] })
export class SupervisionModule {}
