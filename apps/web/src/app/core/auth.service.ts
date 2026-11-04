import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CurrentUserDto, Profil, canAccessFormulaire, isAdminProfil } from '@rni/shared';
import { firstValueFrom } from 'rxjs';
import { API } from './api';
import { SILENT } from './http.interceptor';

/**
 * Utilisateur connecté. Le client ne connaît pas la matrice d'habilitations : il interroge l'API
 * (BR-AUTH-3) et l'API rejette de toute façon toute écriture non autorisée.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly user = signal<CurrentUserDto | null>(null);
  readonly loaded = signal(false);
  private pending: Promise<CurrentUserDto | null> | null = null;

  readonly profil = computed(() => this.user()?.id_profil ?? null);
  readonly isAdmin = computed(() => isAdminProfil(this.profil()));
  readonly isGign = computed(() => this.profil() === Profil.GIGN);
  /** `checkAuthorization` : droits étendus (1, 3, 7) — crise, plannings des autres. */
  readonly hasExtendedRights = computed(() => isAdminProfil(this.profil()));
  readonly canFormulaire = computed(() => canAccessFormulaire(this.profil()));
  /** Écritures planning : profils 1, 3, 4, 7. */
  readonly canWritePlanning = computed(() => [1, 3, 4, 7].includes(this.profil() ?? -1));

  load(force = false): Promise<CurrentUserDto | null> {
    if (this.loaded() && !force) return Promise.resolve(this.user());
    if (this.pending && !force) return this.pending;
    const ctx = { context: new HttpContext().set(SILENT, true) };
    this.pending = (async () => {
      try {
        const isUser = await firstValueFrom(this.http.get<boolean>(`${API}/users/isUser`, ctx));
        const me = isUser ? await firstValueFrom(this.http.get<CurrentUserDto>(`${API}/users/me`, ctx)) : null;
        this.user.set(me);
        return me;
      } catch {
        this.user.set(null);
        return null;
      } finally {
        this.loaded.set(true);
        this.pending = null;
      }
    })();
    return this.pending;
  }

  setUser(u: CurrentUserDto): void {
    this.user.set(u);
  }
}
