import { Global, Logger, Module } from '@nestjs/common';
import { CacheService } from '../../common/cache/cache.service.js';
import { APP_CONFIG, AppConfig } from '../../config/configuration.js';
import { CachedFacadeClient, CachedGeolocClient, CachedRemopClient } from './cached.clients.js';
import { FACADE_CLIENT, GEOLOC_CLIENT, REMOP_CLIENT } from './external.types.js';
import { MockFacadeClient, MockGeolocClient, MockRemopClient } from './mock.clients.js';
import { ParamService } from './param.service.js';
import { HttpFacadeClient, HttpGeolocClient, HttpRemopClient } from './real.clients.js';

let announced = false;
/** Une seule fois par processus : services externes réels ou simulés. */
function announce(cfg: AppConfig): void {
  if (announced) return;
  announced = true;
  const logger = new Logger('External');
  if (cfg.mockExternal) logger.warn('Services externes SIMULÉS (REMOP, GEOLOC, Facade) : RNI_MOCK_EXTERNAL=true.');
  else logger.log('Services externes réels (REMOP, GEOLOC, Facade), adresses et jetons lus dans t_param_app.');
}

@Global()
@Module({
  providers: [
    ParamService,
    {
      provide: GEOLOC_CLIENT,
      inject: [APP_CONFIG, ParamService, CacheService],
      useFactory: (cfg: AppConfig, p: ParamService, c: CacheService) => (
        announce(cfg),
        new CachedGeolocClient(cfg.mockExternal ? new MockGeolocClient() : new HttpGeolocClient(p), c)
      ),
    },
    {
      provide: REMOP_CLIENT,
      inject: [APP_CONFIG, ParamService, CacheService],
      useFactory: (cfg: AppConfig, p: ParamService, c: CacheService) =>
        new CachedRemopClient(cfg.mockExternal ? new MockRemopClient() : new HttpRemopClient(p), c),
    },
    {
      provide: FACADE_CLIENT,
      inject: [APP_CONFIG, ParamService, CacheService],
      useFactory: (cfg: AppConfig, p: ParamService, c: CacheService) =>
        new CachedFacadeClient(cfg.mockExternal ? new MockFacadeClient() : new HttpFacadeClient(p), c),
    },
  ],
  exports: [ParamService, GEOLOC_CLIENT, REMOP_CLIENT, FACADE_CLIENT],
})
export class ExternalModule {}
