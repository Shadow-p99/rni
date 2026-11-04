import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PROFIL_LIBELLES, UserDto, listableProfils } from '@rni/shared';
import { AuthService } from '../../core/auth/auth.service';
import { AsyncView } from '../../shared/ui/async-view';
import { PageHeader } from '../../shared/ui/page-header';
import { Paginator } from '../../shared/ui/paginator';
import { RegionSelect } from '../../shared/ui/region-select';
import { SearchInput } from '../../shared/ui/search-input';
import { UserAddDialog } from './components/user-add-dialog';
import { UserDeleteDialog } from './components/user-delete-dialog';
import { UserEditDialog } from './components/user-edit-dialog';
import { UsersTable } from './components/users-table';
import { GestionStore } from './gestion.store';

type Dialog = { kind: 'add' } | { kind: 'edit'; user: UserDto } | { kind: 'delete'; user: UserDto };

/**
 * Module Gestion du personnel (§7) : liste paginée côté serveur (état dans `GestionStore`),
 * dialogues d'inscription / modification / suppression autonomes.
 */
@Component({
  selector: 'rni-gestion-page',
  imports: [DecimalPipe, FormsModule, PageHeader, SearchInput, RegionSelect, AsyncView, Paginator, UsersTable, UserAddDialog, UserEditDialog, UserDeleteDialog],
  providers: [GestionStore],
  template: `
    @let page = store.list.data();
    <div class="mx-auto flex w-full max-w-7xl flex-col gap-3 p-3 pb-16 desk:p-4 desk:pb-16">
      <rni-page-header title="Gestion du personnel" [subtitle]="(page.total | number) + (page.capped ? '+' : '') + ' compte(s)'">
        <rni-search-input class="min-w-64 flex-1" label="Recherche" placeholder="Nom, prénom, nigend, code ou libellé d'unité…" [value]="store.q()" (search)="store.search($event)" />
        @if (auth.isGign()) {
          <rni-region-select class="w-56" label="Région" scope="all" [value]="store.region()" (valueChange)="store.setRegion($event)" />
        } @else {
          <p class="self-center text-sm text-slate-500">Région : {{ auth.user()?.libelle_region }}</p>
        }
        <div>
          <label class="label" for="g-profil">Profil</label>
          <select id="g-profil" class="input w-44" [ngModel]="store.profil()" (ngModelChange)="store.setProfil($event)">
            <option [ngValue]="null">Tous</option>
            @for (id of listable(); track id) {
              <option [ngValue]="id">{{ libelles[id] }}</option>
            }
          </select>
        </div>
        @if (store.hasFilters()) {
          <button type="button" class="btn-ghost self-end" (click)="store.reset()">Réinitialiser</button>
        }
        <button actions type="button" class="btn-primary" (click)="dialog.set({ kind: 'add' })">+ Inscrire un personnel</button>
      </rni-page-header>

      <rni-async-view
        class="card"
        [loading]="store.list.loading()"
        [pending]="store.list.pending()"
        [error]="store.list.error()"
        [empty]="!page.items.length"
        emptyText="Aucun compte ne correspond."
        (retry)="store.list.reload()"
      >
        <rni-users-table
          [users]="page.items"
          [sort]="store.sort()"
          [dir]="store.dir()"
          [currentUserId]="auth.user()?.id_user ?? null"
          [canManage]="canManage"
          (sortChange)="store.toggleSort($event)"
          (edit)="dialog.set({ kind: 'edit', user: $event })"
          (remove)="dialog.set({ kind: 'delete', user: $event })"
        />
      </rni-async-view>

      @if (!store.list.error()) {
        <rni-paginator [page]="store.page()" [size]="store.size()" [total]="page.total" [capped]="!!page.capped" (pageChange)="store.setPage($event)" (sizeChange)="store.setSize($event)" />
      }
    </div>

    @switch (dialog()?.kind) {
      @case ('add') {
        <rni-user-add-dialog (closed)="dialog.set(null)" (saved)="onChanged()" />
      }
      @case ('edit') {
        <rni-user-edit-dialog [user]="dialogUser()!" (closed)="dialog.set(null)" (saved)="onChanged()" />
      }
      @case ('delete') {
        <rni-user-delete-dialog [user]="dialogUser()!" (closed)="dialog.set(null)" (deleted)="onChanged()" />
      }
    }
  `,
})
export class GestionPage {
  protected readonly auth = inject(AuthService);
  protected readonly store = inject(GestionStore);
  protected readonly dialog = signal<Dialog | null>(null);
  protected readonly dialogUser = computed(() => {
    const d = this.dialog();
    return d && d.kind !== 'add' ? d.user : null;
  });
  protected readonly libelles = PROFIL_LIBELLES;
  protected readonly listable = computed(() => listableProfils(this.auth.profil() ?? 0));
  protected readonly canManage = (u: UserDto) => this.auth.canManageUser(u);

  constructor() {
    this.store.init();
  }

  onChanged(): void {
    this.dialog.set(null);
    void this.store.reload();
  }
}
