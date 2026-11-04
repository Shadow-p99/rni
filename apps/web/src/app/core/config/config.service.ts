import { Injectable, computed, inject, signal } from '@angular/core';
import { type AppInfoDto, PARAM_JOURS_GLISSANTS, frozenMessage, minPlanningDate, parseJoursGlissants } from '@rni/shared';
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

  /** BR-PLA-3 : nombre de jours glissants pendant lesquels le planning passé reste modifiable (`null` : M-1). */
  readonly joursGlissants = computed(() => parseJoursGlissants(this.param(PARAM_JOURS_GLISSANTS)));

  /** Première date modifiable du planning (les dates antérieures sont figées). */
  planningMinDate(today: Date = new Date()): string {
    return minPlanningDate(today, this.joursGlissants());
  }

  /** Message « planning figé » si `date` est antérieure à la borne, sinon `null`. */
  planningFrozen(date: string | null | undefined, today: Date = new Date()): string | null {
    const min = this.planningMinDate(today);
    return date && date < min ? frozenMessage(min, this.joursGlissants()) : null;
  }

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
