import { Global, Module } from '@nestjs/common';
import { AdminLogService } from './admin-log.service.js';
import { PerimetreService } from './auth/perimetre.service.js';
import { MessagesService } from './messages.service.js';

@Global()
@Module({
  providers: [MessagesService, AdminLogService, PerimetreService],
  exports: [MessagesService, AdminLogService, PerimetreService],
})
export class CommonModule {}
