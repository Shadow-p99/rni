import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AuthGuard } from './common/auth/auth.guard.js';
import { MockHeadersMiddleware } from './common/auth/mock-headers.middleware.js';
import { RequestContextMiddleware } from './common/http/request-context.middleware.js';
import { AuditModule } from './common/audit/audit.module.js';
import { SplunkAuditMiddleware } from './common/audit/splunk-audit.middleware.js';
import { CommonModule } from './common/common.module.js';
import { LoggingModule } from './common/logging/logging.module.js';
import { SupervisionModule } from './common/supervision/supervision.module.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { JsonPayloadInterceptor } from './common/cache/json-payload.interceptor.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { ExternalModule } from './modules/external/external.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { FormulaireModule } from './modules/formulaire/formulaire.module.js';
import { PlanningModule } from './modules/planning/planning.module.js';
import { ReferentielModule } from './modules/referentiel/referentiel.module.js';
import { RegionModule } from './modules/region/region.module.js';
import { ServiceModule } from './modules/service/service.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    CommonModule,
    AuditModule,
    ExternalModule,
    LoggingModule,
    SupervisionModule,
    ReferentielModule,
    RegionModule,
    UsersModule,
    PlanningModule,
    FormulaireModule,
    ServiceModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: JsonPayloadInterceptor },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: false }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Audit Splunk en premier : il voit aussi les requêtes refusées par les maillons suivants
    consumer.apply(SplunkAuditMiddleware, RequestContextMiddleware, MockHeadersMiddleware).forRoutes('*path');
  }
}
