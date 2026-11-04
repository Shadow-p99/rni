import { Component, inject, signal } from '@angular/core';
import type { MockUserDto } from '@rni/shared';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { ConfigService } from '../core/config.service';
import { UsersApi } from '../core/data.service';

const COOKIE = 'rni_mock_nigend';

/**
 * Développement uniquement (API en RNI_MOCK_AUTH=true) : simule l'identité transmise par le SSO
 * pour tester les différents profils.
 */
@Component({
  selector: 'rni-dev-switcher',
  template: `
    @if (config.info()?.mockAuth) {
      <div class="no-print fixed bottom-3 left-3 z-[1500] rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs shadow-lg">
        @if (open()) {
          <p class="mb-1 font-semibold text-amber-900">Simulation SSO (dev)</p>
          <select class="input py-1 text-xs" [value]="current" (change)="switch($any($event.target).value)">
            @for (u of users(); track u.nigend) {
              <option [value]="u.nigend">{{ u.libelle_profil }} — {{ u.prenom }} {{ u.nom }} ({{ u.libelle_region ?? 'national' }})</option>
            }
            <option value="none">Aucun en-tête (non authentifié)</option>
          </select>
          <button type="button" class="mt-1 text-amber-800 underline" (click)="open.set(false)">Réduire</button>
        } @else {
          <button type="button" class="font-semibold text-amber-900" (click)="expand()">⚙ Profil simulé : {{ auth.user()?.libelle_profil ?? '—' }}</button>
        }
      </div>
    }
  `,
})
export class DevSwitcher {
  protected readonly config = inject(ConfigService);
  protected readonly auth = inject(AuthService);
  private readonly api = inject(UsersApi);
  protected readonly users = signal<MockUserDto[]>([]);
  protected readonly open = signal(false);
  protected current = document.cookie.match(/rni_mock_nigend=([^;]+)/)?.[1] ?? '';

  async expand(): Promise<void> {
    this.open.set(true);
    if (!this.users().length) this.users.set(await firstValueFrom(this.api.mockUsers()));
    this.current ||= this.auth.user()?.nigend ?? '';
  }

  switch(nigend: string): void {
    document.cookie = `${COOKIE}=${nigend}; path=/; SameSite=Lax`;
    location.assign('/');
  }
}
