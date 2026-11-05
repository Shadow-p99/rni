import { Injectable, computed, inject, signal } from '@angular/core';
import { DROIT_MODULES, DROIT_MODULE_LIBELLES, type DroitCode, type DroitDefDto, type DroitsMatrixDto, type Portee, type ProfilDroitsDto } from '@rni/shared';
import { ParametrageApi } from '../../../core/api/parametrage.api';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/notifications/toast.service';
import { ActionState, AsyncState } from '../../../core/state/async-state';

type Key = `${number}:${DroitCode}`;

/** Matrice des droits par profil (brouillon local, enregistrement groupé). */
@Injectable()
export class DroitsStore {
  private readonly api = inject(ParametrageApi);
  private readonly toasts = inject(ToastService);
  private readonly auth = inject(AuthService);

  readonly matrix = new AsyncState<DroitsMatrixDto | null>(null);
  readonly save = new ActionState();
  /** Portée en brouillon (`null` = droit retiré). */
  readonly draft = signal<Map<Key, Portee | null>>(new Map());

  readonly profils = computed(() => this.matrix.data()?.profils ?? []);
  /** Catalogue regroupé par module, dans l'ordre d'affichage. */
  readonly groups = computed(() => {
    const cat = this.matrix.data()?.catalogue ?? [];
    return DROIT_MODULES.map((m) => ({ module: m, libelle: DROIT_MODULE_LIBELLES[m], droits: cat.filter((d) => d.module === m) })).filter((g) => g.droits.length);
  });

  readonly changes = computed(() =>
    [...this.draft()].map(([key, portee]) => {
      const [id, code] = key.split(/:(.+)/) as [string, DroitCode];
      return { id_profil: Number(id), code, portee };
    }),
  );
  readonly dirty = computed(() => this.changes().length > 0);

  load(): Promise<unknown> {
    return this.matrix.load(() => this.api.droits({ silent: true }));
  }

  saved(p: ProfilDroitsDto, code: DroitCode): Portee | null {
    return p.droits[code] ?? null;
  }

  value(p: ProfilDroitsDto, code: DroitCode): Portee | null {
    const key: Key = `${p.id_profil}:${code}`;
    return this.draft().has(key) ? this.draft().get(key)! : this.saved(p, code);
  }

  isChanged(p: ProfilDroitsDto, code: DroitCode): boolean {
    return this.draft().has(`${p.id_profil}:${code}`);
  }

  isLocked(p: ProfilDroitsDto, code: DroitCode): boolean {
    return p.locked.includes(code);
  }

  set(p: ProfilDroitsDto, code: DroitCode, portee: Portee | null): void {
    if (this.isLocked(p, code)) return;
    const d = new Map(this.draft());
    const key: Key = `${p.id_profil}:${code}`;
    if (portee === this.saved(p, code)) d.delete(key);
    else d.set(key, portee);
    this.draft.set(d);
    this.save.clear();
  }

  /** Droit simple : accordé / retiré ; droit à portée : première portée proposée à l'activation. */
  toggle(p: ProfilDroitsDto, def: DroitDefDto, on: boolean): void {
    this.set(p, def.code, on ? (this.saved(p, def.code) ?? def.portees[0]) : null);
  }

  cancel(): void {
    this.draft.set(new Map());
    this.save.clear();
  }

  async submit(): Promise<boolean> {
    const items = this.changes();
    if (!items.length) return false;
    const r = await this.save.run(() => this.api.updateDroits({ items }, { silent: true }));
    if (!r.ok) return false;
    this.matrix.set(r.value);
    this.draft.set(new Map());
    // Ses propres droits ont pu changer : menus et écrans mis à jour
    if (items.some((i) => i.id_profil === this.auth.profil())) void this.auth.load(true);
    this.toasts.success('Droits enregistrés', `${items.length} modification(s), appliquée(s) immédiatement (au prochain rechargement de page pour les utilisateurs connectés).`);
    return true;
  }
}
