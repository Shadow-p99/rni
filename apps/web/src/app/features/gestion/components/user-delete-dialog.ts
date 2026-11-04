import { Component, computed, inject, input, output } from '@angular/core';
import { UserDto } from '@rni/shared';
import { UsersApi } from '../../../core/api/users.api';
import { ToastService } from '../../../core/notifications/toast.service';
import { ActionState } from '../../../core/state/async-state';
import { DefinitionList } from '../../../shared/ui/definition-list';
import { ErrorPanel } from '../../../shared/ui/error-panel';
import { Modal } from '../../../shared/ui/modal';

/** BR-GPU-4 : suppression logique, avec rappel de la fiche de l'agent. */
@Component({
  selector: 'rni-user-delete-dialog',
  imports: [Modal, DefinitionList, ErrorPanel],
  template: `
    <rni-modal [open]="true" title="Supprimer le compte" size="sm" [locked]="action.busy()" (closed)="closed.emit()">
      <p class="mb-3 text-sm">Le compte suivant sera désactivé (il pourra être réactivé par une nouvelle inscription) :</p>
      <rni-dl [items]="items()" />
      <div class="mt-3"><rni-error-panel [error]="action.error()" /></div>
      <ng-container footer>
        <button type="button" class="btn-secondary" (click)="closed.emit()" [disabled]="action.busy()">Annuler</button>
        <button type="button" class="btn-danger" [disabled]="action.busy()" (click)="submit()">{{ action.busy() ? 'Suppression…' : 'Supprimer' }}</button>
      </ng-container>
    </rni-modal>
  `,
})
export class UserDeleteDialog {
  private readonly api = inject(UsersApi);
  private readonly toasts = inject(ToastService);
  readonly user = input.required<UserDto>();
  readonly closed = output<void>();
  readonly deleted = output<void>();
  protected readonly action = new ActionState();
  protected readonly items = computed(() => {
    const u = this.user();
    return [
      { label: 'Personnel', value: `${u.grade ?? ''} ${u.prenom} ${u.nom}` },
      { label: 'Nigend', value: u.nigend },
      { label: 'Unité', value: u.libelle_unite },
      { label: 'Profil', value: u.libelle_profil },
    ];
  });

  async submit(): Promise<void> {
    const u = this.user();
    const r = await this.action.run(() => this.api.remove(u.id_user, { silent: true }));
    if (!r.ok) return;
    this.toasts.success('Compte supprimé', `${u.prenom} ${u.nom}`);
    this.deleted.emit();
  }
}
