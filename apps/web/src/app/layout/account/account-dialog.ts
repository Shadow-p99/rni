import { Component, computed, inject, output, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { DefinitionList } from '../../shared/ui/definition-list';
import { Modal } from '../../shared/ui/modal';
import { Tabs } from '../../shared/ui/tabs';
import { AccountGeoloc } from './account-geoloc';

/** Compte personnel (§7.4) : profil (identité SSO) et géolocalisation. */
@Component({
  selector: 'rni-account-dialog',
  imports: [Modal, Tabs, DefinitionList, AccountGeoloc],
  template: `
    <rni-modal [open]="true" title="Mon compte" (closed)="closed.emit()">
      <rni-tabs [tabs]="tabs" [(active)]="tab" />
      @if (tab() === 'profil') {
        <rni-dl [boxed]="false" [items]="profile()" />
      } @else {
        <rni-account-geoloc />
      }
      <ng-container footer>
        <button type="button" class="btn-secondary" (click)="closed.emit()">Fermer</button>
      </ng-container>
    </rni-modal>
  `,
})
export class AccountDialog {
  private readonly auth = inject(AuthService);
  readonly closed = output<void>();
  protected readonly tabs = [
    { id: 'profil', label: 'Profil' },
    { id: 'geoloc', label: 'Géolocalisation' },
  ];
  protected readonly tab = signal('profil');
  protected readonly profile = computed(() => {
    const u = this.auth.user();
    if (!u) return [];
    return [
      { label: 'Identité', value: u.displayname },
      { label: 'Nigend', value: u.nigend },
      { label: 'Unité', value: `${u.code_unite ?? ''} — ${u.libelle_unite ?? ''}` },
      { label: 'Profil', value: u.libelle_profil },
      { label: 'Région', value: u.libelle_region },
    ];
  });
}
