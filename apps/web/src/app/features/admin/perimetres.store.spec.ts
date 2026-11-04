import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { PerimetreProfilDto } from '@rni/shared';
import { PerimetresStore } from './perimetres.store';

const rows: PerimetreProfilDto[] = [
  { id_profil: 8, libelle_profil: 'Super administrateur', carte: 'national', planning: 'national', locked: true, updated_at: null, updated_by: null },
  { id_profil: 3, libelle_profil: 'Référent', carte: 'region_voisines', planning: 'region', locked: false, updated_at: null, updated_by: null },
];

describe('PerimetresStore', () => {
  let store: PerimetresStore;
  let ctrl: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [PerimetresStore, provideHttpClient(), provideHttpClientTesting()] });
    store = TestBed.inject(PerimetresStore);
    ctrl = TestBed.inject(HttpTestingController);
    const p = store.load();
    ctrl.expectOne('/rni/api/admin/perimetres').flush(rows);
    await p;
  });

  it('brouillon : seules les valeurs réellement modifiées sont envoyées', async () => {
    const ref = store.matrix.data()[1];
    store.set(ref, 'planning', 'region_voisines');
    store.set(ref, 'carte', 'region_voisines'); // identique à l'enregistré : ignoré
    expect(store.changes()).toEqual([{ id_profil: 3, module: 'planning', perimetre: 'region_voisines' }]);
    expect(store.value(ref, 'planning')).toBe('region_voisines');
    store.set(ref, 'planning', 'region'); // retour à la valeur initiale
    expect(store.dirty()).toBe(false);
  });

  it('ligne verrouillée (super administrateur) non modifiable', () => {
    store.set(store.matrix.data()[0], 'carte', 'region');
    expect(store.dirty()).toBe(false);
  });

  it('enregistrement : PUT des changements, puis matrice à jour et brouillon vidé', async () => {
    store.set(store.matrix.data()[1], 'planning', 'national');
    const p = store.submit();
    const req = ctrl.expectOne('/rni/api/admin/perimetres');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ items: [{ id_profil: 3, module: 'planning', perimetre: 'national' }] });
    req.flush([rows[0], { ...rows[1], planning: 'national', updated_by: '100005' }]);
    expect(await p).toBe(true);
    expect(store.dirty()).toBe(false);
    expect(store.matrix.data()[1].planning).toBe('national');
  });

  it('échec : erreur conservée et brouillon intact', async () => {
    store.set(store.matrix.data()[1], 'planning', 'national');
    const p = store.submit();
    ctrl.expectOne('/rni/api/admin/perimetres').flush({ code: 'RNI-1008', message: 'Non autorisé', type: 'ERREUR' }, { status: 403, statusText: 'Forbidden' });
    expect(await p).toBe(false);
    expect(store.save.error()?.kind).toBe('forbidden');
    expect(store.dirty()).toBe(true);
  });
});
