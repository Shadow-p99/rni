import { toSlot } from '@rni/shared';
import { RangeSelection, rangeToPlage } from './range-selection';

const s = (d: string, c: number) => toSlot(d, c);

describe('RangeSelection (sélection par glisser)', () => {
  it('sélection vers l’avant : du créneau de départ au créneau relâché', () => {
    const r = new RangeSelection();
    r.start(7, s('2026-11-03', 2));
    r.move(7, s('2026-11-04', 1));
    r.move(7, s('2026-11-06', 1));
    expect(r.contains(7, s('2026-11-05', 2))).toBe(true);
    const range = r.end()!;
    expect(rangeToPlage(range)).toEqual({ date_debut: '2026-11-03', id_creneaux_debut: 2, date_fin: '2026-11-06', id_creneaux_fin: 1 });
    expect(r.active()).toBe(false);
  });

  it('sélection vers l’arrière : bornes remises dans l’ordre', () => {
    const r = new RangeSelection();
    r.start(7, s('2026-11-10', 1));
    r.move(7, s('2026-11-08', 2));
    expect(rangeToPlage(r.end()!)).toEqual({ date_debut: '2026-11-08', id_creneaux_debut: 2, date_fin: '2026-11-10', id_creneaux_fin: 1 });
  });

  it('reste sur la ligne de l’agent de départ', () => {
    const r = new RangeSelection();
    r.start(7, s('2026-11-03', 1));
    r.move(8, s('2026-11-09', 1));
    expect(r.contains(8, s('2026-11-09', 1))).toBe(false);
    expect(r.end()).toEqual({ userId: 7, start: s('2026-11-03', 1), end: s('2026-11-03', 1) });
  });

  it('annulation (Échap)', () => {
    const r = new RangeSelection();
    r.start(7, s('2026-11-03', 1));
    r.cancel();
    expect(r.end()).toBeNull();
  });
});
