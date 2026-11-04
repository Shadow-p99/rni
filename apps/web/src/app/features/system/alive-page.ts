import { Component, inject } from '@angular/core';
import type { AliveCheckDto } from '@rni/shared';
import { ServiceApi } from '../../core/api/service.api';
import { ConfigService } from '../../core/config/config.service';
import { AsyncState } from '../../core/state/async-state';
import { AsyncView } from '../../shared/ui/async-view';

/** Page de monitoring technique `/testvie` : API, base, Facade, GEOLOC, REMOP. */
@Component({
  selector: 'rni-alive-page',
  imports: [AsyncView],
  template: `
    <div class="mx-auto mt-8 w-full max-w-2xl px-4">
      <div class="card p-6">
        <div class="flex items-center justify-between">
          <h1 class="text-lg font-semibold">Test de vie RNI</h1>
          <button type="button" class="btn-secondary" (click)="run()" [disabled]="checks.loading()">Relancer</button>
        </div>
        @if (config.info(); as i) {
          <p class="mt-1 text-xs text-slate-500">{{ i.name }} v{{ i.version }} — env. {{ i.environment }} — {{ i.database.version ?? 'base ?' }}</p>
        }
        <rni-async-view class="mt-4" [loading]="checks.loading()" [pending]="checks.pending()" [error]="checks.error()" loadingText="Tests en cours…" (retry)="run()">
          <table class="w-full text-sm">
            <thead><tr class="border-b text-left text-xs text-slate-500 uppercase"><th class="py-2">Service</th><th>État</th><th class="text-right">Durée</th></tr></thead>
            <tbody>
              @for (c of checks.data(); track c.service) {
                <tr class="border-b last:border-0">
                  <td class="py-2">{{ c.service }}</td>
                  <td>
                    @if (c.ok) {
                      <span class="chip bg-green-100 text-green-800">OK</span>
                    } @else {
                      <span class="chip bg-red-100 text-red-800">KO</span> <span class="text-xs text-slate-500">{{ c.message }}</span>
                    }
                  </td>
                  <td class="text-right text-slate-500">{{ c.durationMs }} ms</td>
                </tr>
              }
            </tbody>
          </table>
        </rni-async-view>
      </div>
    </div>
  `,
})
export class AlivePage {
  private readonly api = inject(ServiceApi);
  protected readonly config = inject(ConfigService);
  protected readonly checks = new AsyncState<AliveCheckDto[]>([]);

  constructor() {
    this.run();
    if (!this.config.info()) void this.config.load();
  }

  run(): void {
    void this.checks.load(() => this.api.testvie());
  }
}
