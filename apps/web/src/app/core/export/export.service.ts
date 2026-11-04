import { Injectable, inject, signal } from '@angular/core';
import { ToastService } from '../notifications/toast.service';
import { exportElementToPdf, exportElementToPng } from './html-export';

/** Exports (PDF / PNG) avec indicateur d'activité et gestion d'échec. */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly toasts = inject(ToastService);
  readonly busy = signal(false);

  pdf(el: HTMLElement | undefined | null, filename: string, orientation: 'landscape' | 'portrait' = 'landscape'): Promise<boolean> {
    return this.run(() => exportElementToPdf(this.require(el), filename, orientation), 'Le PDF n’a pas pu être généré.');
  }

  png(el: HTMLElement | undefined | null, filename: string): Promise<boolean> {
    return this.run(
      () => exportElementToPng(this.require(el), filename),
      'La capture a échoué (le fond cartographique n’autorise peut-être pas la copie d’image).',
    );
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
      this.toasts.error('Export impossible', failure);
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
