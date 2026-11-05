import { Global, Module } from '@nestjs/common';
import { AdminLogService } from './admin-log.service.js';
import { DroitsService } from './auth/droits.service.js';
import { PerimetreService } from './auth/perimetre.service.js';
import { CacheInvalidationService } from './cache/cache-invalidation.service.js';
import { CacheNotifyService } from './cache/cache-notify.service.js';
import { CacheService } from './cache/cache.service.js';
import { MessagesService } from './messages.service.js';
import { LifecycleService } from './runtime/lifecycle.service.js';

@Global()
@Module({
  providers: [LifecycleService, CacheService, CacheNotifyService, CacheInvalidationService, MessagesService, AdminLogService, PerimetreService, DroitsService],
  exports: [LifecycleService, CacheService, CacheNotifyService, MessagesService, AdminLogService, PerimetreService, DroitsService],
})
export class CommonModule {}
