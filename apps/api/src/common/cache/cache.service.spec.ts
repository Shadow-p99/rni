import { describe, expect, it, vi } from 'vitest';
import { CacheService, CacheTag, JsonPayload, regionsKey } from './cache.service.js';

const make = (maxEntries = 5000, enabled = true, maxMb = 128) =>
  new CacheService({ cache: { enabled, maxEntries, maxMb } } as never);

describe('CacheService', () => {
  it('met en cache jusqu’à expiration', async () => {
    vi.useFakeTimers();
    const c = make();
    const load = vi.fn(async () => Math.random());
    const a = await c.wrap('k', 1000, load);
    expect(await c.wrap('k', 1000, load)).toBe(a);
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1001);
    await c.wrap('k', 1000, load);
    expect(load).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('mutualise les chargements concurrents', async () => {
    const c = make();
    let resolve!: (v: number) => void;
    const load = vi.fn(() => new Promise<number>((r) => (resolve = r)));
    const p = Promise.all([c.wrap('k', 1000, load), c.wrap('k', 1000, load), c.wrap('k', 1000, load)]);
    await Promise.resolve();
    await Promise.resolve();
    resolve(42);
    expect(await p).toEqual([42, 42, 42]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('n’enregistre pas les erreurs', async () => {
    const c = make();
    await expect(c.wrap('k', 1000, () => { throw new Error('KO'); })).rejects.toThrow('KO');
    expect(await c.wrap('k', 1000, async () => 'ok')).toBe('ok');
  });

  it('invalidation par étiquette, y compris pendant un chargement', async () => {
    const c = make();
    await c.wrap('a', 10_000, async () => 1, [CacheTag.PLANNING]);
    await c.wrap('b', 10_000, async () => 1, [CacheTag.USERS]);
    c.invalidate(CacheTag.PLANNING);
    expect(c.stats().entries).toBe(1);
    expect(await c.wrap('a', 10_000, async () => 2, [CacheTag.PLANNING])).toBe(2);

    // Écriture pendant la lecture : la valeur lue (potentiellement périmée) n'est pas conservée
    let resolve!: (v: number) => void;
    const slow = c.wrap('c', 10_000, () => new Promise<number>((r) => (resolve = r)), [CacheTag.PLANNING]);
    await Promise.resolve();
    c.invalidate(CacheTag.PLANNING);
    resolve(3);
    expect(await slow).toBe(3);
    expect(await c.wrap('c', 10_000, async () => 4, [CacheTag.PLANNING])).toBe(4);
  });

  it('taille bornée (LRU)', async () => {
    const c = make(100);
    for (let i = 0; i < 150; i++) await c.wrap(`k${i}`, 10_000, async () => i);
    await c.wrap('k60', 10_000, async () => -1); // lu → conservé
    for (let i = 150; i < 170; i++) await c.wrap(`k${i}`, 10_000, async () => i);
    const s = c.stats();
    expect(s.entries).toBe(100);
    expect(s.evictions).toBe(70);
    expect(await c.wrap('k60', 10_000, async () => -1)).toBe(60);
    expect(await c.wrap('k0', 10_000, async () => -1)).toBe(-1);
  });

  it('plafond mémoire : éviction des plus anciennes, réponse géante non conservée', async () => {
    const c = make(5000, true, 8); // 8 Mo
    const big = () => async () => 'x'.repeat(900 * 1024); // ~1,8 Mo en mémoire
    for (let i = 0; i < 6; i++) await c.wrap(`b${i}`, 10_000, big());
    const s = c.stats();
    expect(s.sizeMb).toBeLessThanOrEqual(8);
    expect(s.entries).toBe(4);
    expect(s.evictions).toBe(2);
    const huge = vi.fn(async () => 'x'.repeat(2 * 1024 * 1024)); // ~4 Mo > 8 / 4
    await c.wrap('huge', 10_000, huge);
    await c.wrap('huge', 10_000, huge);
    expect(huge).toHaveBeenCalledTimes(2);
  });

  it('wrapJson : sérialisation unique, ETag stable', async () => {
    const c = make();
    const a = await c.wrapJson('j', 10_000, async () => ({ a: 1, é: 'ü' }));
    expect(a).toBeInstanceOf(JsonPayload);
    expect(JSON.parse(a.body)).toEqual({ a: 1, é: 'ü' });
    expect(a.etag).toMatch(/^W\/"[\w-]+"$/);
    expect(JsonPayload.of({ a: 1, é: 'ü' }).etag).toBe(a.etag);
    expect(await c.wrapJson('j', 10_000, async () => ({ a: 2 }))).toBe(a);
  });

  it('désactivé : chargeur toujours appelé', async () => {
    const c = make(5000, false);
    const load = vi.fn(async () => 1);
    await c.wrap('k', 1000, load);
    await c.wrap('k', 1000, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('suppression par préfixe et clé de régions stable', async () => {
    const c = make();
    await c.wrap('geo:1', 1000, async () => 1);
    await c.wrap('geo:2', 1000, async () => 1);
    await c.wrap('ref:x', 1000, async () => 1);
    c.delete('geo:*');
    expect(c.stats().byPrefix).toEqual({ ref: 1 });
    expect(regionsKey([32, 11])).toBe('11,32');
    expect(regionsKey(null)).toBe('nat');
    expect(regionsKey([])).toBe('none');
  });
});
