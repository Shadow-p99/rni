import { Injectable, computed, inject, signal } from '@angular/core';
import { Perimetre, PerimetreModule, PerimetreProfilDto } from '@rni/shared';
import { ServiceApi } from '../../core/api/service.api';
import { ToastService } from '../../core/notifications/toast.service';
import { ActionState, AsyncState } from '../../core/state/async-state';

type Key = `${number}:${PerimetreModule}`;

/** Paramétrage des périmètres de visualisation (super administrateur). */
@Injectable()
export class PerimetresStore {
  private readonly api = inject(ServiceApi);
  private readonly toasts = inject(ToastService);

  readonly matrix = new AsyncState<PerimetreProfilDto[]>([]);
  readonly save = new ActionState();
  /** Modifications en cours, non enregistrées. */
  readonly draft = signal<Map<Key, Perimetre>>(new Map());

  readonly changes = computed(() => {
    const out: { id_profil: number; module: PerimetreModule; perimetre: Perimetre }[] = [];
    for (const [key, perimetre] of this.draft()) {
      const [id, module] = key.split(':') as [string, PerimetreModule];
      out.push({ id_profil: Number(id), module, perimetre });
    }
    return out;
  });
  readonly dirty = computed(() => this.changes().length > 0);

  load(): Promise<unknown> {
    return this.matrix.load(() => this.api.perimetres({ silent: true }));
  }

  /** Valeur affichée : brouillon sinon valeur enregistrée. */
  value(row: PerimetreProfilDto, module: PerimetreModule): Perimetre {
    return this.draft().get(`${row.id_profil}:${module}`) ?? row[module];
  }

  isChanged(row: PerimetreProfilDto, module: PerimetreModule): boolean {
    return this.draft().has(`${row.id_profil}:${module}`);
  }

  set(row: PerimetreProfilDto, module: PerimetreModule, perimetre: Perimetre): void {
    if (row.locked) return;
    const d = new Map(this.draft());
    const key: Key = `${row.id_profil}:${module}`;
    if (perimetre === row[module]) d.delete(key);
    else d.set(key, perimetre);
    this.draft.set(d);
    this.save.clear();
  }

  cancel(): void {
    this.draft.set(new Map());
    this.save.clear();
  }

  async submit(): Promise<boolean> {
    const items = this.changes();
    if (!items.length) return false;
    const r = await this.save.run(() => this.api.updatePerimetres({ items }, { silent: true }));
    if (!r.ok) return false;
    this.matrix.set(r.value);
    this.draft.set(new Map());
    this.toasts.success('Périmètres enregistrés', `${items.length} modification(s), appliquée(s) sous 30 secondes au plus.`);
    return true;
  }
}
