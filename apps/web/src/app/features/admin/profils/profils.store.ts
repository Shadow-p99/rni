import { Injectable, computed, inject, signal } from '@angular/core';
import type { ProfilAdminDto, ProfilCreateDto, ProfilInputDto } from '@rni/shared';
import { ParametrageApi } from '../../../core/api/parametrage.api';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/notifications/toast.service';
import { ReferentielService } from '../../../core/referentiel/referentiel.service';
import { ActionState, AsyncState } from '../../../core/state/async-state';

export type GestionNiveau = 'aucun' | 'liste' | 'gere';
type Key = `${number}:${number}`;

/** Profils (libellé, ordre, planning, création / suppression) et règles de gestion du personnel. */
@Injectable()
export class ProfilsStore {
  private readonly api = inject(ParametrageApi);
  private readonly toasts = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly ref = inject(ReferentielService);

  readonly profils = new AsyncState<ProfilAdminDto[]>([]);
  readonly action = new ActionState();
  /** Profil en cours d'édition (brouillon). */
  readonly editing = signal<{ id: number; value: ProfilInputDto } | null>(null);
  /** Règles de gestion en brouillon. */
  readonly gestionDraft = signal<Map<Key, GestionNiveau>>(new Map());
  readonly gestionDirty = computed(() => this.gestionDraft().size > 0);

  load(): Promise<unknown> {
    return this.profils.load(() => this.api.profils({ silent: true }));
  }

  /** Après une modification : liste à jour, référentiels et droits de l'utilisateur relus. */
  private applied(list: ProfilAdminDto[]): void {
    this.profils.set(list);
    this.ref.loaded.set(false);
    void this.ref.load();
    void this.auth.load(true);
  }

  edit(p: ProfilAdminDto): void {
    this.editing.set({ id: p.id_profil, value: { libelle: p.libelle, code: p.code, classement: p.classement, has_planning: p.has_planning } });
    this.action.clear();
  }

  patch(v: Partial<ProfilInputDto>): void {
    const e = this.editing();
    if (e) this.editing.set({ ...e, value: { ...e.value, ...v } });
  }

  async saveEdit(): Promise<boolean> {
    const e = this.editing();
    if (!e) return false;
    const r = await this.action.run(() => this.api.updateProfil(e.id, e.value, { silent: true }));
    if (!r.ok) return false;
    this.applied(r.value);
    this.editing.set(null);
    this.toasts.success('Profil enregistré', e.value.libelle);
    return true;
  }

  async create(dto: ProfilCreateDto): Promise<boolean> {
    const r = await this.action.run(() => this.api.createProfil(dto, { silent: true }));
    if (!r.ok) return false;
    this.applied(r.value);
    this.toasts.success('Profil créé', `${dto.libelle} — réglez ses droits dans l’onglet Droits.`);
    return true;
  }

  async remove(p: ProfilAdminDto): Promise<boolean> {
    const r = await this.action.run(() => this.api.deleteProfil(p.id_profil, { silent: true }));
    if (!r.ok) return false;
    this.applied(r.value);
    this.toasts.success('Profil supprimé', p.libelle);
    return true;
  }

  // --- Gestion du personnel -----------------------------------------------------

  savedNiveau(p: ProfilAdminDto, cible: number): GestionNiveau {
    return p.gerables.includes(cible) ? 'gere' : p.visibles.includes(cible) ? 'liste' : 'aucun';
  }

  niveau(p: ProfilAdminDto, cible: number): GestionNiveau {
    return this.gestionDraft().get(`${p.id_profil}:${cible}`) ?? this.savedNiveau(p, cible);
  }

  isChanged(p: ProfilAdminDto, cible: number): boolean {
    return this.gestionDraft().has(`${p.id_profil}:${cible}`);
  }

  setNiveau(p: ProfilAdminDto, cible: number, n: GestionNiveau): void {
    const d = new Map(this.gestionDraft());
    const key: Key = `${p.id_profil}:${cible}`;
    if (n === this.savedNiveau(p, cible)) d.delete(key);
    else d.set(key, n);
    this.gestionDraft.set(d);
    this.action.clear();
  }

  cancelGestion(): void {
    this.gestionDraft.set(new Map());
  }

  async saveGestion(): Promise<boolean> {
    const items = [...this.gestionDraft()].map(([key, n]) => {
      const [a, b] = key.split(':').map(Number);
      return { id_profil: a, id_profil_cible: b, visible: n !== 'aucun', gerable: n === 'gere' };
    });
    if (!items.length) return false;
    const r = await this.action.run(() => this.api.updateGestion({ items }, { silent: true }));
    if (!r.ok) return false;
    this.applied(r.value);
    this.gestionDraft.set(new Map());
    this.toasts.success('Gestion du personnel enregistrée', `${items.length} modification(s).`);
    return true;
  }
}
