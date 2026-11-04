import type { PersonnelPointProperties } from '@rni/shared';
import { clusterColor } from './map-icons';

const p = (id_pos_service: number, color: string, planned = true) => ({ id_pos_service, color, id_planning: planned ? 1 : null }) as PersonnelPointProperties;

describe('clusterColor (BR-CAR-4)', () => {
  it('priorité Alerte, puis Disponible', () => {
    expect(clusterColor([p(1, 'vert'), p(4, 'orange'), p(2, 'rouge')])).toBe('orange');
    expect(clusterColor([p(2, 'rouge'), p(1, 'vert')])).toBe('vert');
  });
  it('sinon la première position planifiée, ou gris', () => {
    expect(clusterColor([p(2, 'gris', false), p(3, 'bleu')])).toBe('bleu');
    expect(clusterColor([p(2, 'x', false)])).toBe('#808080');
  });
});
