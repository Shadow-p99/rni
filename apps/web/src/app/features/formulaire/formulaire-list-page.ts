import { Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { FormulaireDto } from '@rni/shared';
import { FormulaireApi } from '../../core/api/formulaire.api';
import { AuthService } from '../../core/auth/auth.service';
import { toAppError } from '../../core/errors/app-error';
import { ToastService } from '../../core/notifications/toast.service';
import { ConfirmService } from '../../shared/ui/confirm';
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
        @if (auth.canCreerFormulaire()) {
          <a actions routerLink="/formulaire/new" class="btn-primary">+ Nouvelle fiche</a>
        }
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
        <rni-formulaire-table [fiches]="fiches.data()" [busy]="closing()" (closeRequest)="close($event)" />
      </rni-async-view>
    </div>
  `,
})
export class FormulaireListPage {
  private readonly api = inject(FormulaireApi);
  protected readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(ToastService);
  protected readonly closing = signal<number | null>(null);
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

  /** BR-FOR-5 : clôture depuis la liste (irréversible, confirmée). */
  async close(f: FormulaireDto): Promise<void> {
    const who = `${f['nom'] ?? ''} ${f['prenom'] ?? ''}`.trim() || `n° ${f.id_formulaire}`;
    const ok = await this.confirm.ask('Clôturer la fiche', `La fiche « ${who} » ne pourra plus être modifiée. Confirmer la clôture ?`, { confirmLabel: 'Clôturer', danger: true });
    if (!ok) return;
    this.closing.set(f.id_formulaire);
    try {
      const updated = await firstValueFrom(this.api.close(f.id_formulaire, { silent: true }));
      this.fiches.set(this.fiches.data().map((x) => (x.id_formulaire === updated.id_formulaire ? updated : x)));
      this.toasts.success('Fiche clôturée', who);
    } catch (e) {
      const err = toAppError(e);
      this.toasts.error(err.title, err.detail);
    } finally {
      this.closing.set(null);
    }
  }
}
