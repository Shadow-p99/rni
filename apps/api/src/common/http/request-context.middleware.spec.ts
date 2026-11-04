import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/configuration.js';
import { LifecycleService } from '../runtime/lifecycle.service.js';
import { RequestContextMiddleware, type RequestWithId } from './request-context.middleware.js';

const SECRET = '0123456789abcdef0123';
const make = (proxySecret: string | null, lifecycle = new LifecycleService()) =>
  new RequestContextMiddleware({ proxySecret } as AppConfig, lifecycle);

function call(mw: RequestContextMiddleware, url: string, headers: Record<string, string> = {}) {
  const req = { originalUrl: url, method: 'GET', ip: '10.0.0.1', headers: { ...headers } } as unknown as RequestWithId;
  const res = { headers: {} as Record<string, string>, statusCode: 200, body: null as unknown };
  const r = {
    setHeader: (k: string, v: string) => (res.headers[k.toLowerCase()] = v),
    status: (s: number) => ((res.statusCode = s), r),
    json: (b: unknown) => (res.body = b),
  };
  const next = vi.fn();
  mw.use(req, r as never, next);
  return { req, res, next };
}

describe('RequestContextMiddleware', () => {
  it('corrélation : identifiant valide conservé, sinon généré ; en-têtes de sécurité', () => {
    const ok = call(make(null), '/rni/api/users/me', { 'x-request-id': 'abcd-1234-efgh' });
    expect(ok.req.id).toBe('abcd-1234-efgh');
    expect(ok.res.headers['x-request-id']).toBe('abcd-1234-efgh');
    expect(ok.res.headers['x-frame-options']).toBe('DENY');
    expect(ok.res.headers['cache-control']).toBe('no-store');
    expect(call(make(null), '/x', { 'x-request-id': '<bad>' }).req.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('secret du reverse-proxy : requis hors sondes, comparé en temps constant, retiré ensuite', () => {
    const mw = make(SECRET);
    expect(call(mw, '/rni/api/users/me').res.statusCode).toBe(401);
    expect(call(mw, '/rni/api/users/me', { 'x-rni-proxy-secret': 'mauvais' }).next).not.toHaveBeenCalled();
    const good = call(mw, '/rni/api/users/me?x=1', { 'x-rni-proxy-secret': SECRET });
    expect(good.next).toHaveBeenCalled();
    expect(good.req.headers['x-rni-proxy-secret']).toBeUndefined();
    for (const probe of ['/rni/api/health/live', '/rni/api/health/ready', '/rni/api/service/alive']) {
      expect(call(mw, probe).next).toHaveBeenCalled();
    }
  });

  it('arrêt en cours : Connection: close (aucune requête perdue sur une connexion réutilisée)', () => {
    const lifecycle = new LifecycleService();
    expect(call(make(null, lifecycle), '/x').res.headers['connection']).toBeUndefined();
    lifecycle.startDraining();
    expect(call(make(null, lifecycle), '/x').res.headers['connection']).toBe('close');
  });
});
