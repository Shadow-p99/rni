import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import type { Page, UserDto } from '@rni/shared';
import { AuthService } from '../../core/auth/auth.service';
import { httpErrorInterceptor } from '../../core/errors/http-error.interceptor';
import { GestionStore } from './gestion.store';

const page = (over: Partial<Page<UserDto>> = {}): Page<UserDto> => ({ items: [{ id_user: 1 } as UserDto], total: 45, page: 1, size: 20, ...over });

describe('GestionStore', () => {
  let store: GestionStore;
  let ctrl: HttpTestingController;
  let router: Router;

  function setup(query: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      providers: [
        GestionStore,
        provideRouter([]),
        provideHttpClient(withInterceptors([httpErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
        { provide: AuthService, useValue: { isGign: () => true } },
      ],
    });
    store = TestBed.inject(GestionStore);
    ctrl = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  }

  const flush = (body: Page<UserDto>) => {
    const req = ctrl.expectOne((r) => r.url === '/rni/api/users');
    req.flush(body);
    return req.request.params;
  };

  it('relit l’état depuis l’URL et interroge l’API paginée', async () => {
    setup({ page: '3', q: 'dupont', sort: 'nom', dir: 'desc', region: '11' });
    store.init();
    const params = flush(page({ page: 3 }));
    expect(params.get('page')).toBe('3');
    expect(params.get('q')).toBe('dupont');
    expect(params.get('sort')).toBe('nom');
    expect(params.get('dir')).toBe('desc');
    expect(params.get('region')).toBe('11');
    await vi.waitFor(() => expect(store.list.data().page).toBe(3));
  });

  it('une recherche revient en page 1 ; le tri suit le cycle asc → desc → défaut', () => {
    setup({ page: '2' });
    store.init();
    flush(page());
    store.search('martin');
    expect(flush(page()).get('page')).toBe('1');
    store.toggleSort('nigend');
    expect(flush(page()).get('dir')).toBeNull();
    store.toggleSort('nigend');
    expect(flush(page()).get('dir')).toBe('desc');
    store.toggleSort('nigend');
    expect(flush(page()).get('sort')).toBeNull();
  });

  it('page devenue vide : retour à la dernière page existante', async () => {
    setup({ page: '5' });
    store.init();
    flush(page({ items: [], total: 41, page: 5 }));
    await vi.waitFor(() => expect(store.page()).toBe(3));
    expect(flush(page({ page: 3 })).get('page')).toBe('3');
  });

  it('erreur conservée dans l’état (affichée avec « Réessayer »), sans notification globale', async () => {
    setup();
    store.init();
    ctrl.expectOne((r) => r.url === '/rni/api/users').flush({ code: 'RNI-0000', message: 'Erreur technique', type: 'ERREUR' }, { status: 500, statusText: 'KO' });
    await vi.waitFor(() => expect(store.list.error()?.kind).toBe('server'));
    void store.list.reload();
    flush(page());
    await vi.waitFor(() => expect(store.list.error()).toBeNull());
  });
});
