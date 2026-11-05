import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CurrentUserDto, DroitsMap } from '@rni/shared';
import { AuthService } from './auth.service';

function user(droits: DroitsMap, extra: Partial<CurrentUserDto> = {}): CurrentUserDto {
  return {
    id_user: 1, nigend: '200073', grade: null, nom: 'N', prenom: 'P', displayname: 'P N', code_unite: null, libelle_unite: null,
    id_profil: 3, libelle_profil: 'Référent', id_region: 11, libelle_region: 'IDF', regions_visibles: [11], perimetres: { carte: [11], planning: [11] },
    droits, profils_visibles: [3, 4, 7], profils_gerables: [3, 4, 7],
    geoloc_id_geoloc: null, geoloc_indicatif: null, geoloc_bool_geoloc: false, geoloc_bool_indispo: false,
    ...extra,
  };
}

describe('AuthService : droits du profil (Administration › Droits)', () => {
  let auth: AuthService;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
  });

  it('menus et pages selon les droits ; première page accessible', () => {
    auth.setUser(user({ 'planning.voir': 'oui', 'formulaire.voir': 'region' }));
    expect(auth.canCarte()).toBe(false);
    expect(auth.canFormulaire()).toBe(true);
    expect(auth.formulaireNational()).toBe(false);
    expect(auth.canAdmin()).toBe(false);
    expect(auth.homePath()).toBe('/planning');
    auth.setUser(user({}));
    expect(auth.homePath()).toBeNull();
  });

  it('écriture planning selon la portée', () => {
    const autre = { id_user: 9, id_region: 11 };
    auth.setUser(user({ 'planning.ecrire': 'region' }));
    expect(auth.canEditPlanningOf(autre)).toBe(true);
    expect(auth.canEditPlanningOf({ id_user: 9, id_region: 84 })).toBe(false);
    auth.setUser(user({ 'planning.ecrire': 'soi' }));
    expect(auth.planningSoiSeul()).toBe(true);
    expect(auth.canEditPlanningOf(autre)).toBe(false);
    expect(auth.canEditPlanningOf({ id_user: 1, id_region: 11 })).toBe(true);
    auth.setUser(user({ 'planning.ecrire': 'national' }));
    expect(auth.canEditPlanningOf({ id_user: 9, id_region: 84 })).toBe(true);
    auth.setUser(user({}));
    expect(auth.canEditPlanningOf(autre)).toBe(false);
  });

  it('gestion du personnel : profils gérés et région', () => {
    auth.setUser(user({ 'gestion.acces': 'region' }));
    expect(auth.canManageUser({ id_profil: 4, id_region: 11 })).toBe(true);
    expect(auth.canManageUser({ id_profil: 4, id_region: 84 })).toBe(false);
    expect(auth.canManageUser({ id_profil: 1, id_region: 11 })).toBe(false);
    expect(auth.canManageUser({ id_profil: 8, id_region: 11 })).toBe(false);
    auth.setUser(user({ 'gestion.acces': 'national' }, { profils_gerables: [1, 4] }));
    expect(auth.canManageUser({ id_profil: 1, id_region: 84 })).toBe(true);
  });
});
