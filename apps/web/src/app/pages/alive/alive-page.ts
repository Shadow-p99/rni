import { Component, inject, signal } from '@angular/core';
import type { AliveCheckDto } from '@rni/shared';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '../../core/config.service';
import { GeoApi } from '../../core/data.service';

/** Page de monitoring technique `/testvie` : API, base, Facade, GEOLOC, REMOP. */
@Component({
  selector: 'rni-alive-page',
  template: `
    <div class="mx-auto mt-8 w-full max-w-2xl px-4">
      <div class="card p-6">
        <div class="flex items-center justify-between">
          <h1 class="text-lg font-semibold">Test de vie RNI</h1>
          <button type="button" class="btn-secondary" (click)="run()" [disabled]="running()">Relancer</button>
        </div>
        @if (config.info(); as i) {
          <p class="mt-1 text-xs text-slate-500">{{ i.name }} v{{ i.version }} — env. {{ i.environment }} — {{ i.database.version ?? 'base ?' }}</p>
        }
        <table class="mt-4 w-full text-sm">
          <thead><tr class="border-b text-left text-xs text-slate-500 uppercase"><th class="py-2">Service</th><th>État</th><th class="text-right">Durée</th></tr></thead>
          <tbody>
            @for (c of checks(); track c.service) {
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
            } @empty {
              <tr><td colspan="3" class="py-4 text-center text-slate-500">{{ running() ? 'Tests en cours…' : 'API injoignable.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class AlivePage {
  private readonly geo = inject(GeoApi);
  protected readonly config = inject(ConfigService);
  protected readonly checks = signal<AliveCheckDto[]>([]);
  protected readonly running = signal(false);

  constructor() {
    void this.run();
  }

  async run(): Promise<void> {
    this.running.set(true);
    try {
      this.checks.set(await firstValueFrom(this.geo.testvie()));
    } catch {
      this.checks.set([{ service: 'API', ok: false, durationMs: 0, message: 'injoignable' }]);
    } finally {
      this.running.set(false);
    }
  }
}
