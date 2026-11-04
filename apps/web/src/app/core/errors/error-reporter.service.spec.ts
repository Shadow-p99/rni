import { TestBed } from '@angular/core/testing';
import { ToastService } from '../notifications/toast.service';
import { AppError } from './app-error';
import { ErrorReporter } from './error-reporter.service';
import { GlobalErrorHandler } from './global-error-handler';

describe('ErrorReporter / GlobalErrorHandler', () => {
  let toasts: ToastService;
  let reporter: ErrorReporter;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [GlobalErrorHandler] });
    toasts = TestBed.inject(ToastService);
    reporter = TestBed.inject(ErrorReporter);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('ne notifie qu’une fois la même erreur', () => {
    const e = new AppError('server', 'Indisponible');
    reporter.report(e);
    reporter.report(e);
    expect(toasts.toasts()).toHaveLength(1);
  });

  it('propose « Réessayer » pour une erreur transitoire', () => {
    const retry = vi.fn();
    reporter.report(new AppError('network', 'Serveur injoignable'), { retry });
    toasts.toasts()[0].action!.run();
    expect(retry).toHaveBeenCalled();
  });

  it('échec de chargement de module : notification persistante « Recharger »', () => {
    reporter.report(new TypeError('Failed to fetch dynamically imported module: /chunk-X.js'));
    expect(toasts.toasts()[0].action?.label).toBe('Recharger');
  });

  it('exception non capturée et promesse rejetée', () => {
    const handler = TestBed.inject(GlobalErrorHandler);
    handler.handleError(new Error('boom'));
    handler.handleError({ rejection: new Error('promesse') });
    expect(toasts.toasts().map((t) => t.message)).toEqual(['boom', 'promesse']);
  });
});
