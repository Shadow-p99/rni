import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { RegionCountsDto, TimetableDto } from '@rni/shared';
import { AuthService } from '../../core/auth/auth.service';
import { ReferentielService } from '../../core/referentiel/referentiel.service';
import { PlanningStore } from './planning.store';

const REGIONS = [
  { id_region: 84, libelle: 'Auvergne-Rhône-Alpes', center: null },
  { id_region: 11, libelle: 'Île-de-France', center: null },
  { id_region: 24, libelle: 'Centre-Val de Loire', center: null },
];

const timetable = (id: number, month: string): TimetableDto => ({
  month,
  first: `${month}-01`,
  last: `${month}-30`,
  regions: [
    {
      id_region: id,
      libelle: 'R',
      users: [{ id_user: id * 10, nigend: '1', nom: 'N', prenom: 'P', plannings: [] } as unknown as TimetableDto['regions'][0]['users'][0]],
    },
  ],
});

const counts: RegionCountsDto[] = REGIONS.map((r) => ({ id_region: r.id_region, libelle: r.libelle, counts: { 1: 2, 4: 1 }, sans_planning: 1 }));

describe('PlanningStore : chargement par région', () => {
  let store: PlanningStore;
  let ctrl: HttpTestingController;
  const timetableReqs = () => ctrl.match((r) => r.url === '/rni/api/planning/timetable');
  const flushTt = (reqs: TestRequest[]) => reqs.forEach((r) => r.flush(timetable(Number(r.request.params.get('region')), r.request.params.get('month')!)));

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PlanningStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user: () => ({ id_region: 11 }), canEditPlanningOf: () => true } },
        { provide: ReferentielService, useValue: { regions: () => REGIONS, color: () => '#000' } },
      ],
    });
    store = TestBed.inject(PlanningStore);
    ctrl = TestBed.inject(HttpTestingController);
  });

  it('à l’ouverture : compteurs de toutes les régions, données de la seule région dépliée (la sienne)', async () => {
    store.init();
    ctrl.expectOne('/rni/api/region/getNbPositionServiceByRegion').flush(counts);
    const reqs = timetableReqs();
    expect(reqs.map((r) => r.request.params.get('region'))).toEqual(['11']);
    flushTt(reqs);
    await vi.waitFor(() => expect(store.regions()[0].loaded).toBe(true));

    const [own, ...others] = store.regions();
    expect(own).toMatchObject({ id_region: 11, expanded: true, loaded: true, total: 4 });
    expect(own.rows).toHaveLength(1);
    // Régions repliées : pas de données, mais compteurs et effectif affichés
    for (const r of others) {
      expect(r).toMatchObject({ expanded: false, loaded: false, rows: [], total: 4 });
      expect(r.counts?.counts).toEqual({ 1: 2, 4: 1 });
    }
  });

  it('le dépliage charge la région une seule fois ; le repli ne recharge rien', async () => {
    store.init();
    ctrl.expectOne('/rni/api/region/getNbPositionServiceByRegion').flush(counts);
    flushTt(timetableReqs());

    store.toggleRegion(84);
    const reqs = timetableReqs();
    expect(reqs.map((r) => r.request.params.get('region'))).toEqual(['84']);
    flushTt(reqs);
    await vi.waitFor(() => expect(store.regions().find((r) => r.id_region === 84)!.loaded).toBe(true));

    store.toggleRegion(84); // repli
    store.toggleRegion(84); // nouveau dépliage : déjà en cache
    ctrl.expectNone((r) => r.url === '/rni/api/planning/timetable');
  });

  it('changement de mois : seules les régions dépliées sont rechargées', async () => {
    store.init();
    ctrl.expectOne('/rni/api/region/getNbPositionServiceByRegion').flush(counts);
    flushTt(timetableReqs());
    store.toggleRegion(84);
    flushTt(timetableReqs());
    store.toggleRegion(84); // repliée, chargée pour l'ancien mois

    store.setMonth('2030-01');
    const reqs = timetableReqs();
    expect(reqs.map((r) => [r.request.params.get('region'), r.request.params.get('month')])).toEqual([['11', '2030-01']]);
    flushTt(reqs);

    store.toggleRegion(84); // dépliée à nouveau : chargée pour le nouveau mois
    expect(timetableReqs().map((r) => [r.request.params.get('region'), r.request.params.get('month')])).toEqual([['84', '2030-01']]);
  });

  it('erreur de chargement limitée à la région concernée, puis réessai', async () => {
    store.init();
    ctrl.expectOne('/rni/api/region/getNbPositionServiceByRegion').flush(counts);
    timetableReqs()[0].flush({ code: 'RNI-0000', message: 'Erreur', type: 'ERREUR' }, { status: 500, statusText: 'KO' });
    await vi.waitFor(() => expect(store.regions()[0].error?.kind).toBe('server'));
    expect(store.regions()[1].error).toBeNull();
    void store.loadRegion(11);
    flushTt(timetableReqs());
    await vi.waitFor(() => expect(store.regions()[0]).toMatchObject({ loaded: true, error: null }));
  });
});
