import { Injectable, computed, inject, signal } from '@angular/core';
import { CurrentUserDto, Droit, Profil, type DroitCode, type Portee } from '@rni/shared';
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
 * Utilisateur connecté et **droits de son profil**, renvoyés par l'API (`/users/me`) depuis la
 * matrice paramétrée en base (Administration › Droits). Ils pilotent l'affichage ; l'API
 * revérifie de toute façon chaque requête (BR-AUTH-3).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(UsersApi);
  readonly user = signal<CurrentUserDto | null>(null);
  readonly status = signal<AuthStatus>('unknown');
  readonly lastError = signal<AppError | null>(null);
  private pending: Promise<AuthStatus> | null = null;

  readonly profil = computed(() => this.user()?.id_profil ?? null);
  /** Portée du droit (`null` = refusé). */
  portee(code: DroitCode): Portee | null {
    return this.user()?.droits?.[code] ?? null;
  }

  can(code: DroitCode): boolean {
    return this.portee(code) != null;
  }

  readonly canCarte = computed(() => this.can(Droit.CARTE_VOIR));
  readonly canPlanning = computed(() => this.can(Droit.PLANNING_VOIR));
  readonly canIsochrone = computed(() => this.can(Droit.CARTE_ISOCHRONE));
  /** Écritures planning (BR-PLA-7) : droit `planning.ecrire`. */
  readonly canWritePlanning = computed(() => this.can(Droit.PLANNING_ECRIRE));
  /** Écriture de son seul planning (personne non modifiable dans la saisie). */
  readonly planningSoiSeul = computed(() => this.portee(Droit.PLANNING_ECRIRE) === 'soi');
  /** BR-PLA-4 : positions restreintes (Alerte, Formateur…) utilisables. */
  readonly canRestrictedPositions = computed(() => this.can(Droit.PLANNING_POSITIONS_RESTREINTES));
  readonly canFormulaire = computed(() => this.can(Droit.FORMULAIRE_VOIR));
  readonly canCreerFormulaire = computed(() => this.can(Droit.FORMULAIRE_CREER));
  /** Fiches de toutes les régions (filtre de région proposé). */
  readonly formulaireNational = computed(() => this.portee(Droit.FORMULAIRE_VOIR) === 'national');
  /** BR-AUTH-5 : écran Gestion du personnel. */
  readonly canGestion = computed(() => this.can(Droit.GESTION_ACCES));
  /** Gestion du personnel de toutes les régions (filtre de région proposé). */
  readonly gestionNationale = computed(() => this.portee(Droit.GESTION_ACCES) === 'national');
  readonly canAdmin = computed(() => this.can(Droit.ADMIN_ACCES));
  /** Profils listés et attribuables dans la gestion du personnel. */
  readonly profilsVisibles = computed(() => this.user()?.profils_visibles ?? []);
  readonly profilsGerables = computed(() => this.user()?.profils_gerables ?? []);

  /** Première page accessible (redirection de la racine, accès refusé à une page). */
  readonly homePath = computed(() =>
    this.canCarte() ? '/carte' : this.canPlanning() ? '/planning' : this.canFormulaire() ? '/formulaire' : this.canGestion() ? '/gestion' : this.canAdmin() ? '/administration' : null,
  );

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

  /** Peut écrire le planning d'un agent, selon la portée du droit (contrôle d'affichage ; l'API revérifie). */
  canEditPlanningOf(target: { id_user: number; id_region: number | null }): boolean {
    const me = this.user();
    switch (me ? this.portee(Droit.PLANNING_ECRIRE) : null) {
      case 'national':
        return true;
      case 'region':
        return me!.id_region != null && me!.id_region === target.id_region;
      case 'soi':
        return me!.id_user === target.id_user;
      default:
        return false;
    }
  }

  /** BR-GPU-3 : compte d'un profil géré, dans la portée du droit `gestion.acces`. */
  canManageUser(target: { id_profil: number; id_region: number | null }): boolean {
    const me = this.user();
    const portee = this.portee(Droit.GESTION_ACCES);
    if (!me || !portee) return false;
    if (target.id_profil === Profil.SUPER_ADMIN && me.id_profil !== Profil.SUPER_ADMIN) return false;
    if (!this.profilsGerables().includes(target.id_profil)) return false;
    return portee === 'national' || (me.id_region != null && target.id_region === me.id_region);
  }
}
