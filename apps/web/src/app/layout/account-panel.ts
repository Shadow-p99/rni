import { Component, effect, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { NeoLineDto } from '@rni/shared';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { UsersApi } from '../core/data.service';
import { ToastService } from '../core/toast.service';
import { Modal } from '../shared/modal';

/** §7.4 : compte personnel — profil, appareil NEO à géolocaliser, interrupteurs de géolocalisation. */
@Component({
  selector: 'rni-account-panel',
  imports: [Modal, FormsModule],
  template: `
    @let u = auth.user();
    <rni-modal [open]="true" title="Mon compte" size="md" (closed)="closed.emit()">
      <div class="mb-4 flex gap-1 border-b border-slate-200">
        <button type="button" class="-mb-px border-b-2 px-3 py-2 text-sm" [class]="tab() === 'profil' ? 'border-rni-700 font-semibold text-rni-800' : 'border-transparent text-slate-500'" (click)="tab.set('profil')">Profil</button>
        <button type="button" class="-mb-px border-b-2 px-3 py-2 text-sm" [class]="tab() === 'appareil' ? 'border-rni-700 font-semibold text-rni-800' : 'border-transparent text-slate-500'" (click)="tab.set('appareil')">Géolocalisation</button>
      </div>
      @if (u) {
        @if (tab() === 'profil') {
          <dl class="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            <dt class="text-slate-500">Identité</dt><dd class="font-medium">{{ u.displayname }}</dd>
            <dt class="text-slate-500">Nigend</dt><dd>{{ u.nigend }}</dd>
            <dt class="text-slate-500">Unité</dt><dd>{{ u.code_unite }} — {{ u.libelle_unite }}</dd>
            <dt class="text-slate-500">Profil</dt><dd>{{ u.libelle_profil }}</dd>
            <dt class="text-slate-500">Région</dt><dd>{{ u.libelle_region ?? '—' }}</dd>
          </dl>
        } @else {
          <div class="space-y-4 text-sm">
            <div>
              <label class="label" for="device">Appareil à géolocaliser</label>
              <div class="flex gap-2">
                <select id="device" class="input" [(ngModel)]="device" [disabled]="loadingLines()">
                  <option [ngValue]="null">Aucun</option>
                  @for (l of lines(); track l.id) {
                    <option [ngValue]="l.id">{{ l.numero }}{{ l.libelle ? ' — ' + l.libelle : '' }}</option>
                  }
                </select>
                <button type="button" class="btn-primary" [disabled]="saving() || device === u.geoloc_id_geoloc" (click)="saveDevice()">Enregistrer</button>
              </div>
              @if (linesError()) {
                <p class="field-error">{{ linesError() }}</p>
              }
              @if (u.geoloc_indicatif) {
                <p class="mt-1 text-xs text-slate-500">Indicatif GEOLOC : {{ u.geoloc_indicatif }}</p>
              }
            </div>
            <label class="flex items-center justify-between gap-4 rounded-md border border-slate-200 p-3">
              <span>
                <span class="font-medium">Géolocalisation</span>
                <span class="block text-xs text-slate-500">Votre position NEO est affichée sur la carte opérationnelle.</span>
              </span>
              <input type="checkbox" class="size-5 accent-rni-700" [checked]="u.geoloc_bool_geoloc" [disabled]="!u.geoloc_id_geoloc || saving()" (change)="toggle(false, $any($event.target).checked)" />
            </label>
            <label class="flex items-center justify-between gap-4 rounded-md border border-slate-200 p-3">
              <span>
                <span class="font-medium">Géolocalisation en position Indisponible</span>
                <span class="block text-xs text-slate-500">Par défaut, un agent indisponible n'est pas géolocalisé (confidentialité).</span>
              </span>
              <input type="checkbox" class="size-5 accent-rni-700" [checked]="u.geoloc_bool_indispo" [disabled]="!u.geoloc_bool_geoloc || saving()" (change)="toggle(true, $any($event.target).checked)" />
            </label>
          </div>
        }
      }
      <ng-container footer>
        <button type="button" class="btn-secondary" (click)="closed.emit()">Fermer</button>
      </ng-container>
    </rni-modal>
  `,
})
export class AccountPanel {
  protected readonly auth = inject(AuthService);
  private readonly users = inject(UsersApi);
  private readonly toasts = inject(ToastService);
  readonly closed = output<void>();

  protected readonly tab = signal<'profil' | 'appareil'>('profil');
  protected readonly lines = signal<NeoLineDto[]>([]);
  protected readonly loadingLines = signal(false);
  protected readonly linesError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected device: string | null = null;
  private linesLoaded = false;

  constructor() {
    effect(() => {
      if (this.tab() === 'appareil' && !this.linesLoaded) void this.loadLines();
    });
  }

  private async loadLines(): Promise<void> {
    const u = this.auth.user();
    if (!u) return;
    this.linesLoaded = true;
    this.device = u.geoloc_id_geoloc;
    this.loadingLines.set(true);
    try {
      this.lines.set(await firstValueFrom(this.users.neoLines(u.nigend)));
    } catch {
      this.linesError.set('Impossible de récupérer vos lignes NEO (REMOP).');
    } finally {
      this.loadingLines.set(false);
    }
  }

  async saveDevice(): Promise<void> {
    this.saving.set(true);
    try {
      this.auth.setUser(await firstValueFrom(this.users.infoDevice(this.device)));
      this.toasts.success('Appareil enregistré');
    } finally {
      this.saving.set(false);
    }
  }

  async toggle(isIndispo: boolean, value: boolean): Promise<void> {
    this.saving.set(true);
    try {
      this.auth.setUser(await firstValueFrom(this.users.activateLocation(isIndispo, value)));
    } finally {
      this.saving.set(false);
    }
  }
}
