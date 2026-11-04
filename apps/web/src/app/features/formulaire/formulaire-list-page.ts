import { Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { FormulaireDto } from '@rni/shared';
import { FormulaireApi } from '../../core/api/formulaire.api';
import { AsyncState } from '../../core/state/async-state';
import { AsyncView } from '../../shared/ui/async-view';
import { PageHeader } from '../../shared/ui/page-header';
import { FormulaireFilters } from './components/formulaire-filters';
import { FormulaireTable } from './components/formulaire-table';

/** Liste des fiches de crise (§6.3) — filtrage région / état / dates appliqué par l'API. */
@Component({
  selector: 'rni-formulaire-list-page',
  imports: [RouterLink, PageHeader, AsyncView, FormulaireFilters, FormulaireTable],
  template: `
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-3 p-3 desk:p-4">
      <rni-page-header title="Fiches de crise" [subtitle]="fiches.data().length + ' fiche(s)'">
        <rni-formulaire-filters [(region)]="region" [(closed)]="closed" [(from)]="from" [(to)]="to" />
        <a actions routerLink="/formulaire/new" class="btn-primary">+ Nouvelle fiche</a>
      </rni-page-header>
      <rni-async-view
        class="card"
        [loading]="fiches.loading()"
        [pending]="fiches.pending()"
        [error]="fiches.error()"
        [empty]="!fiches.data().length"
        emptyText="Aucune fiche ne correspond aux filtres."
        (retry)="fiches.reload()"
      >
        <rni-formulaire-table [fiches]="fiches.data()" />
      </rni-async-view>
    </div>
  `,
})
export class FormulaireListPage {
  private readonly api = inject(FormulaireApi);
  protected readonly fiches = new AsyncState<FormulaireDto[]>([]);
  protected readonly region = signal<number | null>(null);
  protected readonly closed = signal<boolean | null>(null);
  protected readonly from = signal('');
  protected readonly to = signal('');

  constructor() {
    // Rechargement à chaque changement de filtre
    effect(() => {
      const filter = {
        region: this.region() ?? undefined,
        closed: this.closed() ?? undefined,
        from: this.from() || undefined,
        to: this.to() || undefined,
      };
      untracked(() => void this.fiches.load(() => this.api.list(filter, { silent: true })));
    });
  }
}
