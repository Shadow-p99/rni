import { buildCells, planningAt } from './planning-cells';
import type { TimetablePlanningDto } from '@rni/shared';
import { toSlot } from '@rni/shared';

const p = (id: number, d1: string, c1: number, d2: string, c2: number, pos = 1): TimetablePlanningDto => ({
  id_planning: id, id_user: 1, nigend: '200001', date_debut: d1, id_creneaux_debut: c1, date_fin: d2, id_creneaux_fin: c2,
  id_pos_service: pos, adresse_temp: null, x_adresse_temp: null, y_adresse_temp: null,
  affiche: { date_debut: d1, id_creneaux_debut: c1, date_fin: d2, id_creneaux_fin: c2 },
});

describe('buildCells (BR-PLA-1)', () => {
  it('découpe en demi-cases Jour / Nuit', () => {
    const cells = buildCells([p(1, '2026-03-02', 2, '2026-03-03', 1, 3)], ['2026-03-02', '2026-03-03', '2026-03-04'], () => '#00f', '2026-03-03');
    expect(cells[0].jour.planning).toBeNull();
    expect(cells[0].nuit.planning?.id_planning).toBe(1);
    expect(cells[1].jour.planning?.id_planning).toBe(1);
    expect(cells[1].nuit.planning).toBeNull();
    expect(cells[1].today).toBe(true);
    expect(cells[2].jour.planning).toBeNull();
  });

  it('journée entière : deux demi-cases distinctes, de la même plage', () => {
    const cells = buildCells([p(1, '2026-03-02', 1, '2026-03-02', 2)], ['2026-03-02'], () => '#0f0', '');
    expect(cells[0].jour).toMatchObject({ creneau: 1, color: '#0f0' });
    expect(cells[0].nuit).toMatchObject({ creneau: 2, color: '#0f0' });
    expect(cells[0].jour.slot).toBe(cells[0].nuit.slot - 1);
    expect(cells[0].jour.planning).toBe(cells[0].nuit.planning);
  });

  it('repère les week-ends', () => {
    const cells = buildCells([], ['2026-03-07', '2026-03-08', '2026-03-09'], () => '', '');
    expect(cells.map((c) => c.weekend)).toEqual([true, true, false]);
  });
});

describe('planningAt', () => {
  it('trouve la plage couvrant un créneau', () => {
    const list = [p(1, '2026-03-01', 1, '2026-03-05', 2), p(2, '2026-03-06', 1, '2026-03-06', 1)];
    expect(planningAt(list, toSlot('2026-03-05', 2))?.id_planning).toBe(1);
    expect(planningAt(list, toSlot('2026-03-06', 2))).toBeNull();
  });
});
