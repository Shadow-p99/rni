import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { PORTEE_LIBELLES, type Portee } from '@rni/shared';
import { HasUnsavedChanges } from '../../../core/platform/unsaved-changes.guard';
import { AsyncView } from '../../../shared/ui/async-view';
import { ErrorPanel } from '../../../shared/ui/error-panel';
import { PageHeader } from '../../../shared/ui/page-header';
import { Switch } from '../../../shared/ui/switch';
import { DroitsStore } from './droits.store';

/**
 * Administration › Droits : ce que chaque profil peut voir et faire (fiches de crise, planning,
 * carte, gestion du personnel, administration). Un clic accorde ou retire un droit ; certains
 * droits ont une portée (sa région, ses propres fiches…).
 */
@Component({
  selector: 'rni-droits-page',
  imports: [DatePipe, PageHeader, AsyncView, ErrorPanel, Switch],
  providers: [DroitsStore],
  template: `
    <div class="mx-auto flex w-full max-w-7xl flex-col gap-3 p-3 desk:p-4">
      <rni-page-header title="Administration — droits par profil" subtitle="Accordez ou retirez chaque droit d'un clic, puis enregistrez">
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

      <div class="card p-3 text-xs text-slate-600">
        Les droits s'appliquent dès l'enregistrement, sur l'API (toute requête non autorisée est refusée) comme dans l'interface (menus, boutons).
        Les utilisateurs déjà connectés voient le changement à leur prochain rechargement de page.
        Le super administrateur garde toujours l'accès à l'administration.
        @if (store.matrix.data(); as m) {
          @if (m.updated_by) {
            <span class="block pt-1 text-slate-500">Dernière modification : {{ m.updated_at | date: 'dd/MM/yyyy HH:mm' }} — {{ m.updated_by }}</span>
          }
        }
      </div>

      <rni-error-panel [error]="store.save.error()" />

      <rni-async-view class="card" [loading]="store.matrix.loading()" [pending]="store.matrix.pending()" [error]="store.matrix.error()" (retry)="store.load()">
        <div class="overflow-x-auto">
          <table class="w-full border-separate border-spacing-0 text-sm">
            <thead class="text-xs text-slate-500">
              <tr>
                <th class="sticky left-0 z-10 min-w-64 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left uppercase">Droit</th>
                @for (p of store.profils(); track p.id_profil) {
                  <th class="min-w-28 border-b border-slate-200 bg-slate-50 px-2 py-2 text-center align-bottom">
                    <span class="block font-semibold text-slate-700 normal-case">{{ p.libelle }}</span>
                    <span class="font-normal">{{ p.nb_utilisateurs }} compte(s)</span>
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (g of store.groups(); track g.module) {
                <tr>
                  <th [attr.colspan]="store.profils().length + 1" class="sticky left-0 border-b border-slate-200 bg-rni-100 px-3 py-1.5 text-left text-xs font-semibold tracking-wide text-rni-800 uppercase">
                    {{ g.libelle }}
                  </th>
                </tr>
                @for (d of g.droits; track d.code) {
                  <tr class="hover:bg-slate-50">
                    <th scope="row" class="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-2 text-left font-normal">
                      <span class="font-medium">{{ d.libelle }}</span>
                      @if (d.description) {
                        <span class="block text-xs text-slate-500">{{ d.description }}</span>
                      }
                    </th>
                    @for (p of store.profils(); track p.id_profil) {
                      @let v = store.value(p, d.code);
                      @let locked = store.isLocked(p, d.code);
                      <td class="border-b border-slate-100 px-2 py-2 text-center" [class.bg-amber-50]="store.isChanged(p, d.code)">
                        <div class="flex flex-col items-center gap-1">
                          <rni-switch
                            [label]="d.libelle + ' — ' + p.libelle"
                            [checked]="v != null"
                            [changed]="store.isChanged(p, d.code)"
                            [disabled]="locked || store.save.busy()"
                            (checkedChange)="store.toggle(p, d, $event)"
                          />
                          @if (v != null && d.portees.length > 1) {
                            <select
                              class="input !w-auto !py-0.5 !text-xs"
                              [value]="v"
                              [disabled]="locked || store.save.busy()"
                              [attr.aria-label]="'Portée — ' + d.libelle + ' — ' + p.libelle"
                              (change)="store.set(p, d.code, $any($event.target).value)"
                            >
                              @for (x of d.portees; track x) {
                                <option [value]="x" [selected]="x === v">{{ porteeLabel(x) }}</option>
                              }
                            </select>
                          }
                          @if (locked) {
                            <span class="text-[10px] text-slate-400">verrouillé</span>
                          }
                        </div>
                      </td>
                    }
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      </rni-async-view>
    </div>
  `,
})
export class DroitsPage implements HasUnsavedChanges {
  protected readonly store = inject(DroitsStore);
  protected readonly porteeLabel = (p: Portee) => PORTEE_LIBELLES[p];

  constructor() {
    void this.store.load();
  }

  hasUnsavedChanges(): boolean {
    return this.store.dirty();
  }
}
