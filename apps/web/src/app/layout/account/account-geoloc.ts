import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { NeoLineDto } from '@rni/shared';
import { UsersApi } from '../../core/api/users.api';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { ActionState, AsyncState } from '../../core/state/async-state';
import { AsyncView } from '../../shared/ui/async-view';
import { ErrorPanel } from '../../shared/ui/error-panel';
import { Toggle } from '../../shared/ui/toggle';

/** §7.4 : appareil NEO à géolocaliser et interrupteurs de géolocalisation (BR-REF-2/3). */
@Component({
  selector: 'rni-account-geoloc',
  imports: [FormsModule, AsyncView, ErrorPanel, Toggle],
  template: `
    @let u = auth.user();
    @if (u) {
      <div class="space-y-4 text-sm">
        <div>
          <label class="label" for="device">Appareil à géolocaliser</label>
          <rni-async-view [loading]="lines.loading()" [pending]="lines.pending()" [error]="lines.error()" loadingText="Lignes NEO (REMOP)…" (retry)="lines.reload()">
            <div class="flex gap-2">
              <select id="device" class="input" [ngModel]="device()" (ngModelChange)="device.set($event)">
                <option [ngValue]="null">Aucun</option>
                @for (l of lines.data(); track l.id) {
                  <option [ngValue]="l.id">{{ l.numero }}{{ l.libelle ? ' — ' + l.libelle : '' }}</option>
                }
              </select>
              <button type="button" class="btn-primary" [disabled]="action.busy() || device() === u.geoloc_id_geoloc" (click)="saveDevice()">Enregistrer</button>
            </div>
          </rni-async-view>
          @if (u.geoloc_indicatif) {
            <p class="mt-1 text-xs text-slate-500">Indicatif GEOLOC : {{ u.geoloc_indicatif }}</p>
          }
        </div>
        <rni-toggle
          label="Géolocalisation"
          description="Votre position NEO est affichée sur la carte opérationnelle."
          [checked]="u.geoloc_bool_geoloc"
          [disabled]="!u.geoloc_id_geoloc || action.busy()"
          (checkedChange)="toggle(false, $event)"
        />
        <rni-toggle
          label="Géolocalisation en position Indisponible"
          description="Par défaut, un agent indisponible n'est pas géolocalisé (confidentialité)."
          [checked]="u.geoloc_bool_indispo"
          [disabled]="!u.geoloc_bool_geoloc || action.busy()"
          (checkedChange)="toggle(true, $event)"
        />
        <rni-error-panel [error]="action.error()" />
      </div>
    }
  `,
})
export class AccountGeoloc implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(UsersApi);
  private readonly toasts = inject(ToastService);
  protected readonly lines = new AsyncState<NeoLineDto[]>([]);
  protected readonly action = new ActionState();
  protected readonly device = signal<string | null>(null);

  ngOnInit(): void {
    const u = this.auth.user();
    if (!u) return;
    this.device.set(u.geoloc_id_geoloc);
    void this.lines.load(() => this.api.neoLines(u.nigend, { silent: true }));
  }

  async saveDevice(): Promise<void> {
    const r = await this.action.run(() => this.api.infoDevice(this.device(), { silent: true }));
    if (!r.ok) return;
    this.auth.setUser(r.value);
    this.toasts.success('Appareil enregistré');
  }

  async toggle(isIndispo: boolean, value: boolean): Promise<void> {
    const before = this.auth.user();
    const r = await this.action.run(() => this.api.activateLocation(isIndispo, value, { silent: true }));
    // En cas d'échec, l'interrupteur revient à l'état enregistré.
    if (r.ok) this.auth.setUser(r.value);
    else if (before) this.auth.setUser({ ...before });
  }
}
