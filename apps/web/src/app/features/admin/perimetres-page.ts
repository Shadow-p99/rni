import { Component, inject } from '@angular/core';
import { PerimetreModule, PerimetreProfilDto } from '@rni/shared';
import { HasUnsavedChanges } from '../../core/platform/unsaved-changes.guard';
import { AsyncView } from '../../shared/ui/async-view';
import { ErrorPanel } from '../../shared/ui/error-panel';
import { PageHeader } from '../../shared/ui/page-header';
import { PerimetreMatrix } from './perimetre-matrix';
import { PerimetresStore } from './perimetres.store';

/**
 * Administration (super administrateur) : régions visibles par chaque profil sur la carte et sur
 * le planning (BR-AUTH-6 paramétrable).
 */
@Component({
  selector: 'rni-perimetres-page',
  imports: [PageHeader, AsyncView, ErrorPanel, PerimetreMatrix],
  providers: [PerimetresStore],
  template: `
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-3 p-3 desk:p-4">
      <rni-page-header title="Administration — périmètres de visualisation" subtitle="Régions visibles par profil sur la carte opérationnelle et sur le planning">
        <ng-container actions>
          @if (store.dirty()) {
            <span class="text-xs text-amber-700">{{ store.changes().length }} modification(s) non enregistrée(s)</span>
            <button type="button" class="btn-secondary" (click)="store.cancel()" [disabled]="store.save.busy()">Annuler</button>
          }
          <button type="button" class="btn-primary" (click)="store.submit()" [disabled]="!store.dirty() || store.save.busy()">
            {{ store.save.busy() ? 'Enregistrement…' : 'Enregistrer' }}
          </button>
        </ng-container>
      </rni-page-header>

      <div class="card p-3 text-sm text-slate-600">
        <ul class="list-disc space-y-1 pl-5">
          <li><span class="font-medium">Toutes les régions</span> : vision nationale.</li>
          <li><span class="font-medium">Sa région + régions limitrophes</span> : région de l'agent et régions voisines.</li>
          <li><span class="font-medium">Sa région seule</span>.</li>
        </ul>
        <p class="mt-2 text-xs text-slate-500">
          Ces réglages ne concernent que la visualisation. Les droits d'écriture (saisie du planning, gestion du personnel) restent limités à sa région.
          Les utilisateurs connectés voient le changement à leur prochain rechargement de page.
        </p>
      </div>

      <rni-error-panel [error]="store.save.error()" />

      <rni-async-view class="card" [loading]="store.matrix.loading()" [pending]="store.matrix.pending()" [error]="store.matrix.error()" (retry)="store.load()">
        <rni-perimetre-matrix [rows]="store.matrix.data()" [value]="value" [changed]="changed" [disabled]="store.save.busy()" (perimetreChange)="store.set($event.row, $event.module, $event.perimetre)" />
      </rni-async-view>
    </div>
  `,
})
export class PerimetresPage implements HasUnsavedChanges {
  protected readonly store = inject(PerimetresStore);
  protected readonly value = (row: PerimetreProfilDto, m: PerimetreModule) => this.store.value(row, m);
  protected readonly changed = (row: PerimetreProfilDto, m: PerimetreModule) => this.store.isChanged(row, m);

  constructor() {
    void this.store.load();
  }

  hasUnsavedChanges(): boolean {
    return this.store.dirty();
  }
}
