import { describe, expect, it, vi } from 'vitest';
import { RniLogger, levelsUpTo, parseContextLevels } from './logger.js';

describe('RniLogger', () => {
  const make = () => {
    const l = new RniLogger({ json: true, colors: false });
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const lines = () => out.mock.calls.map((c) => JSON.parse(String(c[0])) as { level: string; context: string; message: string });
    return { l, out, lines };
  };

  it('seuil global', () => {
    const { l, out, lines } = make();
    l.configure('warn');
    l.log('info', 'Planning');
    l.warn('attention', 'Planning');
    l.debug('détail', 'Planning');
    expect(lines().map((x) => x.message)).toEqual(['attention']);
    out.mockRestore();
  });

  it('seuil par contexte (plus bavard ou plus discret que le seuil global)', () => {
    const { l, out, lines } = make();
    l.configure('log', new Map([['PlanningService', 'debug'], ['HTTP', 'warn']]));
    l.debug('détail planning', 'PlanningService');
    l.debug('détail autre', 'UsersService');
    l.log('accès', 'HTTP');
    l.warn('accès lent', 'HTTP');
    l.log('création', 'UsersService');
    expect(lines().map((x) => `${x.context}:${x.message}`)).toEqual(['PlanningService:détail planning', 'HTTP:accès lent', 'UsersService:création']);
    expect(l.enabledFor('verbose', 'PlanningService')).toBe(false);
    out.mockRestore();
  });

  it('lecture des réglages', () => {
    expect(levelsUpTo('log')).toEqual(['fatal', 'error', 'warn', 'log']);
    const { levels, invalid } = parseContextLevels('PlanningService=debug, HTTP=WARN;SQL=bavard,orphelin');
    expect([...levels]).toEqual([['PlanningService', 'debug'], ['HTTP', 'warn']]);
    expect(invalid).toEqual(['SQL=bavard', 'orphelin']);
    expect(parseContextLevels('').levels.size).toBe(0);
  });
});
