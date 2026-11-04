import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import type { AppLogDto, AppLogLevel } from '@rni/shared';
import { ErrorPanel } from '../../../shared/ui/error-panel';
import { PageHeader } from '../../../shared/ui/page-header';
import { Spinner } from '../../../shared/ui/spinner';
import { fmtDayTime } from '../format';
import { LOG_LEVEL_OPTIONS, LogLevelBadge } from '../log-level-badge';
import { EMPTY_FILTER, JournalFilter, JournalStore } from './journal.store';

const LEVELS = new Set<string>(LOG_LEVEL_OPTIONS.map((o) => o.value));

/** Journal applicatif conservé en base (toutes instances), avec filtres et suivi en direct. */
@Component({
  selector: 'rni-journal-page',
  imports: [PageHeader, ErrorPanel, Spinner, LogLevelBadge, FormsModule],
  providers: [JournalStore],
  template: `
    <div class="mx-auto flex w-full max-w-7xl flex-col gap-3 p-3 desk:p-4">
      <rni-page-header title="Journal de l'application" subtitle="Toutes instances · du plus récent au plus ancien">
        <ng-container actions>
          <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" class="size-4 accent-rni-700" [checked]="store.live()" (change)="store.setLive($any($event.target).checked)" />
            Suivi en direct
            @if (store.live()) {
              <span class="chip gap-1 bg-green-50 px-1.5 py-0 text-[11px] text-green-800"><span aria-hidden="true">●</span>actif</span>
            }
          </label>
          <button type="button" class="btn-secondary" (click)="store.search()" [disabled]="store.loading()">Actualiser</button>
        </ng-container>
      </rni-page-header>

      <form class="card grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-6" (submit)="$event.preventDefault(); apply()" role="search">
        <label class="flex flex-col gap-1 text-xs text-slate-500">
          Niveau
          <select class="input" name="niveau" [(ngModel)]="draft.niveau" (ngModelChange)="apply()">
            @for (o of levels; track o.value) {
              <option [value]="o.value">{{ o.label }}</option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-xs text-slate-500">
          Contexte
          <select class="input" name="contexte" [(ngModel)]="draft.contexte" (ngModelChange)="apply()">
            <option value="">Tous</option>
            @for (c of store.contextes(); track c.contexte) {
              <option [value]="c.contexte">{{ c.contexte }} ({{ c.nb }})</option>
            }
            @if (draft.contexte && !hasContext(draft.contexte)) {
              <option [value]="draft.contexte">{{ draft.contexte }}</option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-xs text-slate-500 lg:col-span-2">
          Texte du message
          <input class="input" name="q" type="search" [(ngModel)]="draft.q" placeholder="ex. planning 1064, délai dépassé…" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-slate-500">
          Nigend
          <input class="input" name="nigend" [(ngModel)]="draft.nigend" maxlength="8" inputmode="numeric" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-slate-500">
          Identifiant de requête
          <input class="input font-mono text-xs" name="request_id" [(ngModel)]="draft.request_id" />
        </label>
        <div class="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
          <button type="submit" class="btn-primary">Rechercher</button>
          <button type="button" class="btn-ghost" (click)="reset()">Effacer les filtres</button>
          <span class="ml-auto text-xs text-slate-500">{{ store.items().length }} ligne(s) affichée(s){{ store.next() != null ? ', d’autres plus anciennes' : '' }}</span>
        </div>
      </form>

      <rni-error-panel [error]="store.error()" [retryable]="true" (retry)="store.search()" />

      <div class="card overflow-hidden">
        @if (store.loading() && !store.items().length) {
          <div class="flex justify-center p-8"><rni-spinner /></div>
        }
        <ul class="divide-y divide-slate-100 font-mono text-xs" aria-live="polite">
          @for (l of store.items(); track l.id_log) {
            <li [class.bg-amber-50]="store.fresh().has(l.id_log)" class="transition-colors">
              <button type="button" class="grid w-full grid-cols-[auto_auto_1fr] items-start gap-x-2 px-3 py-1.5 text-left hover:bg-slate-50 desk:grid-cols-[9.5rem_auto_11rem_1fr]" (click)="toggle(l)" [attr.aria-expanded]="open() === l.id_log">
                <span class="tabular-nums text-slate-500">{{ fmtDayTime(l.horodatage) }}</span>
                <rni-log-level-badge [level]="l.niveau" />
                <span class="col-span-3 truncate text-slate-500 desk:col-span-1" [title]="l.contexte ?? ''">{{ l.contexte }}</span>
                <span class="col-span-3 break-words whitespace-pre-wrap text-slate-800 desk:col-span-1" [class.line-clamp-2]="open() !== l.id_log">{{ l.message }}</span>
              </button>
              @if (open() === l.id_log) {
                <div class="space-y-2 bg-slate-50 px-3 pb-3">
                  <div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    <span>n° {{ l.id_log }}</span>
                    <span>{{ l.hote }} · pid {{ l.pid }}</span>
                    @if (l.nigend) {
                      <button type="button" class="text-rni-700 hover:underline" (click)="filterBy('nigend', l.nigend)">nigend {{ l.nigend }}</button>
                    }
                    @if (l.request_id) {
                      <button type="button" class="text-rni-700 hover:underline" (click)="filterBy('request_id', l.request_id)">toute la requête {{ l.request_id }}</button>
                    }
                    @if (l.contexte) {
                      <button type="button" class="text-rni-700 hover:underline" (click)="filterBy('contexte', l.contexte)">contexte {{ l.contexte }}</button>
                    }
                  </div>
                  @if (l.pile) {
                    <pre class="max-h-72 overflow-auto rounded border border-slate-200 bg-white p-2 text-[11px] leading-snug text-red-900">{{ l.pile }}</pre>
                  }
                </div>
              }
            </li>
          } @empty {
            @if (!store.loading()) {
              <li class="px-3 py-8 text-center font-sans text-sm text-slate-500">Aucune ligne ne correspond à ces critères.</li>
            }
          }
        </ul>
        @if (store.next() != null) {
          <div class="border-t border-slate-100 p-2 text-center">
            <button type="button" class="btn-secondary" (click)="store.more()" [disabled]="store.loadingMore()">
              {{ store.loadingMore() ? 'Chargement…' : 'Lignes plus anciennes' }}
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class JournalPage {
  protected readonly store = inject(JournalStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly levels = LOG_LEVEL_OPTIONS;
  protected readonly fmtDayTime = fmtDayTime;
  protected readonly open = signal<number | null>(null);
  /** Valeurs des champs (appliquées par « Rechercher » ou au changement des listes). */
  protected draft: JournalFilter = { ...EMPTY_FILTER };

  constructor() {
    const q = this.route.snapshot.queryParamMap;
    const niveau = q.get('niveau');
    this.draft = {
      niveau: niveau && LEVELS.has(niveau) ? (niveau as AppLogLevel) : EMPTY_FILTER.niveau,
      contexte: q.get('contexte') ?? '',
      q: q.get('q') ?? '',
      request_id: q.get('request_id') ?? '',
      nigend: q.get('nigend') ?? '',
    };
    // Recherche d'une requête précise : tous les niveaux
    if (this.draft.request_id && !niveau) this.draft.niveau = 'debug';
    void this.store.search({ ...this.draft });
  }

  protected hasContext(c: string): boolean {
    return this.store.contextes().some((x) => x.contexte === c);
  }

  protected apply(): void {
    const f = { ...this.draft };
    void this.store.search(f);
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        niveau: f.niveau === EMPTY_FILTER.niveau ? null : f.niveau,
        contexte: f.contexte || null,
        q: f.q.trim() || null,
        request_id: f.request_id.trim() || null,
        nigend: f.nigend.trim() || null,
      },
    });
  }

  protected reset(): void {
    this.draft = { ...EMPTY_FILTER };
    this.apply();
  }

  protected filterBy(key: 'nigend' | 'request_id' | 'contexte', value: string): void {
    this.draft = { ...this.draft, [key]: value, ...(key === 'request_id' ? { niveau: 'debug' as AppLogLevel } : {}) };
    this.open.set(null);
    this.apply();
  }

  protected toggle(l: AppLogDto): void {
    this.open.set(this.open() === l.id_log ? null : l.id_log);
  }
}
