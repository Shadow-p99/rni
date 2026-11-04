import { dedupeNeo, geolocIndicatif, isValidPhone, hasNameOrFirstName } from './validators.js';
import { assignableProfils, perimetreOf, Profil, listableProfils } from './profils.js';

describe('validateurs', () => {
  it('téléphones FR et internationaux', () => {
    for (const ok of ['0612345678', '06 12 34 56 78', '01.23.45.67.89', '+33612345678', '0033612345678', '+262 262 12 34 56']) expect(isValidPhone(ok)).toBe(true);
    for (const ko of ['0012', '1234567890', '06123', '+0612345678', 'abc', '']) expect(isValidPhone(ko)).toBe(false);
  });
  it('indicatif GEOLOC (BR-REF-2)', () => {
    expect(geolocIndicatif(2256)).toBe('RNI002256');
  });
  it('déduplication NEO (§4.3)', () => {
    expect(dedupeNeo('0611111111', '0611111111,0622222222')).toEqual({ neo1: '0611111111', neo2: '0622222222' });
    expect(dedupeNeo('0611111111', '0611111111')).toEqual({ neo1: '0611111111', neo2: null });
    expect(dedupeNeo('0611111111', '0633333333')).toEqual({ neo1: '0611111111', neo2: '0633333333' });
  });
  it('nom ou prénom (BR-FOR-3)', () => {
    expect(hasNameOrFirstName(' ', '')).toBe(false);
    expect(hasNameOrFirstName(null, 'Jean')).toBe(true);
  });
});

describe('profils', () => {
  it('profils attribuables (BR-GPU-3)', () => {
    expect(assignableProfils(Profil.GIGN)).toContain(Profil.OMS);
    expect(assignableProfils(Profil.REFERENT)).not.toContain(Profil.GIGN);
    expect(assignableProfils(Profil.NEGOCIATEUR)).toEqual([]);
  });
  it('profils listés (BR-GPU-1)', () => {
    expect(listableProfils(Profil.REFERENT)).toEqual([3, 4, 7]);
    expect(listableProfils(Profil.GIGN)).toContain(Profil.OMS);
  });
  it('périmètre (BR-AUTH-6)', () => {
    expect(perimetreOf(Profil.GIGN)).toBe('national');
    expect(perimetreOf(Profil.OMS)).toBe('region');
    expect(perimetreOf(Profil.NEGOCIATEUR)).toBe('region+voisines');
  });
});
