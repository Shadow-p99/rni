import { Injectable, computed, inject, signal } from '@angular/core';
import { CurrentUserDto, Profil, canAccessFormulaire, canWritePlanning, isAdminProfil, isNationalAdmin } from '@rni/shared';
import { firstValueFrom } from 'rxjs';
import { UsersApi } from '../api/users.api';
import { AppError, toAppError } from '../errors/app-error';

/**
 * - `authenticated` : utilisateur habilité ;
 * - `anonymous` : en-têtes SSO absents ou nigend non habilité ;
 * - `unavailable` : l'API ne répond pas (on ne conclut PAS à un défaut d'habilitation).
 */
export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous' | 'unavailable';

/**
 * Utilisateur connecté. Le client ne connaît pas la matrice d'habilitations : il interroge l'API
 * (BR-AUTH-3), qui rejette de toute façon toute écriture non autorisée.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(UsersApi);
  readonly user = signal<CurrentUserDto | null>(null);
  readonly status = signal<AuthStatus>('unknown');
  readonly lastError = signal<AppError | null>(null);
  private pending: Promise<AuthStatus> | null = null;

  readonly profil = computed(() => this.user()?.id_profil ?? null);
  readonly isAdmin = computed(() => isAdminProfil(this.profil()));
  /** Administrateur national (GIGN ou super administrateur) : toutes les régions, tous les comptes. */
  readonly isGign = computed(() => isNationalAdmin(this.profil()));
  readonly isSuperAdmin = computed(() => this.profil() === Profil.SUPER_ADMIN);
  /** `checkAuthorization` : droits étendus (administrateurs) — crise, plannings des autres. */
  readonly hasExtendedRights = computed(() => isAdminProfil(this.profil()));
  readonly canFormulaire = computed(() => canAccessFormulaire(this.profil()));
  /** Écritures planning (BR-PLA-7) : PLANNING_WRITE_PROFILS de @rni/shared. */
  readonly canWritePlanning = computed(() => canWritePlanning(this.profil()));

  load(force = false): Promise<AuthStatus> {
    const s = this.status();
    if (!force && (s === 'authenticated' || s === 'anonymous')) return Promise.resolve(s);
    if (this.pending) return this.pending;
    this.pending = (async (): Promise<AuthStatus> => {
      try {
        const isUser = await firstValueFrom(this.api.isUser());
        const me = isUser ? await firstValueFrom(this.api.me({ silent: true, allow401: true })) : null;
        this.user.set(me);
        this.lastError.set(null);
        this.status.set(me ? 'authenticated' : 'anonymous');
      } catch (e) {
        const err = toAppError(e);
        this.lastError.set(err);
        this.user.set(null);
        this.status.set(err.kind === 'unauthenticated' || err.kind === 'forbidden' ? 'anonymous' : 'unavailable');
      } finally {
        this.pending = null;
      }
      return this.status();
    })();
    return this.pending;
  }

  setUser(u: CurrentUserDto): void {
    this.user.set(u);
  }

  /** Peut écrire le planning d'un agent (contrôle d'affichage ; l'API revérifie). */
  canEditPlanningOf(target: { id_user: number; id_region: number | null }): boolean {
    const me = this.user();
    if (!me || !this.canWritePlanning()) return false;
    if (isNationalAdmin(me.id_profil)) return true;
    if (me.id_profil === Profil.NEGOCIATEUR) return me.id_user === target.id_user;
    return me.id_region === target.id_region;
  }

  /** Le profil GIGN / OMS n'est pas gérable par un référent régional (BR-GPU-3). */
  canManageUser(target: { id_profil: number; id_region: number | null }): boolean {
    // Seul un super administrateur gère un compte super administrateur
    if (target.id_profil === Profil.SUPER_ADMIN) return this.isSuperAdmin();
    if (this.isGign()) return true;
    return this.isAdmin() && ![Profil.GIGN, Profil.OMS].includes(target.id_profil) && target.id_region === this.user()?.id_region;
  }
}
