import { Injectable, inject, signal } from '@angular/core';
import { ToastService } from '../notifications/toast.service';
import { BlankExportError, TaintedExportError, exportElementToPdf, exportElementToPng } from './html-export';

/** Exports (PDF / PNG) avec indicateur d'activité et gestion d'échec. */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly toasts = inject(ToastService);
  readonly busy = signal(false);

  pdf(el: HTMLElement | undefined | null, filename: string, orientation: 'landscape' | 'portrait' = 'landscape'): Promise<boolean> {
    return this.run(() => exportElementToPdf(this.require(el), filename, orientation), 'Le PDF n’a pas pu être généré.');
  }

  png(el: HTMLElement | undefined | null, filename: string): Promise<boolean> {
    return this.run(() => exportElementToPng(this.require(el), filename), 'La capture de la carte a échoué.');
  }

  /** Exécute un export quelconque (ex. génération PDF d'une fiche). */
  async run(fn: () => Promise<void>, failure = 'L’export a échoué.'): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      await fn();
      return true;
    } catch (e) {
      console.error('[RNI] export', e);
      this.toasts.error('Export impossible', explain(e, failure));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  private require(el: HTMLElement | undefined | null): HTMLElement {
    if (!el) throw new Error('Élément à exporter introuvable');
    return el;
  }
}

/** Message compréhensible selon la cause de l'échec. */
function explain(e: unknown, fallback: string): string {
  if (e instanceof TaintedExportError) {
    return 'Le fond cartographique n’autorise pas la copie d’image (CORS) : changez de fond (OpenStreetMap) ou contactez l’administrateur.';
  }
  if (e instanceof BlankExportError) return `${fallback} L’image obtenue est vide : réessayez une fois la carte entièrement affichée.`;
  return fallback;
}
