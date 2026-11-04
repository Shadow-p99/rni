import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { AppLogDto } from '@rni/shared';
import { EMPTY_FILTER, JournalStore } from './journal.store';

const line = (id: number, message = `ligne ${id}`): AppLogDto => ({
  id_log: id, horodatage: new Date().toISOString(), niveau: 'log', contexte: 'Test', message, pile: null, request_id: null, nigend: null, pid: 1, hote: 'h',
});

describe('JournalStore', () => {
  let store: JournalStore;
  let ctrl: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [JournalStore, provideHttpClient(), provideHttpClientTesting()] });
    store = TestBed.inject(JournalStore);
    ctrl = TestBed.inject(HttpTestingController);
  });

  it('recherche filtrée, pages plus anciennes, nouvelles lignes en tête (suivi en direct)', async () => {
    const s = store.search({ ...EMPTY_FILTER, niveau: 'warn', contexte: 'HTTP', q: ' lente ' });
    const req = ctrl.expectOne((r) => r.url === '/rni/api/admin/journal');
    expect(req.request.params.get('niveau')).toBe('warn');
    expect(req.request.params.get('contexte')).toBe('HTTP');
    expect(req.request.params.get('q')).toBe('lente');
    expect(req.request.params.has('nigend')).toBe(false);
    req.flush({ items: [line(10), line(9)], contextes: [{ contexte: 'HTTP', nb: 2 }], suivant: 9 });
    await s;
    expect(store.items().map((i) => i.id_log)).toEqual([10, 9]);

    const m = store.more();
    const older = ctrl.expectOne((r) => r.params.get('avant') === '9');
    older.flush({ items: [line(8)], contextes: [], suivant: null });
    await m;
    expect(store.items().map((i) => i.id_log)).toEqual([10, 9, 8]);
    expect(store.next()).toBeNull();

    const p = store.poll();
    ctrl.expectOne((r) => !r.params.has('avant')).flush({ items: [line(12), line(11), line(10)], contextes: [], suivant: 10 });
    await p;
    expect(store.items().map((i) => i.id_log)).toEqual([12, 11, 10, 9, 8]);
    expect([...store.fresh()]).toEqual([12, 11]);
  });
});
