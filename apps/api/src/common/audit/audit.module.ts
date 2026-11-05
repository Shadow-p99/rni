import { Global, Module } from '@nestjs/common';
import { SplunkAuditMiddleware } from './splunk-audit.middleware.js';
import { SplunkAuditService } from './splunk-audit.service.js';

@Global()
@Module({ providers: [SplunkAuditService, SplunkAuditMiddleware], exports: [SplunkAuditService, SplunkAuditMiddleware] })
export class AuditModule {}
