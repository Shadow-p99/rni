import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { LogSettingsDto } from '@rni/shared';
import { LogSettingsStore, draftErrors, isVerbose } from './log-settings.store';

const DTO: LogSettingsDto = {
  enregistre: { level: '', contexts: [], sql: false, slow_ms: 1000, db_level: 'log', retention_days: 14, metrics_retention_days: 30, expires_at: null, expire: false },
  applique: { pid: 1, level: 'log', source: 'environnement', contexts: {}, sql: false, slow_ms: 1000, db_level: 'log' },
  defaut: { level: 'log', sql: false },
  contextes_connus: ['HTTP', 'PlanningService', 'SQL'],
  derniere_modification: null,
};

describe('LogSettingsStore', () => {
  let store: LogSettingsStore;
  let ctrl: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [LogSettingsStore, provideHttpClient(), provideHttpClientTesting()] });
    store = TestBed.inject(LogSettingsStore);
    ctrl = TestBed.inject(HttpTestingController);
    const p = store.load();
    ctrl.expectOne('/rni/api/admin/logs').flush(DTO);
    await p;
  });

  it('brouillon : modifié seulement si une valeur change ; annulation', () => {
    expect(store.dirty()).toBe(false);
    store.patch({ slow_ms: 1000 });
    expect(store.dirty()).toBe(false);
    store.patch({ level: 'debug', duree_min: 60 });
    expect(store.dirty()).toBe(true);
    store.reset();
    expect(store.draft()!.level).toBe('');
    expect(store.dirty()).toBe(false);
  });

  it('contrôles de saisie', () => {
    const d = store.draft()!;
    expect(draftErrors({ ...d, contexts: [{ contexte: 'Planning Service', niveau: 'debug' }] })[0]).toContain('nom de contexte invalide');
    expect(draftErrors({ ...d, contexts: [{ contexte: 'HTTP', niveau: 'warn' }, { contexte: 'HTTP', niveau: 'debug' }] })[0]).toContain('déjà réglé');
    expect(draftErrors({ ...d, slow_ms: 10 })).toHaveLength(1);
    expect(draftErrors({ ...d, retention_days: 0 })[0]).toContain('Conservation du journal');
    expect(isVerbose({ level: '', contexts: [], sql: false })).toBe(false);
    expect(isVerbose({ level: '', contexts: [], sql: true })).toBe(true);
  });

  it('enregistrement : durée transmise seulement pour un réglage verbeux, contextes nettoyés', async () => {
    store.patch({ slow_ms: 1500, duree_min: 15 });
    let p = store.submit();
    let req = ctrl.expectOne('/rni/api/admin/logs');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toMatchObject({ slow_ms: 1500, duree_min: null });
    req.flush({ ...DTO, enregistre: { ...DTO.enregistre, slow_ms: 1500 } });
    expect(await p).toBe(true);
    expect(store.dirty()).toBe(false);

    store.addContext(' PlanningService ', 'debug');
    store.patch({ duree_min: 60 });
    p = store.submit();
    req = ctrl.expectOne('/rni/api/admin/logs');
    expect(req.request.body).toMatchObject({ contexts: [{ contexte: 'PlanningService', niveau: 'debug' }], duree_min: 60 });
    req.flush(DTO);
    await p;
  });

  it('saisie invalide : rien n’est envoyé', async () => {
    store.addContext('mauvais nom', 'debug');
    expect(await store.submit()).toBe(false);
    ctrl.expectNone('/rni/api/admin/logs');
  });
});
