import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'rni-not-found-page',
  imports: [RouterLink],
  template: `
    <div class="mx-auto mt-16 max-w-lg px-4 text-center">
      <div class="card p-8">
        <p class="text-4xl" aria-hidden="true">🧭</p>
        <h1 class="mt-3 text-xl font-semibold">Page introuvable</h1>
        <p class="mt-2 text-sm text-slate-600">L'adresse demandée n'existe pas.</p>
        <a routerLink="/carte" class="btn-primary mt-6">Retour à la carte</a>
      </div>
    </div>
  `,
})
export class NotFoundPage {}
