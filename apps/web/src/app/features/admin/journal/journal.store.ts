import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { AppLogDto, AppLogLevel, AppLogQuery } from '@rni/shared';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../../core/api/admin.api';
import { AppError, toAppError } from '../../../core/errors/app-error';

export interface JournalFilter {
  niveau: AppLogLevel;
  contexte: string;
  q: string;
  request_id: string;
  nigend: string;
}

export const EMPTY_FILTER: JournalFilter = { niveau: 'log', contexte: '', q: '', request_id: '', nigend: '' };
export const LIVE_MS = 5000;
const PAGE = 100;

/**
 * Journal applicatif : recherche filtrée, pages vers le passé, suivi en direct (nouvelles lignes
 * ajoutées en tête toutes les 5 s, onglet visible uniquement).
 */
@Injectable()
export class JournalStore {
  private readonly api = inject(AdminApi);

  readonly filter = signal<JournalFilter>(EMPTY_FILTER);
  readonly items = signal<AppLogDto[]>([]);
  readonly contextes = signal<{ contexte: string; nb: number }[]>([]);
  readonly next = signal<number | null>(null);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly error = signal<AppError | null>(null);
  readonly live = signal(false);
  /** Lignes arrivées au dernier rafraîchissement (mise en évidence). */
  readonly fresh = signal<Set<number>>(new Set());
  private seq = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.setLive(false));
  }

  private query(extra: Partial<AppLogQuery> = {}): AppLogQuery {
    const f = this.filter();
    return {
      niveau: f.niveau,
      contexte: f.contexte || undefined,
      q: f.q.trim() || undefined,
      request_id: f.request_id.trim() || undefined,
      nigend: f.nigend.trim() || undefined,
      limite: PAGE,
      ...extra,
    };
  }

  async search(filter?: JournalFilter): Promise<void> {
    if (filter) this.filter.set(filter);
    const id = ++this.seq;
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await firstValueFrom(this.api.journal(this.query(), { silent: true }));
      if (id !== this.seq) return;
      this.items.set(page.items);
      this.contextes.set(page.contextes);
      this.next.set(page.suivant);
      this.fresh.set(new Set());
    } catch (e) {
      if (id === this.seq) this.error.set(toAppError(e));
    } finally {
      if (id === this.seq) this.loading.set(false);
    }
  }

  async more(): Promise<void> {
    const before = this.next();
    if (before == null || this.loadingMore()) return;
    this.loadingMore.set(true);
    try {
      const page = await firstValueFrom(this.api.journal(this.query({ avant: before }), { silent: true }));
      this.items.update((cur) => [...cur, ...page.items]);
      this.next.set(page.suivant);
    } catch (e) {
      this.error.set(toAppError(e));
    } finally {
      this.loadingMore.set(false);
    }
  }

  /** Nouvelles lignes (identifiant supérieur à la plus récente affichée). */
  async poll(): Promise<void> {
    if (this.loading()) return;
    const id = this.seq;
    try {
      const page = await firstValueFrom(this.api.journal(this.query(), { silent: true }));
      if (id !== this.seq) return;
      const top = this.items()[0]?.id_log ?? 0;
      const added = page.items.filter((i) => i.id_log > top);
      if (added.length) {
        this.items.update((cur) => [...added, ...cur].slice(0, 1000));
        this.fresh.set(new Set(added.map((a) => a.id_log)));
      }
      this.contextes.set(page.contextes);
      this.error.set(null);
    } catch (e) {
      this.error.set(toAppError(e));
    }
  }

  setLive(on: boolean): void {
    this.live.set(on);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (on) {
      void this.poll();
      this.timer = setInterval(() => document.visibilityState === 'visible' && void this.poll(), LIVE_MS);
    }
  }
}
