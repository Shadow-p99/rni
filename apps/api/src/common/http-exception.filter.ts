import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ApiError, ErrorCode } from '@rni/shared';
import type { Request, Response } from 'express';
import { BaseError, ConnectionError, DatabaseError } from 'sequelize';
import { AdminLogService } from './admin-log.service.js';
import { BusinessException } from './business.exception.js';
import { MessagesService } from './messages.service.js';
import type { RniRequest } from './auth/current-user.js';

/** Gestionnaire d'erreurs global (équivalent `errorHandler.ts`, BR-SEC-2). */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorHandler');

  constructor(
    private readonly messages: MessagesService,
    private readonly adminLog: AdminLogService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & RniRequest>();
    const res = ctx.getResponse<Response>();
    const { status, code, details } = this.classify(exception);
    const msg = this.messages.get(code);
    const body: ApiError = { code, message: msg.libelle, type: msg.type, ...(details ? { details } : {}) };

    if (status >= 500) this.logger.error(`${req.method} ${req.originalUrl} → ${code} [${(req as { id?: string }).id ?? '-'}]`, (exception as Error)?.stack);

    if (status !== HttpStatus.NOT_FOUND || exception instanceof BusinessException) {
      void this.adminLog.business({
        code,
        nigend: req.rniUser?.nigend ?? (req.headers['nigend'] as string | undefined) ?? null,
        methode: req.method,
        url: req.originalUrl,
        body: req.body && Object.keys(req.body).length ? req.body : null,
        description: details ?? (exception instanceof HttpException ? msg.libelle : ((exception as Error)?.message ?? msg.libelle)),
      });
    }
    if (!res.headersSent) res.status(status).json(body);
  }

  private classify(e: unknown): { status: number; code: string; details?: string } {
    if (e instanceof BusinessException) return { status: e.getStatus(), code: e.code, details: e.details };
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const r = e.getResponse() as { message?: string | string[] } | string;
      const message = typeof r === 'string' ? r : Array.isArray(r.message) ? r.message.join(' ; ') : r.message;
      if (status === HttpStatus.NOT_FOUND) return { status, code: ErrorCode.RESSOURCE_INTROUVABLE, details: message };
      if (status === HttpStatus.UNAUTHORIZED) return { status, code: ErrorCode.NON_AUTHENTIFIE, details: message };
      if (status === HttpStatus.FORBIDDEN) return { status, code: ErrorCode.ACTION_NON_AUTORISEE, details: message };
      if (status === HttpStatus.BAD_REQUEST) return { status, code: ErrorCode.PARAMETRE_INVALIDE, details: message };
      return { status, code: ErrorCode.TECHNIQUE, details: message };
    }
    if (e instanceof BaseError) {
      const pgCode = (e as DatabaseError).original && ((e as DatabaseError).original as { code?: string }).code;
      if (pgCode === '23P01') return { status: HttpStatus.BAD_REQUEST, code: ErrorCode.CHEVAUCHEMENT };
      if (pgCode === '23503') return { status: HttpStatus.BAD_REQUEST, code: ErrorCode.PARAMETRE_INVALIDE, details: 'Référence inconnue.' };
      if (pgCode === '22P02' || pgCode === '22007' || pgCode === '22008') return { status: HttpStatus.BAD_REQUEST, code: ErrorCode.PARAMETRE_INVALIDE };
      if (e instanceof ConnectionError) return { status: HttpStatus.SERVICE_UNAVAILABLE, code: ErrorCode.BASE_INDISPONIBLE };
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: ErrorCode.TECHNIQUE };
  }
}
