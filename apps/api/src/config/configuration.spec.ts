import { loadConfig } from './configuration.js';

describe('loadConfig', () => {
  it('active les simulations en local', () => {
    const c = loadConfig({ NODE_ENV: 'local' });
    expect(c.mockAuth).toBe(true);
    expect(c.port).toBe(8096);
    expect(c.prefix).toBe('rni/api');
  });
  it('refuse l’injection d’utilisateur factice en production (§8)', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', RNI_MOCK_AUTH: 'true' })).toThrow();
    expect(loadConfig({ NODE_ENV: 'production' }).mockAuth).toBe(false);
    expect(loadConfig({ NODE_ENV: 'production' }).mockExternal).toBe(false);
  });
});
