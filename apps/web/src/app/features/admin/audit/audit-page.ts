import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { AuditLineDto, AuditQuery, AuditStatutFiltre } from '@rni/shared';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../../core/api/admin.api';
import { AppError, toAppError } from '../../../core/errors/app-error';
import { ErrorPanel } from '../../../shared/ui/error-panel';
import { PageHeader } from '../../../shared/ui/page-header';
import { Spinner } from '../../../shared/ui/spinner';
import { fmtDayTime, fmtInt, fmtMs } from '../format';

interface AuditFilter {
  nigend: string;
  route: string;
  methode: string;
  statut: AuditStatutFiltre;
  non_authentifie: boolean;
  request_id: string;
  ip: string;
  du: string;
  au: string;
}

const EMPTY: AuditFilter = { nigend: '', route: '', methode: '', statut: '', non_authentifie: false, request_id: '', ip: '', du: '', au: '' };
const PAGE = 100;
const TEXT_KEYS = ['nigend', 'route', 'methode', 'statut', 'request_id', 'ip', 'du', 'au'] as const;

/**
 * Administration › Audit des requêtes : une ligne par requête métier (table `t_admin_log_splunk`,
 * exportée vers Splunk), refus compris. Qui a appelé quoi, quand, d'où et avec quel résultat.
 */
@Component({
  selector: 'rni-audit-page',
  imports: [FormsModule, RouterLink, PageHeader, ErrorPanel, Spinner],
  template: `
    <div class="mx-auto flex w-full max-w-7xl flex-col gap-3 p-3 desk:p-4">
      <rni-page-header title="Audit des requêtes" subtitle="Requêtes métier et refus d'accès, du plus récent au plus ancien (données exportées vers Splunk)">
        <ng-container actions>
          <button type="button" class="btn-secondary" (click)="exportCsv()" [disabled]="!items().length">⤓ CSV ({{ items().length }})</button>
          <button type="button" class="btn-secondary" (click)="search()" [disabled]="loading()">Actualiser</button>
        </ng-container>
      </rni-page-header>

      <form class="card grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-6" (submit)="$event.preventDefault(); apply()" role="search">
        <label class="flex flex-col gap-1 text-xs text-slate-500">
          Nigend
          <input class="input" name="nigend" [(ngModel)]="draft.nigend" maxlength="8" inputmode="numeric" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-slate-500 lg:col-span-2">
          Route contient
          <input class="input" name="route" type="search" [(ngModel)]="draft.route" placeholder="ex. formulaire, /users/, planning/insert" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-slate-500">
          Méthode
          <select class="input" name="methode" [(ngModel)]="draft.methode" (ngModelChange)="apply()">
            <option value="">Toutes</option>
            @for (m of methodes; track m) {
              <option [value]="m">{{ m }}</option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-xs text-slate-500">
          Résultat
          <select class="input" name="statut" [(ngModel)]="draft.statut" (ngModelChange)="apply()">
            @for (s of statuts; track s.v) {
              <option [value]="s.v">{{ s.l }}</option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-xs text-slate-500">
          Adresse IP
          <input class="input" name="ip" [(ngModel)]="draft.ip" maxlength="64" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-slate-500">
          Du
          <input class="input" type="date" name="du" [(ngModel)]="draft.du" (ngModelChange)="apply()" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-slate-500">
          Au
          <input class="input" type="date" name="au" [(ngModel)]="draft.au" (ngModelChange)="apply()" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-slate-500 lg:col-span-2">
          Identifiant de requête
          <input class="input font-mono text-xs" name="request_id" [(ngModel)]="draft.request_id" />
        </label>
        <label class="flex items-end gap-2 pb-2 text-sm text-slate-600 lg:col-span-2">
          <input type="checkbox" class="size-4 accent-rni-700" name="non_authentifie" [(ngModel)]="draft.non_authentifie" (ngModelChange)="apply()" />
          Seulement les requêtes refusées avant authentification
        </label>
        <div class="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
          <button type="submit" class="btn-primary">Rechercher</button>
          <button type="button" class="btn-ghost" (click)="reset()">Effacer les filtres</button>
          <span class="ml-auto text-xs text-slate-500">{{ items().length }} requête(s) affichée(s){{ next() != null ? ', d’autres plus anciennes' : '' }}</span>
        </div>
      </form>

      <rni-error-panel [error]="error()" [retryable]="true" (retry)="search()" />

      <div class="card overflow-x-auto">
        @if (loading() && !items().length) {
          <div class="flex justify-center p-8"><rni-spinner /></div>
        }
        <table class="w-full text-xs">
          <thead class="bg-slate-50 text-left text-[11px] text-slate-500 uppercase">
            <tr>
              <th class="px-3 py-2">Date</th>
              <th class="px-3 py-2">Utilisateur</th>
              <th class="px-3 py-2">Requête</th>
              <th class="px-3 py-2">Résultat</th>
              <th class="px-3 py-2 text-right">Durée</th>
              <th class="hidden px-3 py-2 desk:table-cell">IP</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (l of items(); track l.id_log) {
              <tr class="cursor-pointer hover:bg-slate-50" (click)="toggle(l)" [attr.aria-expanded]="open() === l.id_log">
                <td class="px-3 py-1.5 whitespace-nowrap tabular-nums text-slate-600">{{ fmtDayTime(l.horodatage) }}</td>
                <td class="px-3 py-1.5 whitespace-nowrap">
                  <span class="font-medium">{{ l.rio_user ?? '—' }}</span>
                  @if (l.role) {
                    <span class="block text-[11px] text-slate-500">{{ l.role }}{{ l.code_unite ? ' · ' + l.code_unite : '' }}</span>
                  } @else if (l.authentifie === false) {
                    <span class="block text-[11px] text-red-700">non authentifié</span>
                  }
                </td>
                <td class="max-w-md px-3 py-1.5 font-mono">
                  <span class="mr-1 font-semibold" [class]="methodClass(l.methode)">{{ l.methode }}</span><span class="break-all">{{ l.route }}</span>
                </td>
                <td class="px-3 py-1.5"><span class="chip" [class]="statusClass(l.statut)">{{ l.statut ?? '—' }} {{ statusLabel(l.statut) }}</span></td>
                <td class="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{{ fmtMs(l.duree_ms) }}</td>
                <td class="hidden px-3 py-1.5 font-mono desk:table-cell">{{ l.ip ?? '—' }}</td>
              </tr>
              @if (open() === l.id_log) {
                <tr class="bg-slate-50">
                  <td colspan="6" class="px-3 pb-3">
                    <dl class="grid gap-x-6 gap-y-1 pt-1 text-[11px] text-slate-600 sm:grid-cols-2 desk:grid-cols-3">
                      <div><dt class="inline font-medium">N° :</dt> <dd class="inline">{{ l.id_log }}</dd></div>
                      <div><dt class="inline font-medium">Taille de la réponse :</dt> <dd class="inline">{{ l.taille_reponse != null ? fmtInt(l.taille_reponse) + ' o' : '—' }}</dd></div>
                      <div><dt class="inline font-medium">Serveur :</dt> <dd class="inline">{{ l.hote ?? '—' }} · pid {{ l.pid ?? '—' }}</dd></div>
                      <div class="sm:col-span-2 desk:col-span-3"><dt class="inline font-medium">Navigateur :</dt> <dd class="inline break-all">{{ l.user_agent ?? '—' }}</dd></div>
                    </dl>
                    <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                      @if (l.request_id) {
                        <a class="text-rni-700 hover:underline" routerLink="../journal" [queryParams]="{ request_id: l.request_id }">Journal de cette requête</a>
                      }
                      @if (l.rio_user) {
                        <button type="button" class="text-rni-700 hover:underline" (click)="filterBy('nigend', l.rio_user)">Toutes les requêtes de {{ l.rio_user }}</button>
                      }
                      @if (l.ip) {
                        <button type="button" class="text-rni-700 hover:underline" (click)="filterBy('ip', l.ip)">Toutes les requêtes de {{ l.ip }}</button>
                      }
                    </div>
                  </td>
                </tr>
              }
            } @empty {
              @if (!loading()) {
                <tr><td colspan="6" class="px-3 py-8 text-center text-sm text-slate-500">Aucune requête ne correspond à ces critères.</td></tr>
              }
            }
          </tbody>
        </table>
        @if (next() != null) {
          <div class="border-t border-slate-100 p-2 text-center">
            <button type="button" class="btn-secondary" (click)="more()" [disabled]="loadingMore()">{{ loadingMore() ? 'Chargement…' : 'Requêtes plus anciennes' }}</button>
          </div>
        }
      </div>
    </div>
  `,
})
export class AuditPage {
  private readonly api = inject(AdminApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly fmtDayTime = fmtDayTime;
  protected readonly fmtMs = fmtMs;
  protected readonly fmtInt = fmtInt;
  protected readonly methodes = ['GET', 'POST', 'PUT', 'DELETE'];
  protected readonly statuts: { v: AuditStatutFiltre; l: string }[] = [
    { v: '', l: 'Tous' },
    { v: '2xx', l: 'Succès (2xx)' },
    { v: '4xx', l: 'Refus / invalides (4xx)' },
    { v: 'refus', l: 'Accès refusés (401 / 403)' },
    { v: '404', l: 'Introuvables (404)' },
    { v: '5xx', l: 'Erreurs serveur (5xx)' },
  ];

  protected readonly items = signal<AuditLineDto[]>([]);
  protected readonly next = signal<number | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal<AppError | null>(null);
  protected readonly open = signal<number | null>(null);
  protected draft: AuditFilter = { ...EMPTY };
  private applied: AuditFilter = { ...EMPTY };
  private seq = 0;

  constructor() {
    const q = this.route.snapshot.queryParamMap;
    for (const k of TEXT_KEYS) (this.draft as unknown as Record<string, string>)[k] = q.get(k) ?? '';
    this.draft.non_authentifie = q.get('non_authentifie') === 'true';
    void this.search();
  }

  private query(f: AuditFilter, avant?: number): AuditQuery {
    return {
      nigend: f.nigend.trim() || undefined,
      route: f.route.trim() || undefined,
      methode: f.methode || undefined,
      statut: f.statut || undefined,
      non_authentifie: f.non_authentifie || undefined,
      request_id: f.request_id.trim() || undefined,
      ip: f.ip.trim() || undefined,
      du: f.du || undefined,
      au: f.au || undefined,
      avant,
      limite: PAGE,
    };
  }

  async search(): Promise<void> {
    this.applied = { ...this.draft };
    const id = ++this.seq;
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await firstValueFrom(this.api.audit(this.query(this.applied), { silent: true }));
      if (id !== this.seq) return;
      this.items.set(page.items);
      this.next.set(page.suivant);
      this.open.set(null);
    } catch (e) {
      if (id === this.seq) this.error.set(toAppError(e));
    } finally {
      if (id === this.seq) this.loading.set(false);
    }
  }

  protected async more(): Promise<void> {
    const avant = this.next();
    if (avant == null) return;
    this.loadingMore.set(true);
    try {
      const page = await firstValueFrom(this.api.audit(this.query(this.applied, avant), { silent: true }));
      this.items.update((l) => [...l, ...page.items]);
      this.next.set(page.suivant);
    } catch (e) {
      this.error.set(toAppError(e));
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected apply(): void {
    void this.search();
    const f = this.draft;
    const queryParams: Record<string, string | null> = {};
    for (const k of TEXT_KEYS) queryParams[k] = f[k].trim() || null;
    queryParams['non_authentifie'] = f.non_authentifie ? 'true' : null;
    void this.router.navigate([], { relativeTo: this.route, replaceUrl: true, queryParams });
  }

  protected reset(): void {
    this.draft = { ...EMPTY };
    this.apply();
  }

  protected filterBy(key: 'nigend' | 'ip', value: string): void {
    this.draft = { ...this.draft, [key]: value };
    this.apply();
  }

  protected toggle(l: AuditLineDto): void {
    this.open.set(this.open() === l.id_log ? null : l.id_log);
  }

  protected statusClass(s: number | null): string {
    if (s == null) return 'bg-slate-100 text-slate-600';
    if (s >= 500) return 'bg-red-100 text-red-800';
    if (s === 401 || s === 403) return 'bg-amber-100 text-amber-800';
    if (s >= 400) return 'bg-orange-50 text-orange-800';
    return 'bg-green-50 text-green-800';
  }

  protected statusLabel(s: number | null): string {
    const labels: Record<number, string> = { 200: 'OK', 201: 'Créé', 204: 'OK', 304: 'Inchangé', 400: 'Invalide', 401: 'Non authentifié', 403: 'Refusé', 404: 'Introuvable', 409: 'Conflit', 500: 'Erreur', 503: 'Indisponible' };
    return s != null ? (labels[s] ?? '') : '';
  }

  protected methodClass(m: string): string {
    return m === 'GET' ? 'text-slate-500' : m === 'DELETE' ? 'text-red-700' : 'text-rni-700';
  }

  /** Export des lignes affichées (CSV, séparateur « ; », compatible Excel). */
  protected exportCsv(): void {
    const cols: (keyof AuditLineDto)[] = ['id_log', 'horodatage', 'rio_user', 'role', 'code_unite', 'methode', 'route', 'statut', 'authentifie', 'duree_ms', 'taille_reponse', 'ip', 'request_id', 'hote', 'pid', 'user_agent'];
    const cell = (v: unknown) => (v == null ? '' : /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = '﻿' + [cols.join(';'), ...this.items().map((l) => cols.map((c) => cell(l[c])).join(';'))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `audit-requetes-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
