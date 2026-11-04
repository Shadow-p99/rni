import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'rni-unauthorized-page',
  imports: [RouterLink],
  template: `
    <div class="mx-auto mt-16 max-w-lg px-4 text-center">
      <div class="card p-8">
        <p class="text-4xl">⛔</p>
        <h1 class="mt-3 text-xl font-semibold">Accès non autorisé</h1>
        @if (auth.user()) {
          <p class="mt-2 text-sm text-slate-600">Votre profil ({{ auth.user()?.libelle_profil }}) ne permet pas d'accéder à cette page.</p>
          <a routerLink="/carte" class="btn-primary mt-6">Retour à la carte</a>
        } @else {
          <p class="mt-2 text-sm text-slate-600">
            Vous n'êtes pas habilité à l'application RNI, ou votre session SSO a expiré.<br />
            Contactez votre référent régional ou le GIGN pour demander une habilitation.
          </p>
        }
      </div>
    </div>
  `,
})
export class UnauthorizedPage {
  protected readonly auth = inject(AuthService);
}
