import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  DEFAULT_PAGE_SIZE,
  PROFIL_LIBELLES,
  Page,
  Profil,
  RPSI_SEARCH_MIN_CHARS,
  RpsiPersonnelDto,
  SortDir,
  USER_SORTS,
  UserDto,
  UserListQuery,
  UserSort,
  assignableProfils,
  dedupeNeo,
  isValidPhone,
  listableProfils,
  normalizePage,
} from '@rni/shared';
import { Subject, catchError, debounceTime, distinctUntilChanged, finalize, firstValueFrom, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { UsersApi } from '../../core/data.service';
import { ReferentielService } from '../../core/referentiel.service';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';
import { Paginator } from '../../shared/paginator';

type Dialog = { kind: 'add' } | { kind: 'edit'; user: UserDto } | { kind: 'delete'; user: UserDto };

const EMPTY: Page<UserDto> = { items: [], total: 0, page: 1, size: DEFAULT_PAGE_SIZE };

/**
 * Module Gestion du personnel (§7). La liste est **paginée côté serveur** : recherche, filtres et tri
 * sont exécutés par l'API ; seule la page affichée transite. L'état est reflété dans l'URL.
 */
@Component({
  selector: 'rni-gestion-page',
  imports: [FormsModule, DecimalPipe, Modal, Paginator],
  templateUrl: './gestion-page.html',
})
export class GestionPage {
  protected readonly auth = inject(AuthService);
  protected readonly ref = inject(ReferentielService);
  private readonly api = inject(UsersApi);
  private readonly toasts = inject(ToastService);

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly result = signal<Page<UserDto>>(EMPTY);
  protected readonly loading = signal(false);
  // État de la liste (synchronisé avec l'URL)
  protected readonly q = signal('');
  protected readonly region = signal<number | null>(null);
  protected readonly profilFilter = signal<number | null>(null);
  protected readonly page = signal(1);
  protected readonly size = signal(DEFAULT_PAGE_SIZE);
  protected readonly sort = signal<UserSort>('defaut');
  protected readonly dir = signal<SortDir>('asc');
  private readonly search$ = new Subject<string>();
  private readonly query$ = new Subject<UserListQuery>();

  protected readonly columns: { label: string; sort?: UserSort }[] = [
    { label: 'Personnel', sort: 'nom' },
    { label: 'Nigend', sort: 'nigend' },
    { label: 'Unité', sort: 'unite' },
    { label: 'Région', sort: 'region' },
    { label: 'Profil', sort: 'profil' },
    { label: 'Téléphones' },
  ];
  protected readonly listable = computed(() => listableProfils(this.auth.profil() ?? 0));
  protected readonly hasFilters = computed(() => !!this.q() || this.region() != null || this.profilFilter() != null || this.sort() !== 'defaut');
  protected readonly dialog = signal<Dialog | null>(null);
  protected readonly saving = signal(false);
  protected readonly editUser = computed(() => {
    const d = this.dialog();
    return d?.kind === 'edit' ? d.user : null;
  });
  protected readonly deleteUser = computed(() => {
    const d = this.dialog();
    return d?.kind === 'delete' ? d.user : null;
  });

  // Ajout
  protected readonly rpsiQuery = signal('');
  protected readonly rpsiResults = signal<RpsiPersonnelDto[]>([]);
  protected readonly rpsiSelected = signal<RpsiPersonnelDto | null>(null);
  protected readonly rpsiMin = RPSI_SEARCH_MIN_CHARS;
  private readonly rpsi$ = new Subject<string>();

  // Formulaire (ajout / modification)
  protected profil: number | null = Profil.NEGOCIATEUR;
  protected telPerso = '';
  protected commentaire = '';
  protected readonly telError = signal(false);

  protected readonly libelles = PROFIL_LIBELLES;
  protected readonly assignable = computed(() => assignableProfils(this.auth.profil() ?? 0));

  constructor() {
    void this.ref.load();
    this.readUrl();

    // Requêtes de liste : la dernière annule les précédentes.
    this.query$
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap((query) =>
          this.api.list(query).pipe(
            catchError(() => of(null)),
            finalize(() => this.loading.set(false)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((page) => {
        if (!page) return;
        // Page devenue vide (suppression, filtre) : revenir à la dernière page existante.
        if (!page.items.length && page.total > 0 && this.page() > 1) {
          this.page.set(Math.ceil(page.total / this.size()));
          this.reload();
          return;
        }
        this.result.set(page);
      });

    // Recherche différée de 300 ms, retour en page 1.
    this.search$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.page.set(1);
        this.reload();
      });

    this.reload();
    this.rpsi$
      .pipe(
        debounceTime(300),
        switchMap((q) => (q.trim().length >= this.rpsiMin ? this.api.rpsi(q).pipe(catchError(() => of([]))) : of([]))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((r) => this.rpsiResults.set(r));
  }

  private readUrl(): void {
    const qp = this.route.snapshot.queryParamMap;
    const num = (k: string) => (qp.get(k) != null && qp.get(k) !== '' && !isNaN(+qp.get(k)!) ? +qp.get(k)! : null);
    const { page, size } = normalizePage(qp.get('page'), qp.get('size'));
    this.page.set(page);
    this.size.set(size);
    this.q.set(qp.get('q') ?? '');
    this.region.set(this.auth.isGign() ? num('region') : null);
    this.profilFilter.set(num('profil'));
    const sort = qp.get('sort') as UserSort | null;
    this.sort.set(sort && USER_SORTS.includes(sort) ? sort : 'defaut');
    this.dir.set(qp.get('dir') === 'desc' ? 'desc' : 'asc');
  }

  private query(): UserListQuery {
    return {
      page: this.page(),
      size: this.size(),
      q: this.q().trim() || undefined,
      region: this.region() ?? undefined,
      profil: this.profilFilter() ?? undefined,
      sort: this.sort() !== 'defaut' ? this.sort() : undefined,
      dir: this.sort() !== 'defaut' && this.dir() === 'desc' ? 'desc' : undefined,
    };
  }

  /** Recharge la page courante et reflète l'état dans l'URL (partageable, conservé au rafraîchissement). */
  reload(): void {
    const query = this.query();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...query, page: query.page === 1 ? undefined : query.page, size: query.size === DEFAULT_PAGE_SIZE ? undefined : query.size },
      replaceUrl: true,
    });
    this.query$.next(query);
  }

  onSearch(v: string): void {
    this.q.set(v);
    this.search$.next(v.trim());
  }

  setFilter(kind: 'region' | 'profil', v: number | null): void {
    (kind === 'region' ? this.region : this.profilFilter).set(v);
    this.page.set(1);
    this.reload();
  }

  resetFilters(): void {
    this.q.set('');
    this.region.set(null);
    this.profilFilter.set(null);
    this.sort.set('defaut');
    this.dir.set('asc');
    this.page.set(1);
    this.reload();
  }

  toggleSort(col: UserSort): void {
    if (this.sort() === col) {
      if (this.dir() === 'asc') this.dir.set('desc');
      else {
        this.sort.set('defaut');
        this.dir.set('asc');
      }
    } else {
      this.sort.set(col);
      this.dir.set('asc');
    }
    this.page.set(1);
    this.reload();
  }

  setPage(p: number): void {
    this.page.set(p);
    this.reload();
  }

  setSize(size: number): void {
    // Conserver approximativement la position dans la liste
    const first = (this.page() - 1) * this.size();
    this.size.set(size);
    this.page.set(Math.floor(first / size) + 1);
    this.reload();
  }

  /** Le profil GIGN / OMS n'est pas modifiable par un référent régional. */
  canManage(u: UserDto): boolean {
    if (this.auth.isGign()) return true;
    return ![Profil.GIGN, Profil.OMS].includes(u.id_profil) && u.id_region === this.auth.user()?.id_region;
  }

  openAdd(): void {
    this.rpsiQuery.set('');
    this.rpsiResults.set([]);
    this.rpsiSelected.set(null);
    this.profil = Profil.NEGOCIATEUR;
    this.dialog.set({ kind: 'add' });
  }

  onRpsiQuery(q: string): void {
    this.rpsiQuery.set(q);
    this.rpsiSelected.set(null);
    this.rpsi$.next(q);
  }

  pickRpsi(p: RpsiPersonnelDto): void {
    this.rpsiSelected.set(p);
    this.rpsiQuery.set(`${p.nigend} — ${p.prenom} ${p.nom}`);
    this.rpsiResults.set([]);
  }

  openEdit(u: UserDto): void {
    this.profil = u.id_profil;
    this.telPerso = u.tel_perso ?? '';
    this.commentaire = u.commentaire ?? '';
    this.telError.set(false);
    this.dialog.set({ kind: 'edit', user: u });
  }

  openDelete(u: UserDto): void {
    this.dialog.set({ kind: 'delete', user: u });
  }

  async add(): Promise<void> {
    const p = this.rpsiSelected();
    if (!p || this.profil == null) return;
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.create({ nigend: p.nigend, id_profil: this.profil }));
      this.toasts.success(p.id_user ? 'Compte réactivé' : 'Compte créé', `${p.prenom} ${p.nom} — ${PROFIL_LIBELLES[this.profil as Profil]}`);
      this.dialog.set(null);
      this.reload();
    } catch {
      /* notifié */
    } finally {
      this.saving.set(false);
    }
  }

  async update(u: UserDto): Promise<void> {
    const tel = this.telPerso.trim();
    if (tel && !isValidPhone(tel)) {
      this.telError.set(true);
      return;
    }
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.api.update(u.id_user, {
          ...(this.profil !== u.id_profil ? { id_profil: this.profil! } : {}),
          tel_perso: tel || null,
          commentaire: this.commentaire.trim() || null,
        }),
      );
      this.toasts.success('Compte modifié');
      this.dialog.set(null);
      this.reload();
    } catch {
      /* notifié */
    } finally {
      this.saving.set(false);
    }
  }

  async remove(u: UserDto): Promise<void> {
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.remove(u.id_user));
      this.toasts.success('Compte supprimé', `${u.prenom} ${u.nom}`);
      this.dialog.set(null);
      this.reload();
    } catch {
      /* notifié */
    } finally {
      this.saving.set(false);
    }
  }

  protected neo(u: UserDto): string {
    const n = dedupeNeo(u.numero_neo_1, u.numero_neo_2);
    return [n.neo1, n.neo2].filter(Boolean).join(' / ') || '—';
  }
}
