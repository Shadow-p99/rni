import { resolvePoint } from './planning.service.js';
import type { PlanningRow, UserPlanningRow } from './planning.repository.js';

const user = (over: Partial<UserPlanningRow> = {}): UserPlanningRow =>
  ({
    id_user: 1, nigend: '200001', x_unite: 2, y_unite: 48, adresse_unite: 'Unité',
    geoloc_indicatif: 'RNI000001', geoloc_id_geoloc: 'NEO-1', geoloc_bool_geoloc: true, geoloc_bool_indispo: false,
    ...over,
  }) as UserPlanningRow;

const planning = (pos: number, temp = false): PlanningRow =>
  ({
    id_planning: 10, id_user: 1, nigend: '200001', date_debut: '2026-03-01', id_creneaux_debut: 1, date_fin: '2026-03-02', id_creneaux_fin: 2,
    id_pos_service: pos, adresse_temp: temp ? 'Mission' : 'Unité', x_adresse_temp: temp ? 3 : 2, y_adresse_temp: temp ? 47 : 48, slot_debut: 0, slot_fin: 1,
  }) as PlanningRow;

const geoloc = new Map([['RNI000001', { indicatif: 'RNI000001', lat: 45, lng: 5, horodatage: '2026-03-01T10:00:00Z' }]]);

describe('resolvePoint (BR-CAR-2)', () => {
  it('adresse de l’unité sans planning ni géoloc', () => {
    expect(resolvePoint(user({ geoloc_bool_geoloc: false }), null, geoloc)).toMatchObject({ x: 2, y: 48, type: 'unite' });
  });
  it('adresse temporaire du planning', () => {
    expect(resolvePoint(user({ geoloc_bool_geoloc: false }), planning(1, true), geoloc)).toMatchObject({ x: 3, y: 47, type: 'temporaire' });
  });
  it('géolocalisation prioritaire si active et position ≠ Indisponible', () => {
    expect(resolvePoint(user(), planning(1, true), geoloc)).toMatchObject({ x: 5, y: 45, type: 'localisation' });
  });
  it('pas de géoloc en Indisponible sauf consentement (BR-REF-3)', () => {
    expect(resolvePoint(user(), planning(2), geoloc)?.type).toBe('unite');
    expect(resolvePoint(user(), null, geoloc)?.type).toBe('unite');
    expect(resolvePoint(user({ geoloc_bool_indispo: true }), planning(2), geoloc)?.type).toBe('localisation');
  });
  it('pas de géoloc sans appareil déclaré', () => {
    expect(resolvePoint(user({ geoloc_id_geoloc: null }), planning(1), geoloc)?.type).toBe('unite');
  });
});
