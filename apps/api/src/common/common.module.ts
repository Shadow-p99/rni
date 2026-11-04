import { Global, Module } from '@nestjs/common';
import { AdminLogService } from './admin-log.service.js';
import { PerimetreService } from './auth/perimetre.service.js';
import { CacheInvalidationService } from './cache/cache-invalidation.service.js';
import { CacheService } from './cache/cache.service.js';
import { MessagesService } from './messages.service.js';

@Global()
@Module({
  providers: [CacheService, CacheInvalidationService, MessagesService, AdminLogService, PerimetreService],
  exports: [CacheService, MessagesService, AdminLogService, PerimetreService],
})
export class CommonModule {}
