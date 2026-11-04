import { ConfigError, loadConfig } from './configuration.js';

const PROD = { NODE_ENV: 'production', PG_HOST: 'db', PG_USER: 'rni', PG_PASSWORD: 's3cret', PG_DATABASE: 'rni' };

describe('loadConfig', () => {
  it('active les simulations en local, valeurs par défaut de développement', () => {
    const c = loadConfig({ NODE_ENV: 'local' });
    expect(c.mockAuth).toBe(true);
    expect(c.port).toBe(8096);
    expect(c.prefix).toBe('rni/api');
    expect(c.db).toMatchObject({ host: 'localhost', user: 'rni', poolMax: 10, statementTimeoutMs: 30_000 });
    expect(c.log.format).toBe('text');
    expect(c.runtime.workers).toBe(1);
  });

  it('refuse l’injection d’utilisateur factice en production (§8)', () => {
    expect(() => loadConfig({ ...PROD, RNI_MOCK_AUTH: 'true' })).toThrow(/RNI_MOCK_AUTH/);
    const c = loadConfig(PROD);
    expect(c.mockAuth).toBe(false);
    expect(c.mockExternal).toBe(false);
    expect(c.isProduction).toBe(true);
  });

  it('production : secrets obligatoires, pas d’origine croisée par défaut, logs JSON', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(ConfigError);
    try {
      loadConfig({ NODE_ENV: 'production', PG_HOST: 'db' });
    } catch (e) {
      expect((e as Error).message).toMatch(/PG_USER/);
      expect((e as Error).message).toMatch(/PG_PASSWORD/);
    }
    const c = loadConfig(PROD);
    expect(c.corsOrigins).toEqual([]);
    expect(c.log.format).toBe('json');
    expect(c.trustProxy).toBe('loopback');
    expect(c.runtime.shutdownDelayMs).toBe(3000);
  });

  it('valide les valeurs (toutes les erreurs en une fois)', () => {
    let message = '';
    try {
      loadConfig({ ...PROD, APP_PORT: 'abc', PG_POOL_MAX: '0', CACHE_ENABLED: 'peut-être', LOG_LEVEL: 'bavard' });
    } catch (e) {
      message = (e as Error).message;
    }
    for (const v of ['APP_PORT', 'PG_POOL_MAX', 'CACHE_ENABLED', 'LOG_LEVEL']) expect(message).toContain(v);
    expect(() => loadConfig({ ...PROD, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
    expect(() => loadConfig({ ...PROD, PROXY_SHARED_SECRET: 'court' })).toThrow(/PROXY_SHARED_SECRET/);
  });

  it('workers du cluster et proxy de confiance', () => {
    expect(loadConfig({ ...PROD, WEB_CONCURRENCY: 'auto' }, 8).runtime.workers).toBe(8);
    expect(loadConfig({ ...PROD, WEB_CONCURRENCY: '4' }).runtime.workers).toBe(4);
    expect(loadConfig({ ...PROD, TRUST_PROXY: '2' }).trustProxy).toBe(2);
    expect(loadConfig({ ...PROD, TRUST_PROXY: '10.0.0.0/8' }).trustProxy).toBe('10.0.0.0/8');
  });
});
