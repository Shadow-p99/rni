import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AuthGuard } from './common/auth/auth.guard.js';
import { MockHeadersMiddleware } from './common/auth/mock-headers.middleware.js';
import { CommonModule } from './common/common.module.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { SplunkInterceptor } from './common/splunk.interceptor.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { ExternalModule } from './modules/external/external.module.js';
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
    ExternalModule,
    ReferentielModule,
    RegionModule,
    UsersModule,
    PlanningModule,
    FormulaireModule,
    ServiceModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: SplunkInterceptor },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: false }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MockHeadersMiddleware).forRoutes('*path');
  }
}
