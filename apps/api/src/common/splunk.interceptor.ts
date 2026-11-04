import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { AdminLogService } from './admin-log.service.js';
import type { RniRequest } from './auth/current-user.js';
import { NO_AUDIT_KEY } from './auth/decorators.js';

const AUDITED = [/\/users(\/|$)/, /\/planning(\/|$)/, /\/formulaire(\/|$)/, /\/service\/(geoloc|coordinates|isochrone)/];

/** BR-SEC-1 : une ligne `t_admin_log_splunk` par requête sur les routes métier. */
@Injectable()
export class SplunkInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly adminLog: AdminLogService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request & RniRequest>();
    const path = req.originalUrl.split('?')[0];
    const skip =
      this.reflector.getAllAndOverride<boolean>(NO_AUDIT_KEY, [ctx.getHandler(), ctx.getClass()]) ||
      !AUDITED.some((r) => r.test(path));
    if (skip) return next.handle();

    const write = (statut: number) =>
      void this.adminLog.audit({
        ip: (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim() ?? req.ip ?? null,
        route: path,
        methode: req.method,
        statut,
        rio_user: req.rniUser?.nigend ?? null,
        code_unite: req.rniUser?.code_unite ?? null,
        role: req.rniUser?.libelle_profil ?? null,
      });

    return next.handle().pipe(
      tap({
        next: () => write(ctx.switchToHttp().getResponse<Response>().statusCode),
        error: (e: { status?: number; getStatus?: () => number }) => write(e?.getStatus?.() ?? e?.status ?? 500),
      }),
    );
  }
}
