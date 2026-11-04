import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../../core/auth/auth.service';
import { ReferentielService } from '../../../core/referentiel/referentiel.service';
import { PlanningDesktopStore } from './planning-desktop.store';

function setup(regions: { id_region: number; libelle: string; center: null }[]) {
  TestBed.configureTestingModule({
    providers: [
      PlanningDesktopStore,
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: { user: () => ({ id_region: 11 }), canEditPlanningOf: () => true } },
      { provide: ReferentielService, useValue: { regions: () => regions, color: () => '#000' } },
    ],
  });
  return { store: TestBed.inject(PlanningDesktopStore), ctrl: TestBed.inject(HttpTestingController) };
}

describe('PlanningDesktopStore : une seule région visible', () => {
  it('région toujours dépliée, ni repliable ni dépliable', () => {
    const { store, ctrl } = setup([{ id_region: 11, libelle: 'Île-de-France', center: null }]);
    store.init();
    ctrl.match(() => true);
    expect(store.collapsible()).toBe(false);
    expect(store.regions()[0].expanded).toBe(true);
    store.toggleRegion(11);
    expect(store.regions()[0].expanded).toBe(true);
  });

  it('plusieurs régions : repliables', () => {
    const { store, ctrl } = setup([
      { id_region: 11, libelle: 'Île-de-France', center: null },
      { id_region: 24, libelle: 'Centre-Val de Loire', center: null },
    ]);
    store.init();
    ctrl.match(() => true);
    expect(store.collapsible()).toBe(true);
    store.toggleRegion(11);
    expect(store.regions()[0].expanded).toBe(false);
  });
});
