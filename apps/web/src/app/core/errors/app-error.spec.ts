import { HttpErrorResponse } from '@angular/common/http';
import { AppError, toAppError } from './app-error';

const http = (status: number, error: unknown = null) => new HttpErrorResponse({ status, error });

describe('toAppError', () => {
  it('erreur métier de l’API : libellé + détail + code', () => {
    const e = toAppError(http(400, { code: 'RNI-1005', message: 'Chevauchement', type: 'AVERTISSEMENT', details: 'Plage existante' }));
    expect(e).toMatchObject({ kind: 'business', title: 'Chevauchement', detail: 'Plage existante', code: 'RNI-1005', severity: 'AVERTISSEMENT' });
    expect(e.retryable).toBe(false);
  });
  it('classe 401 / 403 / 404 / 5xx de l’API', () => {
    const api = (s: number) => toAppError(http(s, { code: 'X', message: 'm', type: 'ERREUR' })).kind;
    expect([api(401), api(403), api(404), api(500)]).toEqual(['unauthenticated', 'forbidden', 'not-found', 'server']);
  });
  it('réseau, délai et erreurs HTTP sans corps API', () => {
    expect(toAppError(http(0)).kind).toBe('network');
    expect(toAppError(http(504)).kind).toBe('timeout');
    expect(toAppError(http(502)).kind).toBe('server');
    expect(toAppError(http(502)).retryable).toBe(true);
    expect(toAppError(Object.assign(new Error('Timeout has occurred'), { name: 'TimeoutError' })).kind).toBe('timeout');
  });
  it('échec de chargement de module (nouvelle version déployée)', () => {
    expect(toAppError(new TypeError('Failed to fetch dynamically imported module: /chunk-ABC.js')).kind).toBe('chunk');
  });
  it('exception quelconque', () => {
    const e = toAppError(new Error('boom'));
    expect(e).toBeInstanceOf(AppError);
    expect(e).toMatchObject({ kind: 'unexpected', detail: 'boom' });
    expect(toAppError(e)).toBe(e);
  });
});
