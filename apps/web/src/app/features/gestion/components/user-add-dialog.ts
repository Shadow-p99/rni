import { Component, inject, output, signal } from '@angular/core';
import { PROFIL_LIBELLES, Profil, RPSI_SEARCH_MIN_CHARS, RpsiPersonnelDto, UserDto } from '@rni/shared';
import { UsersApi } from '../../../core/api/users.api';
import { ToastService } from '../../../core/notifications/toast.service';
import { ActionState } from '../../../core/state/async-state';
import { DefinitionList } from '../../../shared/ui/definition-list';
import { ErrorPanel } from '../../../shared/ui/error-panel';
import { Modal } from '../../../shared/ui/modal';
import { Typeahead, TypeaheadBadge } from '../../../shared/ui/typeahead';
import { ProfilPicker } from './profil-picker';

/** BR-GPU-2 : inscription d'un personnel à partir du RPSI (ou réactivation d'un compte inactif). */
@Component({
  selector: 'rni-user-add-dialog',
  imports: [Modal, Typeahead, DefinitionList, ErrorPanel, ProfilPicker],
  template: `
    <rni-modal [open]="true" title="Inscrire un personnel (RPSI)" [locked]="action.busy()" (closed)="closed.emit()">
      <div class="space-y-4">
        <div>
          <label class="label" for="rpsi-search">Personnel RPSI</label>
          <rni-typeahead
            inputId="rpsi-search"
            [search]="search"
            [display]="display"
            [describe]="describe"
            [badge]="badge"
            [minChars]="minChars"
            [placeholder]="'Nigend, nom ou prénom (' + minChars + ' caractères min.)'"
            hint="L'identité, le grade, l'unité, la région et les téléphones proviennent du RPSI."
            emptyText="Aucun personnel RPSI ne correspond (dans votre périmètre)."
            (selected)="pick($event)"
          />
        </div>
        @if (selected(); as p) {
          <rni-dl [items]="[
            { label: 'Identité', value: (p.grade ?? '') + ' ' + p.prenom + ' ' + p.nom },
            { label: 'Unité', value: p.code_unite + ' — ' + p.libelle_unite },
            { label: 'Région', value: p.libelle_region }
          ]" />
          @if (p.id_user && !p.bool_user_inactif) {
            <p class="text-sm text-amber-800">Ce personnel est déjà inscrit : l'inscription changera son profil.</p>
          } @else if (p.id_user) {
            <p class="text-sm text-amber-800">Compte inactif : il sera réactivé.</p>
          }
        }
        <rni-profil-picker [(value)]="profil" />
        <rni-error-panel [error]="action.error()" />
      </div>
      <ng-container footer>
        <button type="button" class="btn-secondary" (click)="closed.emit()" [disabled]="action.busy()">Annuler</button>
        <button type="button" class="btn-primary" [disabled]="!selected() || profil() == null || action.busy()" (click)="submit()">
          {{ action.busy() ? 'Inscription…' : 'Inscrire' }}
        </button>
      </ng-container>
    </rni-modal>
  `,
})
export class UserAddDialog {
  private readonly api = inject(UsersApi);
  private readonly toasts = inject(ToastService);
  readonly closed = output<void>();
  readonly saved = output<UserDto>();

  protected readonly action = new ActionState();
  protected readonly selected = signal<RpsiPersonnelDto | null>(null);
  protected readonly profil = signal<number | null>(Profil.NEGOCIATEUR);
  protected readonly minChars = RPSI_SEARCH_MIN_CHARS;

  protected readonly search = (q: string) => this.api.rpsi(q);
  protected readonly display = (p: RpsiPersonnelDto) => `${p.nigend} — ${p.prenom} ${p.nom}`;
  protected readonly describe = (p: RpsiPersonnelDto) => p.libelle_unite;
  protected readonly badge = (p: RpsiPersonnelDto): TypeaheadBadge | null =>
    p.id_user ? (p.bool_user_inactif ? { label: 'inactif — réactivation', tone: 'warning' } : { label: 'déjà inscrit', tone: 'neutral' }) : null;

  pick(p: RpsiPersonnelDto | null): void {
    this.selected.set(p);
    this.action.clear();
  }

  async submit(): Promise<void> {
    const p = this.selected();
    const profil = this.profil();
    if (!p || profil == null) return;
    const r = await this.action.run(() => this.api.create({ nigend: p.nigend, id_profil: profil }, { silent: true }));
    if (!r.ok) return;
    this.toasts.success(p.id_user ? 'Compte réactivé' : 'Compte créé', `${p.prenom} ${p.nom} — ${PROFIL_LIBELLES[profil as Profil]}`);
    this.saved.emit(r.value);
  }
}
