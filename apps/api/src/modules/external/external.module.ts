import { Global, Module } from '@nestjs/common';
import { CacheService } from '../../common/cache/cache.service.js';
import { APP_CONFIG, AppConfig } from '../../config/configuration.js';
import { CachedFacadeClient, CachedGeolocClient, CachedRemopClient } from './cached.clients.js';
import { Db } from '../../database/db.service.js';
import { FACADE_CLIENT, GEOLOC_CLIENT, REMOP_CLIENT } from './external.types.js';
import { MockFacadeClient, MockGeolocClient, MockRemopClient } from './mock.clients.js';
import { ParamService } from './param.service.js';
import { HttpFacadeClient, HttpGeolocClient, HttpRemopClient } from './real.clients.js';

@Global()
@Module({
  providers: [
    ParamService,
    {
      provide: GEOLOC_CLIENT,
      inject: [APP_CONFIG, ParamService, Db, CacheService],
      useFactory: (cfg: AppConfig, p: ParamService, db: Db, c: CacheService) =>
        new CachedGeolocClient(cfg.mockExternal ? new MockGeolocClient(db) : new HttpGeolocClient(p), c),
    },
    {
      provide: REMOP_CLIENT,
      inject: [APP_CONFIG, ParamService, Db, CacheService],
      useFactory: (cfg: AppConfig, p: ParamService, db: Db, c: CacheService) =>
        new CachedRemopClient(cfg.mockExternal ? new MockRemopClient(db) : new HttpRemopClient(p), c),
    },
    {
      provide: FACADE_CLIENT,
      inject: [APP_CONFIG, ParamService, Db, CacheService],
      useFactory: (cfg: AppConfig, p: ParamService, db: Db, c: CacheService) =>
        new CachedFacadeClient(cfg.mockExternal ? new MockFacadeClient(db) : new HttpFacadeClient(p), c),
    },
  ],
  exports: [ParamService, GEOLOC_CLIENT, REMOP_CLIENT, FACADE_CLIENT],
})
export class ExternalModule {}
