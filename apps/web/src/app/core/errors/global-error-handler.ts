import { ErrorHandler, Injectable, inject } from '@angular/core';
import { ErrorReporter } from './error-reporter.service';

/**
 * Filet de sécurité : toute exception non capturée (composant, effet, promesse rejetée via
 * `provideBrowserGlobalErrorListeners`) est notifiée sans casser l'application.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly reporter = inject(ErrorReporter);

  handleError(error: unknown): void {
    // Angular enveloppe parfois l'erreur d'origine (promesse rejetée…)
    const original = (error as { rejection?: unknown })?.rejection ?? error;
    this.reporter.report(original);
  }
}
