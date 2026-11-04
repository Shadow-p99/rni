import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  PROFIL_LIBELLES,
  Profil,
  RPSI_SEARCH_MIN_CHARS,
  RpsiPersonnelDto,
  UserDto,
  assignableProfils,
  dedupeNeo,
  isValidPhone,
} from '@rni/shared';
import { Subject, catchError, debounceTime, firstValueFrom, of, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { UsersApi } from '../../core/data.service';
import { ReferentielService } from '../../core/referentiel.service';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';

type Dialog = { kind: 'add' } | { kind: 'edit'; user: UserDto } | { kind: 'delete'; user: UserDto };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Module Gestion du personnel (§7). */
@Component({
  selector: 'rni-gestion-page',
  imports: [FormsModule, Modal],
  templateUrl: './gestion-page.html',
})
export class GestionPage {
  protected readonly auth = inject(AuthService);
  protected readonly ref = inject(ReferentielService);
  private readonly api = inject(UsersApi);
  private readonly toasts = inject(ToastService);

  protected readonly users = signal<UserDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly search = signal('');
  protected readonly region = signal<number | null>(null);
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

  protected readonly filtered = computed(() => {
    const q = norm(this.search().trim());
    if (!q) return this.users();
    return this.users().filter((u) =>
      norm(
        [u.nom, u.prenom, u.nigend, u.code_unite, u.libelle_unite, u.libelle_profil, u.libelle_region].filter(Boolean).join(' '),
      ).includes(q),
    );
  });

  constructor() {
    void this.ref.load();
    void this.load();
    this.rpsi$
      .pipe(
        debounceTime(300),
        switchMap((q) => (q.trim().length >= this.rpsiMin ? this.api.rpsi(q).pipe(catchError(() => of([]))) : of([]))),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((r) => this.rpsiResults.set(r));
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.users.set(await firstValueFrom(this.api.list(this.auth.isGign() ? this.region() : null)));
    } finally {
      this.loading.set(false);
    }
  }

  setRegion(r: number | null): void {
    this.region.set(r);
    void this.load();
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
      void this.load();
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
      void this.load();
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
      void this.load();
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
