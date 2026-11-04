import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ctx } from '../api/api.config';
import { ToastService } from '../notifications/toast.service';
import { AppError } from './app-error';
import { httpErrorInterceptor } from './http-error.interceptor';

describe('httpErrorInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let toasts: ToastService;
  let router: Router;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([httpErrorInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    toasts = TestBed.inject(ToastService);
    router = TestBed.inject(Router);
  });
  afterEach(() => vi.useRealTimers());

  it('normalise une erreur métier et la notifie', async () => {
    const p = firstValueFrom(http.post('/rni/api/planning', {})).catch((x) => x);
    ctrl.expectOne('/rni/api/planning').flush({ code: 'RNI-1005', message: 'Chevauchement', type: 'AVERTISSEMENT', details: 'Plage existante' }, { status: 400, statusText: 'Bad Request' });
    const e = await p;
    expect(e).toBeInstanceOf(AppError);
    expect(e).toMatchObject({ kind: 'business', code: 'RNI-1005', reported: true });
    expect(toasts.toasts()[0]).toMatchObject({ kind: 'warning', title: 'Chevauchement' });
  });

  it('SILENT : pas de notification, l’appelant gère l’erreur', async () => {
    const p = firstValueFrom(http.get('/rni/api/x', ctx({ silent: true })));
    ctrl.expectOne('/rni/api/x').flush({ code: 'RNI-1002', message: 'Invalide', type: 'ERREUR' }, { status: 400, statusText: 'Bad' });
    await p.catch(() => undefined);
    expect(toasts.toasts()).toEqual([]);
  });

  it('réessaie une fois une lecture en cas d’erreur réseau', async () => {
    const p = firstValueFrom(http.get('/rni/api/region'));
    ctrl.expectOne('/rni/api/region').error(new ProgressEvent('error'), { status: 0 });
    await vi.advanceTimersByTimeAsync(800);
    ctrl.expectOne('/rni/api/region').flush([1]);
    expect(await p).toEqual([1]);
  });

  it('ne réessaie jamais une écriture', async () => {
    const p = firstValueFrom(http.post('/rni/api/planning', {}, ctx({ silent: true }))).catch((x) => x);
    ctrl.expectOne('/rni/api/planning').error(new ProgressEvent('error'), { status: 0 });
    await vi.advanceTimersByTimeAsync(2000);
    ctrl.expectNone('/rni/api/planning');
    expect((await p).kind).toBe('network');
  });

  it('401 : redirection vers /unauthorized (sauf ALLOW_401)', async () => {
    const nav = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const p = firstValueFrom(http.get('/rni/api/users/me', ctx({ silent: true })));
    ctrl.expectOne('/rni/api/users/me').flush({ code: 'RNI-0401', message: 'Non authentifié', type: 'ERREUR' }, { status: 401, statusText: 'Unauthorized' });
    await p.catch(() => undefined);
    expect(nav).toHaveBeenCalledWith('/unauthorized');

    nav.mockClear();
    const q = firstValueFrom(http.get('/rni/api/users/isUser', ctx({ silent: true, allow401: true })));
    ctrl.expectOne('/rni/api/users/isUser').flush({ code: 'RNI-0401', message: 'x', type: 'ERREUR' }, { status: 401, statusText: 'Unauthorized' });
    await q.catch(() => undefined);
    expect(nav).not.toHaveBeenCalled();
  });

  it('délai dépassé', async () => {
    const p = firstValueFrom(http.post('/rni/api/lent', {}, ctx({ silent: true, timeoutMs: 1000 }))).catch((x) => x);
    ctrl.expectOne('/rni/api/lent');
    await vi.advanceTimersByTimeAsync(1001);
    expect((await p).kind).toBe('timeout');
  });
});
