import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AdminDashboardDto } from '@rni/shared';
import { AsyncView } from '../../../shared/ui/async-view';
import { ErrorPanel } from '../../../shared/ui/error-panel';
import { PageHeader } from '../../../shared/ui/page-header';
import { fmtAgo, fmtCount, fmtDayTime, fmtDec, fmtDuration, fmtHour, fmtInt, fmtMs, fmtPct, fmtTime } from '../format';
import { LogLevelBadge } from '../log-level-badge';
import { DashboardStore } from './dashboard.store';
import { StatTile, TileTone } from './stat-tile';
import { ChartPoint, TimeChart } from './time-chart';

type Kpis = AdminDashboardDto['kpis'];

/** Seuils d'appréciation des indicateurs (pastille d'état des tuiles). */
export function latencyTone(ms: number | null): { tone: TileTone; status: string } {
  if (ms == null) return { tone: 'neutral', status: '' };
  if (ms >= 1000) return { tone: 'critical', status: 'Lent' };
  if (ms >= 300) return { tone: 'warning', status: 'À surveiller' };
  return { tone: 'good', status: 'Normal' };
}

export function errorsTone(n: number): { tone: TileTone; status: string } {
  return n > 0 ? { tone: 'critical', status: 'À examiner' } : { tone: 'good', status: 'Aucune' };
}

export function availabilityTone(pct: number | null): { tone: TileTone; status: string } {
  if (pct == null) return { tone: 'neutral', status: '' };
  if (pct < 99) return { tone: 'critical', status: 'Dégradée' };
  if (pct < 99.9) return { tone: 'warning', status: 'À surveiller' };
  return { tone: 'good', status: 'Normale' };
}

/**
 * Tableau de bord d'administration (super administrateur) : activité et performances de toutes les
 * instances de l'API, erreurs, utilisateurs connectés, indicateurs métier, état du système.
 */
@Component({
  selector: 'rni-dashboard-page',
  imports: [PageHeader, AsyncView, ErrorPanel, StatTile, TimeChart, LogLevelBadge, RouterLink],
  providers: [DashboardStore],
  template: `
    <div class="mx-auto flex w-full max-w-7xl flex-col gap-3 p-3 desk:p-4">
      <rni-page-header title="Tableau de bord" [subtitle]="subtitle()">
        <ng-container actions>
          <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" class="size-4 accent-rni-700" [checked]="store.auto()" (change)="store.setAuto($any($event.target).checked)" />
            Actualisation automatique (30 s)
          </label>
          <button type="button" class="btn-secondary" (click)="store.refresh()" [disabled]="store.data.loading()">
            {{ store.data.loading() ? 'Actualisation…' : 'Actualiser' }}
          </button>
        </ng-container>
      </rni-page-header>

      @if (store.data.data() && store.data.error()) {
        <rni-error-panel [error]="store.data.error()" [retryable]="true" (retry)="store.refresh()" />
      }

      <rni-async-view [loading]="store.data.loading()" [pending]="store.data.pending()" [error]="store.data.data() ? null : store.data.error()" (retry)="store.refresh()">
        @if (store.data.data(); as d) {
          <div class="flex flex-col gap-3">
          <!-- Indicateurs clés -->
          <section class="grid grid-cols-2 gap-3 desk:grid-cols-4" aria-label="Indicateurs clés">
            <rni-stat-tile label="Utilisateurs connectés" testId="kpi-connectes" [value]="fmtInt(d.kpis.connectes)" [hint]="'Actifs depuis moins de ' + d.fenetre_connexion_min + ' min · ' + fmtInt(d.kpis.utilisateurs_jour) + ' aujourd’hui'" />
            <rni-stat-tile label="Requêtes aujourd'hui" testId="kpi-requetes" [value]="fmtCount(d.kpis.requetes_jour)" [hint]="fmtDec(d.kpis.requetes_par_minute) + ' par minute (5 dernières min)'" />
            <rni-stat-tile
              label="Temps moyen par requête"
              testId="kpi-temps"
              [value]="fmtMs(d.kpis.temps_moyen_jour_ms)"
              [hint]="'Dernière heure : ' + fmtMs(d.kpis.temps_moyen_heure_ms) + ' · 95 % < ' + (d.kpis.p95_jour_ms ? fmtMs(d.kpis.p95_jour_ms) : '3 s+')"
              [tone]="latency().tone"
              [status]="latency().status"
            />
            <rni-stat-tile
              label="Erreurs du jour"
              testId="kpi-erreurs"
              [value]="fmtInt(d.kpis.erreurs_jour)"
              [hint]="fmtInt(d.kpis.erreurs_5xx_jour) + ' réponse(s) 5xx · ' + fmtInt(d.kpis.avertissements_jour) + ' alerte(s)'"
              [tone]="errors().tone"
              [status]="errors().status"
            />
            <rni-stat-tile
              label="Disponibilité du jour"
              [value]="fmtPct(d.kpis.disponibilite_jour)"
              hint="Part des requêtes sans erreur serveur"
              [tone]="availability().tone"
              [status]="availability().status"
            />
            <rni-stat-tile label="Requêtes lentes" [value]="fmtInt(d.kpis.lentes_jour)" [hint]="'Plus de ' + fmtMs(d.kpis.seuil_lent_ms) + ' (rni.log.slow_ms)'" [tone]="d.kpis.lentes_jour ? 'warning' : 'neutral'" [status]="d.kpis.lentes_jour ? 'À surveiller' : ''" />
            <rni-stat-tile label="Refus et requêtes invalides" [value]="fmtInt(d.kpis.refus_jour)" hint="Réponses 4xx (droits, saisie, introuvable)" />
            <rni-stat-tile label="Plannings saisis aujourd'hui" [value]="fmtInt(d.metier.plannings_crees_jour)" [hint]="fmtInt(d.metier.plannings_modifies_jour) + ' plage(s) existante(s) modifiée(s)'" />
          </section>

          <!-- Activité sur 24 h -->
          <section class="grid gap-3 desk:grid-cols-2">
            <div class="card p-3">
              <h2 class="text-sm font-semibold">Requêtes par heure</h2>
              <p class="mb-2 text-xs text-slate-500">24 dernières heures, toutes instances</p>
              <rni-time-chart [points]="requestPoints()" kind="columns" ariaLabel="Nombre de requêtes par heure sur 24 heures" [format]="fmtCount" />
            </div>
            <div class="card p-3">
              <h2 class="text-sm font-semibold">Temps de réponse moyen par heure</h2>
              <p class="mb-2 text-xs text-slate-500">En millisecondes ; survolez pour le maximum de l'heure</p>
              <rni-time-chart [points]="latencyPoints()" kind="line" ariaLabel="Temps de réponse moyen par heure sur 24 heures" [format]="fmtMs" />
            </div>
          </section>
          <div class="-mt-1 flex justify-end">
            <button type="button" class="btn-ghost text-xs" (click)="showTable.set(!showTable())" [attr.aria-expanded]="showTable()">
              {{ showTable() ? 'Masquer le tableau horaire' : 'Afficher le tableau horaire' }}
            </button>
          </div>
          @if (showTable()) {
            <div class="card overflow-x-auto">
              <table class="w-full text-xs tabular-nums">
                <thead class="bg-slate-50 text-left text-slate-500">
                  <tr><th class="px-3 py-1.5">Heure</th><th class="px-3 py-1.5 text-right">Requêtes</th><th class="px-3 py-1.5 text-right">4xx</th><th class="px-3 py-1.5 text-right">5xx</th><th class="px-3 py-1.5 text-right">Moyenne</th><th class="px-3 py-1.5 text-right">Maximum</th></tr>
                </thead>
                <tbody>
                  @for (h of d.heures; track h.heure) {
                    <tr class="border-t border-slate-100">
                      <td class="px-3 py-1">{{ fmtHour(h.heure) }}</td>
                      <td class="px-3 py-1 text-right">{{ fmtInt(h.nb) }}</td>
                      <td class="px-3 py-1 text-right">{{ fmtInt(h.nb_4xx) }}</td>
                      <td class="px-3 py-1 text-right">{{ fmtInt(h.nb_5xx) }}</td>
                      <td class="px-3 py-1 text-right">{{ fmtMs(h.moyenne_ms) }}</td>
                      <td class="px-3 py-1 text-right">{{ h.nb ? fmtMs(h.max_ms) : '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

          <section class="grid gap-3 desk:grid-cols-5">
            <!-- Utilisateurs connectés -->
            <div class="card overflow-hidden desk:col-span-3">
              <div class="flex items-baseline justify-between px-3 pt-3">
                <h2 class="text-sm font-semibold">Utilisateurs connectés ({{ d.connectes.length }})</h2>
                <span class="text-xs text-slate-500">Activité depuis moins de {{ d.fenetre_connexion_min }} min</span>
              </div>
              <div class="max-h-80 overflow-auto">
                <table class="mt-2 w-full text-sm">
                  <thead class="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
                    <tr><th class="px-3 py-1.5">Personnel</th><th class="hidden px-3 py-1.5 sm:table-cell">Profil · région</th><th class="px-3 py-1.5">Dernière activité</th><th class="px-3 py-1.5 text-right">Requêtes</th></tr>
                  </thead>
                  <tbody>
                    @for (u of d.connectes; track u.nigend) {
                      <tr class="border-t border-slate-100 align-top">
                        <td class="px-3 py-1.5">
                          <div class="font-medium">{{ u.grade }} {{ u.nom ?? '(compte inconnu)' }} {{ u.prenom }}</div>
                          <div class="text-xs text-slate-500">{{ u.nigend }}<span class="sm:hidden"> · {{ u.libelle_profil ?? '—' }} · {{ u.libelle_region ?? '—' }}</span></div>
                        </td>
                        <td class="hidden px-3 py-1.5 text-xs text-slate-600 sm:table-cell">{{ u.libelle_profil ?? '—' }}<br />{{ u.libelle_region ?? '—' }}</td>
                        <td class="px-3 py-1.5 text-xs">
                          <div [title]="fmtDayTime(u.derniere_activite)">{{ fmtAgo(u.derniere_activite, now()) }}</div>
                          <div class="max-w-32 truncate font-mono text-[11px] text-slate-500 sm:max-w-56" [title]="u.derniere_route ?? ''">{{ u.derniere_route }}</div>
                        </td>
                        <td class="px-3 py-1.5 text-right tabular-nums">{{ fmtInt(u.nb_requetes_jour) }}</td>
                      </tr>
                    } @empty {
                      <tr><td colspan="4" class="px-3 py-6 text-center text-sm text-slate-500">Aucun utilisateur actif en ce moment.</td></tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Dernières erreurs -->
            <div class="card flex flex-col desk:col-span-2">
              <div class="flex items-baseline justify-between px-3 pt-3">
                <h2 class="text-sm font-semibold">Dernières erreurs</h2>
                <a routerLink="../journal" [queryParams]="{ niveau: 'warn' }" class="text-xs text-rni-700 hover:underline">Ouvrir le journal →</a>
              </div>
              <ul class="mt-2 max-h-80 divide-y divide-slate-100 overflow-auto">
                @for (e of d.dernieres_erreurs; track e.id_log) {
                  <li class="px-3 py-2">
                    <div class="flex items-center gap-2 text-xs text-slate-500">
                      <rni-log-level-badge [level]="e.niveau" />
                      <span class="tabular-nums" [title]="fmtDayTime(e.horodatage)">{{ fmtAgo(e.horodatage, now()) }}</span>
                      <span class="truncate font-mono">{{ e.contexte }}</span>
                    </div>
                    <p class="mt-0.5 line-clamp-2 break-words text-sm text-slate-800" [title]="e.message">{{ e.message }}</p>
                    @if (e.request_id) {
                      <a routerLink="../journal" [queryParams]="{ request_id: e.request_id }" class="text-xs text-rni-700 hover:underline">Voir la requête</a>
                    }
                  </li>
                } @empty {
                  <li class="px-3 py-6 text-center text-sm text-slate-500">Aucune erreur enregistrée.</li>
                }
              </ul>
            </div>
          </section>

          <!-- Routes -->
          <section class="card overflow-hidden">
            <div class="px-3 pt-3">
              <h2 class="text-sm font-semibold">Routes les plus coûteuses aujourd'hui</h2>
              <p class="text-xs text-slate-500">Classées par temps cumulé : là où l'optimisation rapporte le plus</p>
            </div>
            <div class="overflow-x-auto">
              <table class="mt-2 w-full whitespace-nowrap text-sm">
                <thead class="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th class="px-3 py-1.5">Route</th><th class="px-3 py-1.5 text-right">Requêtes</th><th class="px-3 py-1.5 text-right">Moyenne</th>
                    <th class="px-3 py-1.5 text-right">95 %</th><th class="px-3 py-1.5 text-right">Maximum</th><th class="px-3 py-1.5 text-right">5xx</th><th class="w-40 px-3 py-1.5">Part du temps</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of d.routes; track r.methode + r.route) {
                    <tr class="border-t border-slate-100">
                      <td class="px-3 py-1.5 font-mono text-xs"><span class="mr-1 font-semibold text-slate-500">{{ r.methode }}</span>{{ r.route }}</td>
                      <td class="px-3 py-1.5 text-right tabular-nums">{{ fmtInt(r.nb) }}</td>
                      <td class="px-3 py-1.5 text-right tabular-nums">{{ fmtMs(r.moyenne_ms) }}</td>
                      <td class="px-3 py-1.5 text-right tabular-nums">{{ r.p95_ms ? '< ' + fmtMs(r.p95_ms) : '≥ 3 s' }}</td>
                      <td class="px-3 py-1.5 text-right tabular-nums">{{ fmtMs(r.max_ms) }}</td>
                      <td class="px-3 py-1.5 text-right tabular-nums" [class.font-semibold]="r.nb_5xx" [class.text-red-700]="r.nb_5xx">{{ fmtInt(r.nb_5xx) }}</td>
                      <td class="px-3 py-1.5">
                        <div class="flex items-center gap-2">
                          <div class="h-1.5 flex-1 rounded-full bg-rni-100"><div class="h-1.5 rounded-full bg-rni-600" [style.width.%]="r.part_temps"></div></div>
                          <span class="w-12 text-right text-xs tabular-nums text-slate-600">{{ fmtPct(r.part_temps) }}</span>
                        </div>
                      </td>
                    </tr>
                  } @empty {
                    <tr><td colspan="7" class="px-3 py-6 text-center text-sm text-slate-500">Aucune requête enregistrée aujourd'hui.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </section>

          <section class="grid gap-3 desk:grid-cols-2">
            <!-- Métier -->
            <div class="card p-3">
              <h2 class="mb-2 text-sm font-semibold">Activité métier</h2>
              <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt class="text-slate-500">Comptes actifs</dt><dd class="text-right font-medium tabular-nums">{{ fmtInt(d.metier.comptes_actifs) }}</dd>
                <dt class="text-slate-500">Fiches de crise ouvertes</dt><dd class="text-right font-medium tabular-nums">{{ fmtInt(d.metier.fiches_ouvertes) }}</dd>
                <dt class="text-slate-500">Fiches créées aujourd'hui</dt><dd class="text-right font-medium tabular-nums">{{ fmtInt(d.metier.fiches_creees_jour) }}</dd>
                <dt class="text-slate-500">Plages modifiées aujourd'hui</dt><dd class="text-right font-medium tabular-nums">{{ fmtInt(d.metier.plannings_modifies_jour) }}</dd>
              </dl>
              <h3 class="mt-3 mb-1 text-xs font-semibold text-slate-500">Comptes par profil</h3>
              <ul class="space-y-1">
                @for (p of d.metier.comptes_par_profil; track p.libelle) {
                  <li class="flex items-center gap-2 text-sm">
                    <span class="w-40 shrink-0 truncate text-slate-600" [title]="p.libelle">{{ p.libelle }}</span>
                    <div class="h-1.5 flex-1 rounded-full bg-rni-100"><div class="h-1.5 rounded-full bg-rni-600" [style.width.%]="(p.nb / maxProfil()) * 100"></div></div>
                    <span class="w-12 text-right tabular-nums">{{ fmtInt(p.nb) }}</span>
                  </li>
                }
              </ul>
            </div>

            <!-- Système -->
            <div class="card p-3">
              <h2 class="mb-2 text-sm font-semibold">Système</h2>
              <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt class="text-slate-500">Version</dt><dd class="text-right">RNI API {{ d.systeme.version }} · {{ d.systeme.environnement }} · Node {{ d.systeme.node }}</dd>
                <dt class="text-slate-500">Processus</dt>
                <dd class="text-right">{{ d.systeme.workers }} worker(s) · pid {{ d.systeme.pid }} sur {{ d.systeme.hote }} · démarré {{ fmtDuration(d.systeme.demarre_le, now()) }}</dd>
                <dt class="text-slate-500">Mémoire</dt><dd class="text-right tabular-nums">{{ d.systeme.memoire_mo.rss }} Mo (tas {{ d.systeme.memoire_mo.tas }} Mo)</dd>
                <dt class="text-slate-500">Cache</dt>
                <dd class="text-right">
                  {{ fmtInt(d.systeme.cache.entrees) }} entrée(s), {{ fmtDec(d.systeme.cache.taille_mo) }} Mo · {{ fmtPct(d.systeme.cache.taux_succes * 100) }} de succès ·
                  <span [class]="d.systeme.cache.ecoute ? 'text-green-700' : 'text-red-700'">{{ d.systeme.cache.ecoute ? '✓ invalidation partagée active' : '✕ invalidation partagée inactive' }}</span>
                </dd>
                <dt class="text-slate-500">Journalisation</dt>
                <dd class="text-right">
                  niveau <span class="font-mono">{{ d.systeme.journalisation.niveau }}</span> ({{ d.systeme.journalisation.source }}) · en base dès
                  <span class="font-mono">{{ d.systeme.journalisation.niveau_base }}</span>{{ d.systeme.journalisation.sql ? ' · SQL actif' : '' }}
                  @if (contextLevels(); as c) {
                    · <span class="font-mono text-xs">{{ c }}</span>
                  }
                </dd>
                <dt class="text-slate-500">Base de données</dt>
                <dd class="text-right">
                  {{ d.systeme.base.nom }} · {{ fmtDec(d.systeme.base.taille_mo) }} Mo · {{ d.systeme.base.connexions_api }} connexion(s) API · PostgreSQL {{ d.systeme.base.version }}
                </dd>
                <dt class="text-slate-500">Schéma</dt><dd class="text-right font-mono text-xs">{{ d.systeme.base.migration ?? 'migrations non suivies' }}</dd>
                <dt class="text-slate-500">Journal en base</dt>
                <dd class="text-right">≈ {{ fmtCount(d.systeme.journal.lignes) }} ligne(s){{ d.systeme.journal.plus_ancien ? ', depuis le ' + fmtDayTime(d.systeme.journal.plus_ancien) : '' }}</dd>
              </dl>
              <p class="mt-2 text-xs text-slate-400">Mémoire et cache : processus qui a répondu. Les autres indicateurs couvrent toutes les instances.</p>
            </div>
          </section>
          </div>
        }
      </rni-async-view>
    </div>
  `,
})
export class DashboardPage {
  protected readonly store = inject(DashboardStore);
  protected readonly showTable = signal(false);
  protected readonly now = signal(Date.now());

  protected readonly fmtInt = fmtInt;
  protected readonly fmtCount = fmtCount;
  protected readonly fmtDec = fmtDec;
  protected readonly fmtMs = fmtMs;
  protected readonly fmtPct = fmtPct;
  protected readonly fmtAgo = fmtAgo;
  protected readonly fmtDayTime = fmtDayTime;
  protected readonly fmtHour = fmtHour;
  protected readonly fmtDuration = fmtDuration;

  private readonly kpis = computed<Kpis | null>(() => this.store.data.data()?.kpis ?? null);
  protected readonly latency = computed(() => latencyTone(this.kpis()?.temps_moyen_jour_ms ?? null));
  protected readonly errors = computed(() => errorsTone(this.kpis()?.erreurs_jour ?? 0));
  protected readonly availability = computed(() => availabilityTone(this.kpis()?.disponibilite_jour ?? null));

  protected readonly subtitle = computed(() => {
    const at = this.store.updatedAt();
    return `Toutes instances de l'API${at ? ` · mis à jour à ${fmtTime(at.toISOString())}` : ''}`;
  });

  protected readonly requestPoints = computed<ChartPoint[]>(() =>
    (this.store.data.data()?.heures ?? []).map((h) => ({
      label: fmtHour(h.heure),
      value: h.nb,
      details: [`Requêtes : ${fmtInt(h.nb)}`, `Refus / invalides (4xx) : ${fmtInt(h.nb_4xx)}`, `Erreurs serveur (5xx) : ${fmtInt(h.nb_5xx)}`],
    })),
  );

  protected readonly latencyPoints = computed<ChartPoint[]>(() =>
    (this.store.data.data()?.heures ?? []).map((h) => ({
      label: fmtHour(h.heure),
      value: h.moyenne_ms,
      details: h.nb ? [`Moyenne : ${fmtMs(h.moyenne_ms)}`, `Maximum : ${fmtMs(h.max_ms)}`, `${fmtInt(h.nb)} requête(s)`] : ['Aucune requête'],
    })),
  );

  protected readonly maxProfil = computed(() => Math.max(1, ...(this.store.data.data()?.metier.comptes_par_profil ?? []).map((p) => p.nb)));
  protected readonly contextLevels = computed(() =>
    Object.entries(this.store.data.data()?.systeme.journalisation.contextes ?? {})
      .map(([c, l]) => `${c}=${l}`)
      .join(', '),
  );

  constructor() {
    this.store.start();
    // Durées relatives (« il y a 2 min ») tenues à jour entre deux actualisations
    const t = setInterval(() => this.now.set(Date.now()), 15_000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }
}
