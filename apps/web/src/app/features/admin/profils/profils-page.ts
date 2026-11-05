import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Profil, type ProfilAdminDto, type ProfilCreateDto } from '@rni/shared';
import { HasUnsavedChanges } from '../../../core/platform/unsaved-changes.guard';
import { AsyncView } from '../../../shared/ui/async-view';
import { ConfirmService } from '../../../shared/ui/confirm';
import { ErrorPanel } from '../../../shared/ui/error-panel';
import { PageHeader } from '../../../shared/ui/page-header';
import { Switch } from '../../../shared/ui/switch';
import { GestionNiveau, ProfilsStore } from './profils.store';

/**
 * Administration › Profils : libellés, ordre d'affichage, profils portant un planning, création
 * d'un profil (à partir d'un modèle) ; profils listés / gérés par chacun dans la gestion du personnel.
 */
@Component({
  selector: 'rni-profils-page',
  imports: [FormsModule, PageHeader, AsyncView, ErrorPanel, Switch],
  providers: [ProfilsStore],
  template: `
    <div class="mx-auto flex w-full max-w-7xl flex-col gap-3 p-3 desk:p-4">
      <rni-page-header title="Administration — profils" subtitle="Profils, ordre d'affichage, planning et gestion du personnel">
        <button actions type="button" class="btn-primary" (click)="creating.set(!creating())">{{ creating() ? 'Fermer' : '+ Nouveau profil' }}</button>
      </rni-page-header>

      <rni-error-panel [error]="store.action.error()" />

      @if (creating()) {
        <form class="card grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 desk:grid-cols-5" (ngSubmit)="create()">
          <label class="desk:col-span-2">
            <span class="label">Libellé</span>
            <input class="input" name="libelle" required maxlength="64" [(ngModel)]="draft.libelle" placeholder="Ex. Négociateur stagiaire" />
          </label>
          <label>
            <span class="label">Code (4 car.)</span>
            <input class="input" name="code" maxlength="4" [(ngModel)]="draft.code" />
          </label>
          <label>
            <span class="label">Copier les droits de</span>
            <select class="input" name="modele" [(ngModel)]="draft.modele">
              <option [ngValue]="null">— Aucun (carte et planning en consultation)</option>
              @for (p of store.profils.data(); track p.id_profil) {
                <option [ngValue]="p.id_profil">{{ p.libelle }}</option>
              }
            </select>
          </label>
          <label>
            <span class="label">Ordre d'affichage</span>
            <input class="input" type="number" name="classement" min="0" max="999" [(ngModel)]="draft.classement" />
          </label>
          <label class="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" class="accent-rni-700" name="has_planning" [(ngModel)]="draft.has_planning" />Porte un planning (apparaît sur la carte et le planning)
          </label>
          <p class="text-xs text-slate-500 sm:col-span-2 desk:col-span-2">
            Avec un modèle : droits (sauf administration), périmètres et règles de gestion sont copiés ; les profils qui géraient le modèle gèrent aussi le nouveau.
          </p>
          <div class="flex items-end justify-end">
            <button type="submit" class="btn-primary" [disabled]="!draft.libelle.trim() || store.action.busy()">Créer le profil</button>
          </div>
        </form>
      }

      <rni-async-view class="card" [loading]="store.profils.loading()" [pending]="store.profils.pending()" [error]="store.profils.error()" (retry)="store.load()">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-left text-xs text-slate-500 uppercase">
              <tr>
                <th class="px-3 py-2">Profil</th>
                <th class="px-3 py-2">Code</th>
                <th class="px-3 py-2">Ordre</th>
                <th class="px-3 py-2">Planning</th>
                <th class="px-3 py-2">Comptes actifs</th>
                <th class="px-3 py-2"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (p of store.profils.data(); track p.id_profil) {
                @let e = store.editing();
                @if (e && e.id === p.id_profil) {
                  <tr class="bg-amber-50">
                    <td class="px-3 py-2"><input class="input" maxlength="64" [ngModel]="e.value.libelle" (ngModelChange)="store.patch({ libelle: $event })" aria-label="Libellé" /></td>
                    <td class="px-3 py-2"><input class="input !w-20" maxlength="4" [ngModel]="e.value.code" (ngModelChange)="store.patch({ code: $event })" aria-label="Code" /></td>
                    <td class="px-3 py-2"><input class="input !w-20" type="number" min="0" max="999" [ngModel]="e.value.classement" (ngModelChange)="store.patch({ classement: $event })" aria-label="Ordre" /></td>
                    <td class="px-3 py-2"><rni-switch label="Porte un planning" [checked]="e.value.has_planning" (checkedChange)="store.patch({ has_planning: $event })" /></td>
                    <td class="px-3 py-2 text-slate-500">{{ p.nb_utilisateurs }}</td>
                    <td class="px-3 py-2 text-right whitespace-nowrap">
                      <button type="button" class="btn-ghost" (click)="store.editing.set(null)">Annuler</button>
                      <button type="button" class="btn-primary" (click)="store.saveEdit()" [disabled]="store.action.busy()">Enregistrer</button>
                    </td>
                  </tr>
                } @else {
                  <tr>
                    <td class="px-3 py-2 font-medium">{{ p.libelle }} @if (!p.systeme) {<span class="chip ml-1 bg-rni-100 text-rni-800">créé</span>}</td>
                    <td class="px-3 py-2 text-slate-500">{{ p.code ?? '—' }}</td>
                    <td class="px-3 py-2">{{ p.classement }}</td>
                    <td class="px-3 py-2">{{ p.has_planning ? 'Oui' : 'Non' }}</td>
                    <td class="px-3 py-2">{{ p.nb_utilisateurs }}</td>
                    <td class="px-3 py-2 text-right whitespace-nowrap">
                      <button type="button" class="btn-ghost" (click)="store.edit(p)" [disabled]="!!store.editing()">Modifier</button>
                      @if (!p.systeme) {
                        <button type="button" class="btn-ghost text-red-700" (click)="remove(p)" [disabled]="store.action.busy()">Supprimer</button>
                      }
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      </rni-async-view>

      <section class="card p-3">
        <div class="mb-2 flex flex-wrap items-center gap-2">
          <div>
            <h2 class="font-semibold">Gestion du personnel</h2>
            <p class="text-xs text-slate-500">
              Pour chaque profil (ligne) : comptes des autres profils (colonnes) <span class="font-medium">listés</span> dans l'écran Gestion, ou
              <span class="font-medium">gérés</span> (attribution du profil, modification, suppression). Dans sa région seulement si son droit « Gérer le personnel » est régional.
            </p>
          </div>
          <div class="ml-auto flex items-center gap-2">
            @if (store.gestionDirty()) {
              <span class="text-xs text-amber-700">{{ store.gestionDraft().size }} modification(s)</span>
              <button type="button" class="btn-secondary" (click)="store.cancelGestion()">Annuler</button>
            }
            <button type="button" class="btn-primary" (click)="store.saveGestion()" [disabled]="!store.gestionDirty() || store.action.busy()">Enregistrer</button>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th class="px-3 py-2 text-left uppercase">Profil ↓ gère →</th>
                @for (c of store.profils.data(); track c.id_profil) {
                  <th class="min-w-24 px-2 py-2 text-center font-semibold text-slate-700">{{ c.libelle }}</th>
                }
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (p of store.profils.data(); track p.id_profil) {
                <tr>
                  <th scope="row" class="px-3 py-2 text-left font-medium">{{ p.libelle }}</th>
                  @for (c of store.profils.data(); track c.id_profil) {
                    @let n = store.niveau(p, c.id_profil);
                    <td class="px-2 py-1.5 text-center" [class.bg-amber-50]="store.isChanged(p, c.id_profil)">
                      <select
                        class="input !w-auto !py-0.5 !text-xs"
                        [class.!bg-green-50]="n === 'gere'"
                        [class.!bg-sky-50]="n === 'liste'"
                        [value]="n"
                        [attr.aria-label]="p.libelle + ' → ' + c.libelle"
                        (change)="store.setNiveau(p, c.id_profil, $any($event.target).value)"
                      >
                        @for (o of niveaux; track o.v) {
                          <option [value]="o.v" [selected]="o.v === n" [disabled]="o.v === 'gere' && c.id_profil === superAdmin && p.id_profil !== superAdmin">{{ o.l }}</option>
                        }
                      </select>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `,
})
export class ProfilsPage implements HasUnsavedChanges {
  protected readonly store = inject(ProfilsStore);
  private readonly confirm = inject(ConfirmService);
  protected readonly creating = signal(false);
  protected readonly superAdmin = Profil.SUPER_ADMIN;
  protected readonly niveaux: { v: GestionNiveau; l: string }[] = [
    { v: 'aucun', l: '—' },
    { v: 'liste', l: 'Listés' },
    { v: 'gere', l: 'Gérés' },
  ];
  protected draft: ProfilCreateDto = this.emptyDraft();

  constructor() {
    void this.store.load();
  }

  private emptyDraft(): ProfilCreateDto {
    return { libelle: '', code: null, classement: 50, has_planning: false, modele: null };
  }

  hasUnsavedChanges(): boolean {
    return this.store.gestionDirty() || !!this.store.editing();
  }

  async create(): Promise<void> {
    if (await this.store.create({ ...this.draft, code: this.draft.code?.trim() || null, classement: Number(this.draft.classement) || 0 })) {
      this.draft = this.emptyDraft();
      this.creating.set(false);
    }
  }

  async remove(p: ProfilAdminDto): Promise<void> {
    const ok = await this.confirm.ask('Supprimer le profil', `Le profil « ${p.libelle} », ses droits et ses règles de gestion seront supprimés.`, { confirmLabel: 'Supprimer', danger: true });
    if (ok) await this.store.remove(p);
  }
}
