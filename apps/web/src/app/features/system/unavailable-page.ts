import { Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ReferentielService } from '../../core/referentiel/referentiel.service';
import { Spinner } from '../../shared/ui/spinner';

/** API injoignable au démarrage : on ne conclut pas à un défaut d'habilitation, on propose de réessayer. */
@Component({
  selector: 'rni-unavailable-page',
  imports: [Spinner],
  template: `
    <div class="mx-auto mt-16 max-w-lg px-4 text-center">
      <div class="card p-8">
        <p class="text-4xl" aria-hidden="true">📡</p>
        <h1 class="mt-3 text-xl font-semibold">Service momentanément indisponible</h1>
        <p class="mt-2 text-sm text-slate-600">Le serveur RNI ne répond pas. Vérifiez votre connexion au réseau ou réessayez dans quelques instants.</p>
        @if (auth.lastError(); as e) {
          <p class="mt-2 text-xs text-slate-400">{{ e.title }}{{ e.code ? ' — ' + e.code : '' }}</p>
        }
        <button type="button" class="btn-primary mt-6" (click)="retry()" [disabled]="busy()">
          @if (busy()) {
            <rni-spinner [size]="14" /> Nouvelle tentative…
          } @else {
            Réessayer
          }
        </button>
        <p class="mt-4 text-xs text-slate-400"><a href="/testvie" class="underline">État des services</a></p>
      </div>
    </div>
  `,
})
export class UnavailablePage {
  protected readonly auth = inject(AuthService);
  private readonly ref = inject(ReferentielService);
  private readonly router = inject(Router);
  /** Page demandée initialement (paramètre `retour`). */
  readonly retour = input<string>('/carte');
  protected readonly busy = signal(false);

  async retry(): Promise<void> {
    this.busy.set(true);
    try {
      const status = await this.auth.load(true);
      if (status === 'anonymous') {
        await this.router.navigateByUrl('/unauthorized');
      } else if (status === 'authenticated' && (await this.ref.load())) {
        const target = this.retour()?.startsWith('/') && !this.retour().startsWith('/indisponible') ? this.retour() : '/carte';
        await this.router.navigateByUrl(target);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
