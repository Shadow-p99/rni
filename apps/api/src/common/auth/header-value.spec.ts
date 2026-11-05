import type { Request } from 'express';
import { fixUtf8, headerValue } from './auth.guard.js';

const req = (headers: Record<string, string>) => ({ headers }) as unknown as Request;
const latin1 = (utf8: string) => Buffer.from(utf8, 'utf8').toString('latin1');

describe('en-têtes SSO (accents)', () => {
  it('UTF-8 brut lu en Latin-1 (ModHeader) : rétabli', () => {
    expect(headerValue(req({ cn: latin1('Hélène Martin') }), 'cn')).toBe('Hélène Martin');
    expect(fixUtf8(latin1('Lieutenant-colonel François Léa'))).toBe('Lieutenant-colonel François Léa');
  });
  it('encodé en URL : décodé', () => {
    expect(headerValue(req({ cn: 'H%C3%A9l%C3%A8ne' }), 'cn')).toBe('Hélène');
  });
  it('déjà correct, ASCII ou vraiment Latin-1 : inchangé', () => {
    expect(headerValue(req({ nigend: ' 200073 ' }), 'nigend')).toBe('200073');
    expect(fixUtf8('Hélène')).toBe('Hélène');
    expect(headerValue(req({ title: 'Major 100 %' }), 'title')).toBe('Major 100 %');
    expect(headerValue(req({}), 'cn')).toBeUndefined();
  });
});
