import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';
import { JsonPayload } from './cache.service.js';

/**
 * Envoie une `JsonPayload` telle quelle (pas de nouvelle sérialisation), avec son ETag.
 * Express répond `304 Not Modified` si le client présente le même ETag (`If-None-Match`) ;
 * `Cache-Control: no-cache` impose au navigateur de revalider à chaque appel.
 */
@Injectable()
export class JsonPayloadInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value) => {
        if (!(value instanceof JsonPayload)) return value;
        const res = ctx.switchToHttp().getResponse<Response>();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('ETag', value.etag);
        res.setHeader('Cache-Control', 'private, no-cache');
        return value.body;
      }),
    );
  }
}
