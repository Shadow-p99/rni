import { DEFAULT_CRISES } from '@rni/shared';
import { sanitizeFormulaire as sanitize } from './formulaire.sanitize.js';

const sanitizeFormulaire = (body: unknown, mode: 'create' | 'update') => sanitize(body, mode, DEFAULT_CRISES);

describe('sanitizeFormulaire', () => {
  it('ne retient que les champs du catalogue et met les notes à 0 par défaut', () => {
    const out = sanitizeFormulaire({ nom: ' Dupont ', id_user: 99, is_closed: true, hack: 'x' }, 'create');
    expect(out['nom']).toBe('Dupont');
    expect(out).not.toHaveProperty('id_user');
    expect(out).not.toHaveProperty('is_closed');
    expect(out).not.toHaveProperty('hack');
    expect(out['note_dangerosite']).toBe(0);
  });
  it('exige nom ou prénom à la création (BR-FOR-3)', () => {
    expect(() => sanitizeFormulaire({ crise: 'Forcené' }, 'create')).toThrow();
    expect(() => sanitizeFormulaire({ prenom: 'Jean' }, 'create')).not.toThrow();
  });
  it('valide type de crise, téléphone et bornes des notes', () => {
    expect(() => sanitizeFormulaire({ nom: 'A', crise: 'Inconnue' }, 'create')).toThrow();
    expect(() => sanitizeFormulaire({ nom: 'A', auteur_telephone: '123' }, 'create')).toThrow();
    expect(() => sanitizeFormulaire({ nom: 'A', note_psychopathe: 11 }, 'create')).toThrow();
    expect(() => sanitizeFormulaire({ nom: 'A', note_psychopathe: 1.5 }, 'create')).toThrow();
    expect(sanitizeFormulaire({ nom: 'A', auteur_telephone: '+33 6 12 34 56 78', note_psychopathe: '3' }, 'create')).toMatchObject({ note_psychopathe: 3 });
  });
  it('types de crise paramétrés en base : seuls les libellés fournis sont acceptés', () => {
    expect(() => sanitize({ nom: 'A', crise: 'Forcené' }, 'create', ['Aucun', 'Cyberattaque'])).toThrow();
    expect(sanitize({ nom: 'A', crise: 'Cyberattaque' }, 'create', ['Aucun', 'Cyberattaque'])).toMatchObject({ crise: 'Cyberattaque' });
    expect(sanitize({ nom: 'A', crise: '' }, 'create', [])).toMatchObject({ crise: 'Aucun' });
  });
  it('efface les coordonnées quand l’adresse est vidée', () => {
    expect(sanitizeFormulaire({ terrain_adresse: '', terrain_x: 2, terrain_y: 48 }, 'update')).toMatchObject({ terrain_x: null, terrain_y: null });
  });
});
