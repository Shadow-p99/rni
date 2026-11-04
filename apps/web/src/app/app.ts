import { Component, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './core/auth/auth.service';
import { ConfigService } from './core/config/config.service';
import { initMatomo, trackPage } from './core/config/matomo';
import { Header } from './layout/header';
import { DevSwitcher } from './layout/dev-switcher';
import { ConfirmHost } from './shared/ui/confirm';
import { Toasts } from './shared/ui/toasts';

@Component({
  selector: 'rni-root',
  imports: [RouterOutlet, Header, Toasts, ConfirmHost, DevSwitcher],
  template: `
    <div class="flex min-h-full flex-col">
      <rni-header />
      <main class="flex flex-1 flex-col">
        <router-outlet />
      </main>
    </div>
    <rni-toasts />
    <rni-confirm-host />
    <rni-dev-switcher />
  `,
})
export class App {
  private readonly config = inject(ConfigService);

  constructor() {
    const router = inject(Router);
    // Identité chargée dès le démarrage (en-tête, y compris sur les pages publiques)
    void inject(AuthService).load();
    void this.config.load().then(() => initMatomo(this.config.param('rni.matomo.url'), this.config.param('rni.matomo.site_id')));
    router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => trackPage(e.urlAfterRedirects, document.title));
  }
}
