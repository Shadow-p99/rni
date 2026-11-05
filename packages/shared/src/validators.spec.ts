import { dedupeNeo, geolocIndicatif, isValidPhone, hasNameOrFirstName } from './validators.js';
import { defaultPerimetre, Profil } from './profils.js';
import { DROIT_CODES, Droit, LOCKED_DROITS, hasDroit, porteeOf } from './droits.js';

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

describe('droits', () => {
  it('codes uniques, administration verrouillée', () => {
    expect(new Set(DROIT_CODES).size).toBe(DROIT_CODES.length);
    expect(LOCKED_DROITS).toContain(Droit.ADMIN_ACCES);
  });
  it('lecture d’une carte de droits', () => {
    const d = { [Droit.PLANNING_ECRIRE]: 'soi' as const };
    expect(hasDroit(d, Droit.PLANNING_ECRIRE)).toBe(true);
    expect(hasDroit(d, Droit.FORMULAIRE_VOIR)).toBe(false);
    expect(porteeOf(d, Droit.PLANNING_ECRIRE)).toBe('soi');
    expect(porteeOf(null, Droit.PLANNING_ECRIRE)).toBeNull();
  });
});

describe('profils', () => {
  it('périmètres par défaut (BR-AUTH-6) : carte selon le cahier des charges, planning restreint', () => {
    expect(defaultPerimetre(Profil.GIGN, 'carte')).toBe('national');
    expect(defaultPerimetre(Profil.LECTURE_SEULE, 'carte')).toBe('national');
    expect(defaultPerimetre(Profil.OMS, 'carte')).toBe('region');
    for (const p of [Profil.REFERENT, Profil.NEGOCIATEUR, Profil.FICHE_CRISE, Profil.REFERENT_ADJOINT]) expect(defaultPerimetre(p, 'carte')).toBe('region_voisines');
    expect(defaultPerimetre(Profil.GIGN, 'planning')).toBe('national');
    for (const p of [Profil.LECTURE_SEULE, Profil.REFERENT, Profil.NEGOCIATEUR, Profil.FICHE_CRISE, Profil.OMS, Profil.REFERENT_ADJOINT]) expect(defaultPerimetre(p, 'planning')).toBe('region');
    expect(defaultPerimetre(Profil.SUPER_ADMIN, 'carte')).toBe('national');
    expect(defaultPerimetre(Profil.SUPER_ADMIN, 'planning')).toBe('national');
  });
  it('profil créé dans l’administration : périmètre restreint à sa région par défaut', () => {
    expect(defaultPerimetre(42, 'carte')).toBe('region');
  });
});
