import { computeInsertion, validatePlageBounds, minPlanningDate, checkPositionAllowed, clipPlage } from './planning-rules.js';
import { ErrorCode } from './errors.js';
import { toSlot } from './creneaux.js';
import { Profil } from './profils.js';
import { PosService } from './positions.js';

const today = new Date(2026, 2, 10); // 10 mars 2026

describe('validatePlageBounds (BR-PLA-3)', () => {
  it('borne minimale M-1', () => {
    expect(minPlanningDate(today)).toBe('2026-02-01');
    expect(validatePlageBounds({ date_debut: '2026-01-31', id_creneaux_debut: 1, date_fin: '2026-02-02', id_creneaux_fin: 1 }, today)?.code).toBe(ErrorCode.INSERTION_INTERDITE);
    expect(validatePlageBounds({ date_debut: '2026-02-01', id_creneaux_debut: 1, date_fin: '2026-02-02', id_creneaux_fin: 1 }, today)).toBeNull();
  });
  it('interdit fin avant début et Nuit→Jour le même jour', () => {
    expect(validatePlageBounds({ date_debut: '2026-03-12', id_creneaux_debut: 1, date_fin: '2026-03-11', id_creneaux_fin: 1 }, today)?.code).toBe(ErrorCode.PARAMETRE_INVALIDE);
    expect(validatePlageBounds({ date_debut: '2026-03-12', id_creneaux_debut: 2, date_fin: '2026-03-12', id_creneaux_fin: 1 }, today)?.code).toBe(ErrorCode.PARAMETRE_INVALIDE);
    expect(validatePlageBounds({ date_debut: '2026-03-12', id_creneaux_debut: 1, date_fin: '2026-03-12', id_creneaux_fin: 1 }, today)).toBeNull();
  });
  it('champs obligatoires', () => {
    expect(validatePlageBounds({ date_debut: '2026-03-12' }, today)?.code).toBe(ErrorCode.PARAMETRE_MANQUANT);
  });
});

describe('checkPositionAllowed (BR-PLA-4)', () => {
  it('bloque Alerte/Formateur pour un négociateur, en pose comme en sortie', () => {
    expect(checkPositionAllowed(Profil.NEGOCIATEUR, PosService.ALERTE)?.code).toBe(ErrorCode.ACTION_NON_AUTORISEE);
    expect(checkPositionAllowed(Profil.NEGOCIATEUR, PosService.DISPONIBLE, PosService.FORMATEUR)?.code).toBe(ErrorCode.ACTION_NON_AUTORISEE);
    expect(checkPositionAllowed(Profil.NEGOCIATEUR, PosService.DISPONIBLE, PosService.EN_SERVICE)).toBeNull();
    expect(checkPositionAllowed(Profil.REFERENT, PosService.ALERTE)).toBeNull();
  });
});

describe('computeInsertion (BR-PLA-9/10/11)', () => {
  const outer = { date_debut: '2026-03-01', id_creneaux_debut: 1, date_fin: '2026-03-14', id_creneaux_fin: 2, id_pos_service: 1 };

  it('scinde en 3 plages contiguës', () => {
    const r = computeInsertion(outer, { date_debut: '2026-03-05', id_creneaux_debut: 2, date_fin: '2026-03-08', id_creneaux_fin: 1, id_pos_service: 3 }, today);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pieces.map((p) => p.role)).toEqual(['avant', 'insertion', 'apres']);
    expect(r.pieces[0]).toMatchObject({ date_debut: '2026-03-01', id_creneaux_debut: 1, date_fin: '2026-03-05', id_creneaux_fin: 1, id_pos_service: 1 });
    expect(r.pieces[1]).toMatchObject({ date_debut: '2026-03-05', id_creneaux_debut: 2, date_fin: '2026-03-08', id_creneaux_fin: 1, id_pos_service: 3 });
    expect(r.pieces[2]).toMatchObject({ date_debut: '2026-03-08', id_creneaux_debut: 2, date_fin: '2026-03-14', id_creneaux_fin: 2, id_pos_service: 1 });
  });

  it('scinde en 2 plages quand l’insertion touche une borne', () => {
    const r = computeInsertion(outer, { date_debut: '2026-03-01', id_creneaux_debut: 1, date_fin: '2026-03-03', id_creneaux_fin: 2, id_pos_service: 3 }, today);
    expect(r.ok && r.pieces.map((p) => p.role)).toEqual(['insertion', 'apres']);
    if (r.ok) expect(r.pieces[1]).toMatchObject({ date_debut: '2026-03-04', id_creneaux_debut: 1 });
  });

  it('refuse une insertion hors bornes (RNI-1006)', () => {
    const r = computeInsertion(outer, { date_debut: '2026-03-10', id_creneaux_debut: 1, date_fin: '2026-03-15', id_creneaux_fin: 1, id_pos_service: 3 }, today);
    expect(!r.ok && r.violation.code).toBe(ErrorCode.INSERTION_HORS_BORNES);
  });

  it('refuse une plage identique ou une position inchangée (RNI-1007)', () => {
    const same = computeInsertion(outer, { ...outer, id_pos_service: 3 }, today);
    expect(!same.ok && same.violation.code).toBe(ErrorCode.INSERTION_INTERDITE);
    const pos = computeInsertion(outer, { date_debut: '2026-03-05', id_creneaux_debut: 1, date_fin: '2026-03-06', id_creneaux_fin: 1, id_pos_service: 1 }, today);
    expect(!pos.ok && pos.violation.code).toBe(ErrorCode.INSERTION_INTERDITE);
  });

  it('refuse une date antérieure à M-1 (RNI-1007)', () => {
    const old = { date_debut: '2026-01-01', id_creneaux_debut: 1, date_fin: '2026-03-14', id_creneaux_fin: 2, id_pos_service: 1 };
    const r = computeInsertion(old, { date_debut: '2026-01-10', id_creneaux_debut: 1, date_fin: '2026-01-12', id_creneaux_fin: 1, id_pos_service: 3 }, today);
    expect(!r.ok && r.violation.code).toBe(ErrorCode.INSERTION_INTERDITE);
  });
});

describe('clipPlage (BR-PLA-2)', () => {
  it('tronque aux bornes du mois', () => {
    const w = [toSlot('2026-03-01', 1), toSlot('2026-03-31', 2)] as const;
    expect(clipPlage({ date_debut: '2026-02-20', id_creneaux_debut: 2, date_fin: '2026-04-02', id_creneaux_fin: 1 }, ...w)).toEqual({ date_debut: '2026-03-01', id_creneaux_debut: 1, date_fin: '2026-03-31', id_creneaux_fin: 2 });
    expect(clipPlage({ date_debut: '2026-02-20', id_creneaux_debut: 2, date_fin: '2026-02-21', id_creneaux_fin: 1 }, ...w)).toBeNull();
  });
});
