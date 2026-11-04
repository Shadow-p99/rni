import { Injectable, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  DEFAULT_PAGE_SIZE,
  Page,
  SortDir,
  USER_SORTS,
  UserDto,
  UserListQuery,
  UserSort,
  normalizePage,
} from '@rni/shared';
import { UsersApi } from '../../core/api/users.api';
import { AuthService } from '../../core/auth/auth.service';
import { AsyncState } from '../../core/state/async-state';

const EMPTY: Page<UserDto> = { items: [], total: 0, page: 1, size: DEFAULT_PAGE_SIZE };

/**
 * État de la liste du personnel (pagination serveur) et synchronisation avec l'URL.
 * Fourni au niveau de la page : un état par écran.
 */
@Injectable()
export class GestionStore {
  private readonly api = inject(UsersApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly list = new AsyncState<Page<UserDto>>(EMPTY);

  readonly q = signal('');
  readonly region = signal<number | null>(null);
  readonly profil = signal<number | null>(null);
  readonly page = signal(1);
  readonly size = signal(DEFAULT_PAGE_SIZE);
  readonly sort = signal<UserSort>('defaut');
  readonly dir = signal<SortDir>('asc');

  readonly hasFilters = computed(() => !!this.q() || this.region() != null || this.profil() != null || this.sort() !== 'defaut');

  /** Lit l'état depuis l'URL puis charge la première page. */
  init(): void {
    const qp = this.route.snapshot.queryParamMap;
    const num = (k: string) => {
      const v = qp.get(k);
      return v != null && v !== '' && Number.isFinite(+v) ? +v : null;
    };
    const { page, size } = normalizePage(qp.get('page'), qp.get('size'));
    this.page.set(page);
    this.size.set(size);
    this.q.set(qp.get('q') ?? '');
    this.region.set(this.auth.isGign() ? num('region') : null);
    this.profil.set(num('profil'));
    const sort = qp.get('sort') as UserSort | null;
    this.sort.set(sort && USER_SORTS.includes(sort) ? sort : 'defaut');
    this.dir.set(qp.get('dir') === 'desc' ? 'desc' : 'asc');
    void this.reload();
  }

  private query(): UserListQuery {
    const custom = this.sort() !== 'defaut';
    return {
      page: this.page(),
      size: this.size(),
      q: this.q().trim() || undefined,
      region: this.region() ?? undefined,
      profil: this.profil() ?? undefined,
      sort: custom ? this.sort() : undefined,
      dir: custom && this.dir() === 'desc' ? 'desc' : undefined,
    };
  }

  /** Recharge la page courante ; l'état est reflété dans l'URL (partageable, conservé au rafraîchissement). */
  async reload(): Promise<void> {
    const query = this.query();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...query, page: query.page === 1 ? undefined : query.page, size: query.size === DEFAULT_PAGE_SIZE ? undefined : query.size },
      replaceUrl: true,
    });
    const page = await this.list.load(() => this.api.list(query, { silent: true }));
    // Page devenue vide (suppression, filtres) : revenir à la dernière page existante.
    if (page && !page.items.length && page.total > 0 && this.page() > 1) {
      this.page.set(Math.ceil(page.total / this.size()));
      await this.reload();
    }
  }

  search(q: string): void {
    this.q.set(q);
    this.page.set(1);
    void this.reload();
  }

  setRegion(region: number | null): void {
    this.region.set(region);
    this.page.set(1);
    void this.reload();
  }

  setProfil(profil: number | null): void {
    this.profil.set(profil);
    this.page.set(1);
    void this.reload();
  }

  /** Cycle croissant → décroissant → tri par défaut. */
  toggleSort(col: UserSort): void {
    if (this.sort() !== col) {
      this.sort.set(col);
      this.dir.set('asc');
    } else if (this.dir() === 'asc') {
      this.dir.set('desc');
    } else {
      this.sort.set('defaut');
      this.dir.set('asc');
    }
    this.page.set(1);
    void this.reload();
  }

  setPage(p: number): void {
    this.page.set(p);
    void this.reload();
  }

  /** Change la taille de page en conservant approximativement la position. */
  setSize(size: number): void {
    const first = (this.page() - 1) * this.size();
    this.size.set(size);
    this.page.set(Math.floor(first / size) + 1);
    void this.reload();
  }

  reset(): void {
    this.q.set('');
    this.region.set(null);
    this.profil.set(null);
    this.sort.set('defaut');
    this.dir.set('asc');
    this.page.set(1);
    void this.reload();
  }
}
