import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { AdminDashboardDto } from '@rni/shared';
import { AdminApi } from '../../../core/api/admin.api';
import { AsyncState } from '../../../core/state/async-state';

export const DASHBOARD_REFRESH_MS = 30_000;

/**
 * Tableau de bord d'administration : chargement, rafraîchissement automatique (30 s, suspendu
 * quand l'onglet du navigateur est masqué), horodatage de la dernière mise à jour.
 */
@Injectable()
export class DashboardStore {
  private readonly api = inject(AdminApi);
  readonly data = new AsyncState<AdminDashboardDto | null>(null);
  readonly auto = signal(true);
  readonly updatedAt = signal<Date | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const onVisible = () => document.visibilityState === 'visible' && this.auto() && void this.refresh();
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      this.stop();
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  async refresh(): Promise<void> {
    const v = await this.data.load(() => this.api.dashboard({ silent: true }));
    if (v) this.updatedAt.set(new Date());
  }

  start(): void {
    void this.refresh();
    this.setAuto(this.auto());
  }

  setAuto(on: boolean): void {
    this.auto.set(on);
    this.stop();
    if (on) {
      this.timer = setInterval(() => {
        if (document.visibilityState === 'visible' && !this.data.loading()) void this.refresh();
      }, DASHBOARD_REFRESH_MS);
    }
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
