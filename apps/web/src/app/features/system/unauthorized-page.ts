import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'rni-unauthorized-page',
  imports: [RouterLink],
  template: `
    <div class="mx-auto mt-16 max-w-lg px-4 text-center">
      <div class="card p-8">
        <p class="text-4xl" aria-hidden="true">⛔</p>
        <h1 class="mt-3 text-xl font-semibold">Accès non autorisé</h1>
        @if (auth.user(); as u) {
          <p class="mt-2 text-sm text-slate-600">Votre profil ({{ u.libelle_profil }}) ne permet pas d'accéder à cette page.</p>
          <a routerLink="/carte" class="btn-primary mt-6">Retour à la carte</a>
        } @else {
          <p class="mt-2 text-sm text-slate-600">
            Vous n'êtes pas habilité à l'application RNI, ou votre session SSO a expiré.<br />
            Contactez votre référent régional ou le GIGN pour demander une habilitation.
          </p>
          <button type="button" class="btn-secondary mt-6" (click)="reload()">Se reconnecter</button>
        }
      </div>
    </div>
  `,
})
export class UnauthorizedPage {
  protected readonly auth = inject(AuthService);

  reload(): void {
    location.assign('/');
  }
}
