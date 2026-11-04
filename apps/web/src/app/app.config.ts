import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeFr from '@angular/common/locales/fr';
import { ApplicationConfig, ErrorHandler, LOCALE_ID, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withNavigationErrorHandler } from '@angular/router';
import { routes } from './app.routes';
import { ErrorReporter } from './core/errors/error-reporter.service';
import { GlobalErrorHandler } from './core/errors/global-error-handler';
import { httpErrorInterceptor } from './core/errors/http-error.interceptor';

registerLocaleData(localeFr);

export const appConfig: ApplicationConfig = {
  providers: [
    // Exceptions non capturées et promesses rejetées → ErrorHandler
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
      // Échec de navigation (module non chargé après un déploiement, garde en erreur…)
      withNavigationErrorHandler((e) => inject(ErrorReporter).report(e.error)),
    ),
    provideHttpClient(withInterceptors([httpErrorInterceptor])),
    { provide: LOCALE_ID, useValue: 'fr-FR' },
  ],
};
