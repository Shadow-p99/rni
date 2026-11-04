import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UserDto, dedupeNeo, isValidPhone } from '@rni/shared';
import { UsersApi } from '../../../core/api/users.api';
import { ToastService } from '../../../core/notifications/toast.service';
import { ActionState } from '../../../core/state/async-state';
import { DefinitionList } from '../../../shared/ui/definition-list';
import { ErrorPanel } from '../../../shared/ui/error-panel';
import { Field } from '../../../shared/ui/field';
import { Modal } from '../../../shared/ui/modal';
import { ProfilPicker } from './profil-picker';

/** §7.3 : modification du profil, du téléphone personnel et du commentaire (téléphones RPSI en lecture). */
@Component({
  selector: 'rni-user-edit-dialog',
  imports: [Modal, FormsModule, DefinitionList, ErrorPanel, Field, ProfilPicker],
  template: `
    <rni-modal [open]="true" [title]="'Modifier — ' + user().prenom + ' ' + user().nom" [locked]="action.busy()" (closed)="closed.emit()">
      <form class="space-y-4 text-sm" id="user-edit" (ngSubmit)="submit()">
        <rni-dl [items]="rpsiInfo()" />
        <rni-profil-picker [(value)]="profil" />
        <rni-field label="Téléphone personnel" for="tel" [error]="telError()">
          <input id="tel" name="tel" class="input" [class.input-error]="!!telError()" [ngModel]="tel()" (ngModelChange)="tel.set($event)" placeholder="06 12 34 56 78 ou +33 6…" />
        </rni-field>
        <rni-field label="Commentaire" for="com">
          <textarea id="com" name="com" class="input" rows="3" maxlength="2000" [ngModel]="commentaire()" (ngModelChange)="commentaire.set($event)"></textarea>
        </rni-field>
        <rni-error-panel [error]="action.error()" />
      </form>
      <ng-container footer>
        <button type="button" class="btn-secondary" (click)="closed.emit()" [disabled]="action.busy()">Annuler</button>
        <button type="submit" form="user-edit" class="btn-primary" [disabled]="action.busy() || !!telError()">{{ action.busy() ? 'Enregistrement…' : 'Enregistrer' }}</button>
      </ng-container>
    </rni-modal>
  `,
})
export class UserEditDialog implements OnInit {
  private readonly api = inject(UsersApi);
  private readonly toasts = inject(ToastService);
  readonly user = input.required<UserDto>();
  readonly closed = output<void>();
  readonly saved = output<UserDto>();

  protected readonly action = new ActionState();
  protected readonly profil = signal<number | null>(null);
  protected readonly tel = signal('');
  protected readonly commentaire = signal('');
  protected readonly telError = computed(() =>
    this.tel().trim() && !isValidPhone(this.tel()) ? 'Numéro invalide (format national 0X XX XX XX XX ou international +XX…).' : null,
  );
  protected readonly rpsiInfo = computed(() => {
    const u = this.user();
    const n = dedupeNeo(u.numero_neo_1, u.numero_neo_2);
    return [
      { label: 'Nigend', value: u.nigend },
      { label: 'Unité', value: `${u.code_unite ?? ''} — ${u.libelle_unite ?? ''}` },
      { label: 'Tél. pro (RPSI)', value: u.tel_pro },
      { label: 'Tél. unité (RPSI)', value: u.tel_unite },
      { label: 'NEO (RPSI)', value: [n.neo1, n.neo2].filter(Boolean).join(' / ') || null },
    ];
  });

  ngOnInit(): void {
    const u = this.user();
    this.profil.set(u.id_profil);
    this.tel.set(u.tel_perso ?? '');
    this.commentaire.set(u.commentaire ?? '');
  }

  async submit(): Promise<void> {
    if (this.telError()) return;
    const u = this.user();
    const r = await this.action.run(() =>
      this.api.update(
        u.id_user,
        {
          ...(this.profil() !== u.id_profil && this.profil() != null ? { id_profil: this.profil()! } : {}),
          tel_perso: this.tel().trim() || null,
          commentaire: this.commentaire().trim() || null,
        },
        { silent: true },
      ),
    );
    if (!r.ok) return;
    this.toasts.success('Compte modifié', `${u.prenom} ${u.nom}`);
    this.saved.emit(r.value);
  }
}
