import type { FormulaireDto } from '@rni/shared';
import { addressOf, buildFormulaireForm, toPayload } from './formulaire-form';

describe('formulaire de fiche de crise', () => {
  it('notes à 0 par défaut, nom OU prénom obligatoire (BR-FOR-3)', () => {
    const f = buildFormulaireForm();
    expect(f.get('note_dangerosite')!.value).toBe(0);
    expect(f.hasError('name')).toBe(true);
    f.get('prenom')!.setValue('Jean');
    expect(f.hasError('name')).toBe(false);
  });
  it('valide téléphone et bornes des notes', () => {
    const f = buildFormulaireForm();
    f.get('auteur_telephone')!.setValue('123');
    expect(f.get('auteur_telephone')!.hasError('phone')).toBe(true);
    f.get('note_psychopathe')!.setValue(11);
    expect(f.get('note_psychopathe')!.invalid).toBe(true);
  });
  it('construit le corps avec l’adresse géocodée', () => {
    const body = toPayload({ nom: 'X', note_psychopathe: '3' }, { address: '1 rue A', x: 2, y: 48, score: 100 });
    expect(body).toMatchObject({ nom: 'X', note_psychopathe: 3, note_dangerosite: 0, terrain_adresse: '1 rue A', terrain_x: 2, terrain_y: 48 });
    expect(toPayload({}, null)).toMatchObject({ terrain_adresse: null, terrain_x: null });
  });
  it('relit l’adresse enregistrée', () => {
    expect(addressOf({ terrain_adresse: 'A', terrain_x: 1, terrain_y: 2 } as unknown as FormulaireDto)).toMatchObject({ x: 1, y: 2 });
    expect(addressOf({ terrain_adresse: 'A', terrain_x: null } as unknown as FormulaireDto)).toBeNull();
  });
});
