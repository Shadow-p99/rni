import { DatePipe } from '@angular/common';
import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SECTIONS, SectionId } from '@rni/shared';
import { ExportService } from '../../core/export/export.service';
import { HasUnsavedChanges } from '../../core/platform/unsaved-changes.guard';
import { AsyncView } from '../../shared/ui/async-view';
import { ConfirmService } from '../../shared/ui/confirm';
import { ErrorPanel } from '../../shared/ui/error-panel';
import { FormulaireSection } from './components/formulaire-section';
import { PdfExportDialog } from './components/pdf-export-dialog';
import { FormulaireEditorStore } from './formulaire-editor.store';
import { exportFormulairePdf } from './formulaire-pdf';

/** Fiche de crise : création, suivi, clôture, export PDF (§6). */
@Component({
  selector: 'rni-formulaire-edit-page',
  imports: [DatePipe, RouterLink, AsyncView, ErrorPanel, FormulaireSection, PdfExportDialog],
  providers: [FormulaireEditorStore],
  template: `
    @let f = store.current();
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-3 p-3 desk:p-4">
      <div class="card flex flex-wrap items-center gap-2 p-3">
        <a routerLink="/formulaire" class="btn-ghost px-2">‹ Fiches</a>
        <h1 class="text-lg font-semibold">{{ isNewRoute() ? 'Nouvelle fiche de crise' : 'Fiche de crise n° ' + id() }}</h1>
        @if (f) {
          <span class="chip" [class]="f.is_closed ? 'bg-slate-200 text-slate-700' : 'bg-green-100 text-green-800'">{{ f.is_closed ? 'Clôturée' : 'Active' }}</span>
          <span class="text-xs text-slate-500">Auteur : {{ f.auteur_nom }} — modifiée le {{ f.updated_at | date: 'dd/MM/yyyy HH:mm' }}</span>
        }
        @if (!store.fiche.error()) {
          <div class="ml-auto flex flex-wrap gap-2">
            @if (f) {
              <button type="button" class="btn-secondary" (click)="pdfDialog.set(true)">⤓ PDF</button>
              @if (store.isAuthor() && !store.closed()) {
                <button type="button" class="btn-secondary text-amber-700" (click)="close()" [disabled]="store.action.busy()">Clôturer</button>
              }
              @if (store.isAuthor()) {
                <button type="button" class="btn-ghost text-red-700" (click)="remove()" [disabled]="store.action.busy()">Supprimer</button>
              }
            }
            @if (!store.closed()) {
              <button type="button" class="btn-primary" (click)="store.save()" [disabled]="store.action.busy() || store.fiche.loading()">
                {{ store.action.busy() ? 'Enregistrement…' : 'Enregistrer' }}
              </button>
            }
          </div>
        }
      </div>

      @if (store.fatal(); as e) {
        <div class="card p-6 text-center">
          <p class="font-semibold">{{ e.title }}</p>
          <p class="mt-1 text-sm text-slate-600">{{ e.kind === 'not-found' ? 'Cette fiche n’existe pas ou a été supprimée.' : 'Cette fiche est hors de votre périmètre.' }}</p>
          <a routerLink="/formulaire" class="btn-primary mt-4">Retour aux fiches</a>
        </div>
      } @else {
        <rni-async-view [loading]="store.fiche.loading()" [pending]="store.fiche.pending()" [error]="store.fiche.error()" (retry)="store.fiche.reload()">
          <div class="flex flex-col gap-3">
            <rni-error-panel [error]="store.action.error()" />
            @if (store.submitted() && store.form.hasError('name')) {
              <p class="rounded-md bg-red-50 p-2 text-sm text-red-700" role="alert">Le nom ou le prénom de l'individu est obligatoire.</p>
            }
            <form class="flex flex-col gap-3" (ngSubmit)="store.save()">
              @for (s of sections; track s.id) {
                <rni-formulaire-section [section]="s.id" />
              }
            </form>
          </div>
        </rni-async-view>
      }
    </div>

    @if (pdfDialog() && f) {
      <rni-pdf-export-dialog [busy]="exporter.busy()" (closed)="pdfDialog.set(false)" (export)="exportPdf($event)" />
    }
  `,
})
export class FormulaireEditPage implements HasUnsavedChanges {
  protected readonly store = inject(FormulaireEditorStore);
  protected readonly exporter = inject(ExportService);
  private readonly confirm = inject(ConfirmService);

  /** Paramètre de route `:id` (`new` pour une création). */
  readonly id = input<string>('new');
  protected readonly sections = SECTIONS;
  protected readonly pdfDialog = signal(false);
  protected isNewRoute = () => this.id() === 'new';

  constructor() {
    effect(() => {
      const id = this.id();
      if (id && id !== 'new' && Number(id) !== untracked(() => this.store.current()?.id_formulaire)) {
        void untracked(() => this.store.load(Number(id)));
      }
    });
  }

  hasUnsavedChanges(): boolean {
    return this.store.hasUnsavedChanges();
  }

  async close(): Promise<void> {
    const ok = await this.confirm.ask('Clôturer la fiche', 'Une fiche clôturée ne peut plus être modifiée. Confirmer la clôture ?', { confirmLabel: 'Clôturer', danger: true });
    if (ok) await this.store.close();
  }

  async remove(): Promise<void> {
    const ok = await this.confirm.ask('Supprimer la fiche', 'La fiche sera définitivement supprimée.', { confirmLabel: 'Supprimer', danger: true });
    if (ok) await this.store.remove();
  }

  async exportPdf(sections: SectionId[]): Promise<void> {
    const f = this.store.current();
    if (!f) return;
    if (await this.exporter.run(() => exportFormulairePdf(f, sections), 'Le PDF de la fiche n’a pas pu être généré.')) this.pdfDialog.set(false);
  }
}
