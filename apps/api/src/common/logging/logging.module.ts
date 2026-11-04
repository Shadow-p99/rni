import { Global, Module } from '@nestjs/common';
import { LogSettingsService } from './log-settings.service.js';

@Global()
@Module({ providers: [LogSettingsService], exports: [LogSettingsService] })
export class LoggingModule {}
