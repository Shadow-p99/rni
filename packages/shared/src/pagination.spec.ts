import { normalizePage, pageCount, pageWindow } from './pagination.js';

describe('pagination', () => {
  it('normalise page et taille (bornes, valeurs invalides)', () => {
    expect(normalizePage(undefined, undefined)).toEqual({ page: 1, size: 20, offset: 0 });
    expect(normalizePage('3', '50')).toEqual({ page: 3, size: 50, offset: 100 });
    expect(normalizePage(-4, 100000)).toEqual({ page: 1, size: 100, offset: 0 });
    expect(normalizePage('abc', 0).size).toBe(20);
  });
  it('compte les pages', () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(41, 20)).toBe(3);
  });
  it('fenêtre de pages avec ellipses', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4]);
    expect(pageWindow(7, 20)).toEqual([1, null, 5, 6, 7, 8, 9, null, 20]);
    expect(pageWindow(20, 20)).toEqual([1, null, 18, 19, 20]);
  });
});
