import { Injectable, computed, inject, signal } from '@angular/core';
import type { AppInfoDto } from '@rni/shared';
import { firstValueFrom } from 'rxjs';
import { ServiceApi } from '../api/service.api';

/** Informations d'API et paramètres « front » de `t_param_app` (permanence GIGN, Matomo…). */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly api = inject(ServiceApi);
  readonly info = signal<AppInfoDto | null>(null);
  readonly params = signal<Record<string, string | null>>({});

  /** Dette §9.6 : numéro de permanence paramétré dans t_param_app. */
  readonly permanence = computed(() => this.param('rni.permanence.gign') ?? this.info()?.permanenceGign ?? null);
  readonly mentionsUrl = computed(() => this.param('rni.mentions_legales.url') ?? 'mentions-legales.pdf');

  /** Non bloquant : en cas d'échec, l'application fonctionne avec les valeurs par défaut. */
  async load(): Promise<void> {
    const [info, params] = await Promise.all([
      firstValueFrom(this.api.info()).catch(() => null),
      firstValueFrom(this.api.configuration()).catch(() => ({})),
    ]);
    this.info.set(info);
    this.params.set(params);
  }

  param(key: string): string | null {
    return this.params()[key] ?? null;
  }
}
