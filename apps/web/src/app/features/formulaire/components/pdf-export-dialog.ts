import { Component, input, output, signal } from '@angular/core';
import { SECTIONS, SectionId } from '@rni/shared';
import { Modal } from '../../../shared/ui/modal';

/** BR-FOR-8 : choix des sections imprimées (le bloc Profil est systématique). */
@Component({
  selector: 'rni-pdf-export-dialog',
  imports: [Modal],
  template: `
    <rni-modal [open]="true" title="Exporter la fiche en PDF" size="sm" [locked]="busy()" (closed)="closed.emit()">
      <p class="mb-3 text-sm text-slate-600">Le bloc « Profil de l'individu » est toujours imprimé. Sections complémentaires :</p>
      @for (s of printable; track s.id) {
        <label class="flex items-center gap-2 py-1 text-sm">
          <input type="checkbox" class="accent-rni-700" [checked]="chosen().has(s.id)" (change)="toggle(s.id)" />{{ s.libelle }}
        </label>
      }
      <ng-container footer>
        <button type="button" class="btn-secondary" (click)="closed.emit()" [disabled]="busy()">Annuler</button>
        <button type="button" class="btn-primary" (click)="export.emit([...chosen()])" [disabled]="busy()">{{ busy() ? 'Génération…' : 'Exporter' }}</button>
      </ng-container>
    </rni-modal>
  `,
})
export class PdfExportDialog {
  readonly busy = input(false);
  readonly closed = output<void>();
  readonly export = output<SectionId[]>();
  protected readonly printable = SECTIONS.filter((s) => s.imprimable);
  protected readonly chosen = signal<Set<SectionId>>(new Set(this.printable.map((s) => s.id)));

  toggle(id: SectionId): void {
    const s = new Set(this.chosen());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.chosen.set(s);
  }
}
