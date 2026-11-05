import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LOG_DB_THRESHOLDS, LOG_THRESHOLDS, type LogThreshold } from '@rni/shared';
import { HasUnsavedChanges } from '../../../core/platform/unsaved-changes.guard';
import { AsyncView } from '../../../shared/ui/async-view';
import { ErrorPanel } from '../../../shared/ui/error-panel';
import { PageHeader } from '../../../shared/ui/page-header';
import { Toggle } from '../../../shared/ui/toggle';
import { fmtDayTime, fmtInt } from '../format';
import { LogSettingsStore, isVerbose } from './log-settings.store';

export const LEVEL_INFO: Record<LogThreshold, { label: string; description: string }> = {
  error: { label: 'Erreurs', description: 'Erreurs techniques seulement' },
  warn: { label: 'Alertes', description: 'Erreurs, refus d’accès, lenteurs, services externes en échec' },
  log: { label: 'Informations', description: 'Plus toutes les écritures (plannings, comptes, fiches…) : usage normal' },
  debug: { label: 'Débogage', description: 'Plus les lectures avec volumes et durées, refus détaillés, appels externes' },
  verbose: { label: 'Détaillé', description: 'Tout, y compris cache et contrôles de droits de chaque requête' },
};

const DURATIONS: { value: number | null; label: string }[] = [
  { value: 15, label: '15 min' },
  { value: 60, label: '1 heure' },
  { value: 240, label: '4 heures' },
  { value: null, label: 'Permanent' },
];

/** Réglages de la journalisation (super administrateur), appliqués à chaud à toutes les instances. */
@Component({
  selector: 'rni-log-settings-page',
  imports: [PageHeader, AsyncView, ErrorPanel, Toggle, FormsModule, RouterLink],
  providers: [LogSettingsStore],
  template: `
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-3 p-3 desk:p-4">
      <rni-page-header title="Réglages de la journalisation" subtitle="Appliqués immédiatement à toutes les instances de l'API, sans redémarrage">
        <ng-container actions>
          @if (store.dirty()) {
            <span class="text-xs text-amber-700">Modifications non enregistrées</span>
            <button type="button" class="btn-secondary" (click)="store.reset()" [disabled]="store.save.busy()">Annuler</button>
          }
          <button type="button" class="btn-primary" (click)="store.submit()" [disabled]="!store.dirty() || store.errors().length > 0 || store.save.busy()">
            {{ store.save.busy() ? 'Enregistrement…' : 'Enregistrer' }}
          </button>
        </ng-container>
      </rni-page-header>

      <rni-error-panel [error]="store.save.error()" />

      <rni-async-view [loading]="store.data.loading()" [pending]="store.data.pending()" [error]="store.data.error()" (retry)="store.load()">
        @if (store.draft(); as d) {
          @let s = store.data.data()!;
          <div class="grid gap-3 lg:grid-cols-3">
            <div class="flex flex-col gap-3 lg:col-span-2">
              <!-- Niveau global -->
              <section class="card p-3" aria-labelledby="lvl-title">
                <h2 id="lvl-title" class="text-sm font-semibold">Niveau de détail</h2>
                <p class="mb-2 text-xs text-slate-500">Chaque niveau inclut les plus graves.</p>
                <div class="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby="lvl-title">
                  <label class="flex cursor-pointer gap-2 rounded-md border p-2.5" [class]="d.level === '' ? 'border-rni-600 bg-rni-100/40' : 'border-slate-200 hover:border-slate-300'">
                    <input type="radio" name="level" class="mt-0.5 accent-rni-700" [checked]="d.level === ''" (change)="store.patch({ level: '' })" />
                    <span>
                      <span class="text-sm font-medium">Par défaut du serveur</span>
                      <span class="block text-xs text-slate-500">{{ info[s.defaut.level].label }} (variable LOG_LEVEL={{ s.defaut.level }})</span>
                    </span>
                  </label>
                  @for (l of levels; track l) {
                    <label class="flex cursor-pointer gap-2 rounded-md border p-2.5" [class]="d.level === l ? 'border-rni-600 bg-rni-100/40' : 'border-slate-200 hover:border-slate-300'">
                      <input type="radio" name="level" class="mt-0.5 accent-rni-700" [checked]="d.level === l" (change)="store.patch({ level: l })" />
                      <span>
                        <span class="text-sm font-medium">{{ info[l].label }} <span class="font-mono text-xs text-slate-500">{{ l }}</span></span>
                        <span class="block text-xs text-slate-500">{{ info[l].description }}</span>
                      </span>
                    </label>
                  }
                </div>
              </section>

              <!-- Par contexte -->
              <section class="card p-3" aria-labelledby="ctx-title">
                <h2 id="ctx-title" class="text-sm font-semibold">Niveau par service</h2>
                <p class="mb-2 text-xs text-slate-500">
                  Plus détaillé ou plus discret que le niveau général pour certains services seulement, par exemple PlanningService en débogage et HTTP en alertes.
                </p>
                <datalist id="known-contexts">
                  @for (c of s.contextes_connus; track c) {
                    <option [value]="c"></option>
                  }
                </datalist>
                <div class="flex flex-col gap-2">
                  @for (c of d.contexts; track $index; let i = $index) {
                    <div class="flex flex-wrap items-center gap-2">
                      <input
                        class="input min-w-0 flex-1 font-mono text-sm"
                        [name]="'ctx-' + i"
                        list="known-contexts"
                        placeholder="Nom du service (ex. PlanningService)"
                        [attr.aria-label]="'Service ' + (i + 1)"
                        [ngModel]="c.contexte"
                        (ngModelChange)="store.updateContext(i, { contexte: $event })"
                      />
                      <select class="input w-44" [name]="'ctx-lvl-' + i" [attr.aria-label]="'Niveau du service ' + (i + 1)" [ngModel]="c.niveau" (ngModelChange)="store.updateContext(i, { niveau: $event })">
                        @for (l of levels; track l) {
                          <option [value]="l">{{ info[l].label }}</option>
                        }
                      </select>
                      <button type="button" class="btn-ghost px-2 text-slate-500" (click)="store.removeContext(i)" [attr.aria-label]="'Retirer le service ' + (c.contexte || i + 1)">✕</button>
                    </div>
                  } @empty {
                    <p class="text-sm text-slate-500">Aucun réglage par service : le niveau général s'applique partout.</p>
                  }
                </div>
                <button type="button" class="btn-secondary mt-2" (click)="store.addContext()" [disabled]="d.contexts.length >= 30">+ Ajouter un service</button>
              </section>

              <section class="card flex flex-col gap-3 p-3">
                <rni-toggle
                  label="Journaliser les requêtes SQL"
                  description="Chaque requête SQL avec sa durée, rattachée à la requête HTTP qui l'a émise, consultable dans le Journal. Le texte SQL contient les valeurs recherchées (nigend, noms…) et le volume est important : à réserver au diagnostic, sur une durée limitée."
                  [checked]="d.sql"
                  (checkedChange)="store.patch({ sql: $event })"
                />
                <a class="text-xs text-rni-700 hover:underline" routerLink="../journal" [queryParams]="{ contexte: 'SQL', niveau: 'debug' }">
                  Voir les requêtes SQL dans le Journal{{ s.applique.sql ? '' : ' (seules les requêtes lentes y figurent tant que le journal SQL est inactif)' }}
                </a>
                @if (verbose()) {
                  <div>
                    <h2 class="text-sm font-semibold">Durée de validité</h2>
                    <p class="mb-2 text-xs text-slate-500">Passé ce délai, le niveau, les réglages par service et le journal SQL reviennent automatiquement aux valeurs par défaut.</p>
                    <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Durée de validité">
                      @for (o of durations; track o.label) {
                        <label class="flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm" [class]="d.duree_min === o.value ? 'border-rni-600 bg-rni-100/40 font-medium' : 'border-slate-200'">
                          <input type="radio" name="duree" class="accent-rni-700" [checked]="d.duree_min === o.value" (change)="store.patch({ duree_min: o.value })" />
                          {{ o.label }}
                        </label>
                      }
                    </div>
                    @if (d.duree_min === null && (d.level === 'debug' || d.level === 'verbose' || d.sql)) {
                      <p class="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800">⚠ Un niveau détaillé permanent augmente fortement le volume des journaux.</p>
                    }
                  </div>
                }
              </section>

              <!-- Seuils et conservation -->
              <section class="card p-3" aria-labelledby="keep-title">
                <h2 id="keep-title" class="mb-2 text-sm font-semibold">Seuils et conservation</h2>
                <div class="grid gap-3 sm:grid-cols-2">
                  <label class="flex flex-col gap-1 text-xs text-slate-500">
                    Requête lente au-delà de (ms)
                    <input class="input" type="number" name="slow" min="50" max="600000" step="50" [ngModel]="d.slow_ms" (ngModelChange)="store.patch({ slow_ms: +$event })" />
                    <span>Signalée en alerte (HTTP et SQL), comptée dans le tableau de bord.</span>
                  </label>
                  <label class="flex flex-col gap-1 text-xs text-slate-500">
                    Conserver en base à partir du niveau
                    <select class="input" name="db_level" [ngModel]="d.db_level" (ngModelChange)="store.patch({ db_level: $event })">
                      @for (l of dbLevels; track l) {
                        <option [value]="l">{{ info[l].label }}</option>
                      }
                    </select>
                    <span>Lignes visibles dans l'onglet Journal ; indépendant du niveau de détail.</span>
                  </label>
                  <label class="flex flex-col gap-1 text-xs text-slate-500">
                    Conservation du journal (jours)
                    <input class="input" type="number" name="retention" min="1" max="3650" [ngModel]="d.retention_days" (ngModelChange)="store.patch({ retention_days: +$event })" />
                  </label>
                  <label class="flex flex-col gap-1 text-xs text-slate-500">
                    Conservation des métriques (jours)
                    <input class="input" type="number" name="metrics" min="1" max="3650" [ngModel]="d.metrics_retention_days" (ngModelChange)="store.patch({ metrics_retention_days: +$event })" />
                  </label>
                </div>
              </section>

              @if (store.errors().length) {
                <ul class="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">
                  @for (e of store.errors(); track e) {
                    <li>✕ {{ e }}</li>
                  }
                </ul>
              }
            </div>

            <!-- Appliqué -->
            <aside class="card h-fit p-3 lg:sticky lg:top-3" aria-labelledby="applied-title">
              <h2 id="applied-title" class="mb-2 text-sm font-semibold">Actuellement appliqué</h2>
              <dl class="flex flex-col gap-2 text-sm">
                <div>
                  <dt class="text-xs text-slate-500">Niveau général</dt>
                  <dd>
                    <span class="font-medium">{{ info[s.applique.level].label }}</span>
                    <span class="font-mono text-xs text-slate-500"> {{ s.applique.level }}</span>
                    <span class="text-xs text-slate-500"> · {{ s.applique.source === 'base' ? 'réglé ici' : 'défaut du serveur' }}</span>
                  </dd>
                </div>
                <div>
                  <dt class="text-xs text-slate-500">Par service</dt>
                  <dd>
                    @for (c of appliedContexts(); track c[0]) {
                      <div class="font-mono text-xs">{{ c[0] }} = {{ c[1] }}</div>
                    } @empty {
                      <span class="text-slate-500">aucun</span>
                    }
                  </dd>
                </div>
                <div>
                  <dt class="text-xs text-slate-500">Requêtes SQL</dt>
                  <dd>{{ s.applique.sql ? '✓ journalisées' : 'non journalisées' }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-slate-500">Seuil de lenteur · conservation en base</dt>
                  <dd>{{ fmtInt(s.applique.slow_ms) }} ms · dès {{ levelLabel(s.applique.db_level) }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-slate-500">Validité</dt>
                  <dd>
                    @if (s.enregistre.expires_at && !s.enregistre.expire) {
                      <span class="chip gap-1 bg-amber-50 px-1.5 py-0 text-xs text-amber-800"><span aria-hidden="true">⏱</span>jusqu'à {{ time(s.enregistre.expires_at) }}</span>
                      <span class="block text-xs text-slate-500">puis retour automatique aux valeurs par défaut</span>
                    } @else {
                      permanent
                    }
                  </dd>
                </div>
                @if (s.derniere_modification; as m) {
                  <div>
                    <dt class="text-xs text-slate-500">Dernière modification</dt>
                    <dd>{{ m.nom ?? m.par }} <span class="text-xs text-slate-500">({{ m.par }}), le {{ fmtDayTime(m.le) }}</span></dd>
                  </div>
                }
              </dl>
              <p class="mt-3 text-xs text-slate-400">
                Valeurs du processus {{ s.applique.pid }} ; les autres instances les appliquent en quelques millisecondes. Chaque modification est tracée dans le journal (contexte Audit).
              </p>
            </aside>
          </div>
        }
      </rni-async-view>
    </div>
  `,
})
export class LogSettingsPage implements HasUnsavedChanges {
  protected readonly store = inject(LogSettingsStore);
  protected readonly levels = LOG_THRESHOLDS;
  protected readonly dbLevels = LOG_DB_THRESHOLDS;
  protected readonly info = LEVEL_INFO;
  protected readonly durations = DURATIONS;
  protected readonly fmtInt = fmtInt;
  protected readonly fmtDayTime = fmtDayTime;
  protected readonly verbose = computed(() => {
    const d = this.store.draft();
    return !!d && isVerbose(d);
  });
  protected readonly appliedContexts = computed(() => Object.entries(this.store.data.data()?.applique.contexts ?? {}));

  constructor() {
    void this.store.load();
  }

  protected levelLabel(l: string): string {
    return (LEVEL_INFO as Record<string, { label: string }>)[l]?.label ?? l;
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  hasUnsavedChanges(): boolean {
    return this.store.dirty();
  }
}
