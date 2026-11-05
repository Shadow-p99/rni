import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { ConfigService } from '../core/config/config.service';
import { AccountDialog } from './account/account-dialog';

@Component({
  selector: 'rni-header',
  imports: [RouterLink, RouterLinkActive, AccountDialog],
  template: `
    <header class="no-print sticky top-0 z-[1000] bg-rni-900 text-white shadow">
      <div class="flex h-14 items-center gap-3 px-3 desk:px-5">
        <a routerLink="/carte" class="flex items-center gap-2 font-bold tracking-wide">
          <span class="rounded bg-white px-1.5 py-0.5 text-sm text-rni-900">RNI</span>
          <span class="hidden text-sm font-medium whitespace-nowrap text-slate-200 2xl:inline">Répertoire National des Négociateurs</span>
        </a>
        @if (auth.user()) {
          <nav class="ml-4 hidden items-center gap-1 desk:flex" aria-label="Navigation principale">
            @for (l of links(); track l.path) {
              <a [routerLink]="l.path" routerLinkActive="bg-white/15" class="rounded px-3 py-1.5 text-sm whitespace-nowrap hover:bg-white/10">{{ l.label }}</a>
            }
          </nav>
        }
        <div class="ml-auto flex items-center gap-2">
          @if (permanence()) {
            <a [href]="'tel:' + permanenceTel()" class="hidden items-center gap-1 rounded bg-red-600 px-2.5 py-1 text-xs font-semibold whitespace-nowrap hover:bg-red-700 sm:flex" title="Appeler la permanence GIGN">
              ☎ <span class="hidden lg:inline">Permanence</span> GIGN {{ permanence() }}
            </a>
          }
          @if (auth.user(); as u) {
            <button type="button" class="hidden max-w-72 truncate rounded px-2 py-1 text-sm whitespace-nowrap hover:bg-white/10 sm:block" (click)="account.set(true)">
              {{ u.displayname }} <span class="text-xs text-slate-300">({{ u.libelle_profil }})</span>
            </button>
          }
          <a [href]="mentionsUrl()" target="_blank" rel="noopener" class="hidden text-xs whitespace-nowrap text-slate-300 underline-offset-2 hover:underline xl:inline">Mentions légales</a>
          <button type="button" class="rounded p-2 hover:bg-white/10 desk:hidden" (click)="menu.set(!menu())" aria-label="Menu">☰</button>
        </div>
      </div>
      @if (menu()) {
        <nav class="flex flex-col border-t border-white/10 px-3 py-2 desk:hidden" (click)="menu.set(false)">
          @for (l of links(); track l.path) {
            <a [routerLink]="l.path" routerLinkActive="bg-white/15" class="rounded px-3 py-2 text-sm">{{ l.label }}</a>
          }
          @if (auth.user()) {
            <button type="button" class="rounded px-3 py-2 text-left text-sm" (click)="account.set(true)">Mon compte</button>
          }
          @if (permanence()) {
            <a [href]="'tel:' + permanenceTel()" class="rounded px-3 py-2 text-sm text-red-300">☎ Permanence GIGN {{ permanence() }}</a>
          }
          <a [href]="mentionsUrl()" target="_blank" rel="noopener" class="rounded px-3 py-2 text-sm text-slate-300">Mentions légales</a>
        </nav>
      }
    </header>
    @if (account()) {
      <rni-account-dialog (closed)="account.set(false)" />
    }
  `,
})
export class Header {
  protected readonly auth = inject(AuthService);
  private readonly config = inject(ConfigService);
  protected readonly menu = signal(false);
  protected readonly account = signal(false);

  protected readonly permanence = this.config.permanence;
  protected readonly permanenceTel = computed(() => (this.permanence() ?? '').replace(/[^\d+]/g, ''));
  protected readonly mentionsUrl = this.config.mentionsUrl;

  protected readonly links = computed(() => {
    // Menu selon les droits du profil (Administration › Droits)
    const out: { path: string; label: string }[] = [];
    if (this.auth.canCarte()) out.push({ path: '/carte', label: 'Carte' });
    if (this.auth.canPlanning()) out.push({ path: '/planning', label: 'Planning' });
    if (this.auth.canFormulaire()) out.push({ path: '/formulaire', label: 'Fiches de crise' });
    if (this.auth.canGestion()) out.push({ path: '/gestion', label: 'Gestion du personnel' });
    if (this.auth.canAdmin()) out.push({ path: '/administration', label: 'Administration' });
    return out;
  });
}
