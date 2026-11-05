import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PositionInputDto, PositionServiceDto } from '@rni/shared';
import { ParametrageApi } from '../../../core/api/parametrage.api';
import { ToastService } from '../../../core/notifications/toast.service';
import { HasUnsavedChanges } from '../../../core/platform/unsaved-changes.guard';
import { ReferentielService } from '../../../core/referentiel/referentiel.service';
import { ActionState, AsyncState } from '../../../core/state/async-state';
import { AsyncView } from '../../../shared/ui/async-view';
import { ErrorPanel } from '../../../shared/ui/error-panel';
import { PageHeader } from '../../../shared/ui/page-header';
import { Switch } from '../../../shared/ui/switch';

type Row = PositionInputDto & { id_pos_service: number | null };

const toRow = (p: PositionServiceDto): Row => ({
  id_pos_service: p.id_pos_service,
  libelle: p.libelle,
  color: p.color,
  is_actif: p.is_actif,
  is_restreinte: p.is_restreinte,
  priorite_cluster: p.priorite_cluster,
});
const same = (a: Row, b: Row) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Administration › Positions de service : libellé et couleur (carte, planning, légendes),
 * activation, position restreinte (BR-PLA-4) et priorité de couleur des clusters (BR-CAR-4).
 */
@Component({
  selector: 'rni-positions-page',
  imports: [FormsModule, PageHeader, AsyncView, ErrorPanel, Switch],
  template: `
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-3 p-3 desk:p-4">
      <rni-page-header title="Administration — positions de service" subtitle="Libellés, couleurs, positions restreintes et couleur des groupes sur la carte">
        <button actions type="button" class="btn-primary" (click)="add()" [disabled]="!!adding()">+ Nouvelle position</button>
      </rni-page-header>
      <div class="card p-3 text-xs text-slate-600">
        <ul class="list-disc space-y-1 pl-5">
          <li><span class="font-medium">Restreinte</span> : seuls les profils ayant le droit « Utiliser les positions restreintes » peuvent la poser ou la retirer.</li>
          <li><span class="font-medium">Priorité carte</span> : un groupe de personnels prend la couleur de la position de plus forte priorité (1) présente ; vide = jamais.</li>
          <li>Une position désactivée n'est plus proposée à la saisie ; les plannings existants la conservent.</li>
        </ul>
      </div>
      <rni-error-panel [error]="action.error()" />
      <rni-async-view class="card" [loading]="list.loading()" [pending]="list.pending()" [error]="list.error()" (retry)="load()">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-left text-xs text-slate-500 uppercase">
              <tr>
                <th class="px-3 py-2">Position</th>
                <th class="px-3 py-2">Couleur</th>
                <th class="px-3 py-2 text-center">Active</th>
                <th class="px-3 py-2 text-center">Restreinte</th>
                <th class="px-3 py-2">Priorité carte</th>
                <th class="px-3 py-2"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (r of rows(); track $index) {
                <tr [class.bg-amber-50]="dirty(r, $index)">
                  <td class="px-3 py-2">
                    <span class="flex items-center gap-2">
                      <span class="inline-block size-4 shrink-0 rounded-full border border-white shadow" [style.background]="r.color"></span>
                      <input class="input" maxlength="64" [(ngModel)]="r.libelle" (ngModelChange)="touch()" aria-label="Libellé" />
                    </span>
                  </td>
                  <td class="px-3 py-2"><input type="color" class="h-8 w-14 cursor-pointer rounded border border-slate-300" [(ngModel)]="r.color" (ngModelChange)="touch()" aria-label="Couleur" /></td>
                  <td class="px-3 py-2 text-center"><rni-switch label="Active" [(checked)]="r.is_actif" (checkedChange)="touch()" /></td>
                  <td class="px-3 py-2 text-center"><rni-switch label="Restreinte" [(checked)]="r.is_restreinte" (checkedChange)="touch()" /></td>
                  <td class="px-3 py-2">
                    <input class="input !w-20" type="number" min="1" max="99" placeholder="—" [ngModel]="r.priorite_cluster" (ngModelChange)="r.priorite_cluster = $event === '' || $event == null ? null : +$event; touch()" aria-label="Priorité carte" />
                  </td>
                  <td class="px-3 py-2 text-right whitespace-nowrap">
                    @if (dirty(r, $index)) {
                      <button type="button" class="btn-ghost" (click)="reset($index)">Annuler</button>
                      <button type="button" class="btn-primary" (click)="save(r)" [disabled]="action.busy() || !r.libelle.trim()">Enregistrer</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </rni-async-view>
    </div>
  `,
})
export class PositionsPage implements HasUnsavedChanges {
  private readonly api = inject(ParametrageApi);
  private readonly toasts = inject(ToastService);
  private readonly ref = inject(ReferentielService);
  protected readonly list = new AsyncState<PositionServiceDto[]>([]);
  protected readonly action = new ActionState();
  /** Lignes éditables (copie de la liste enregistrée, + nouvelle position). */
  protected readonly rows = signal<Row[]>([]);
  protected readonly adding = signal(false);
  private readonly version = signal(0);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const l = await this.list.load(() => this.api.positions({ silent: true }));
    if (l) this.applyList(l);
  }

  private applyList(l: PositionServiceDto[]): void {
    this.list.set(l);
    this.rows.set(l.map(toRow));
    this.adding.set(false);
    this.ref.loaded.set(false);
    void this.ref.load();
  }

  protected touch(): void {
    this.version.update((v) => v + 1);
  }

  protected dirty(r: Row, i: number): boolean {
    this.version();
    const saved = this.list.data()[i];
    return !saved || r.id_pos_service == null || !same(r, toRow(saved));
  }

  protected reset(i: number): void {
    const saved = this.list.data()[i];
    this.rows.set(saved ? this.rows().map((r, j) => (j === i ? toRow(saved) : r)) : this.rows().filter((_, j) => j !== i));
    if (!saved) this.adding.set(false);
  }

  protected add(): void {
    this.rows.set([...this.rows(), { id_pos_service: null, libelle: '', color: '#0ea5e9', is_actif: true, is_restreinte: false, priorite_cluster: null }]);
    this.adding.set(true);
  }

  protected async save(r: Row): Promise<void> {
    const { id_pos_service, ...dto } = r;
    const res = await this.action.run(() =>
      id_pos_service == null ? this.api.createPosition(dto, { silent: true }) : this.api.updatePosition(id_pos_service, dto, { silent: true }),
    );
    if (!res.ok) return;
    this.applyList(res.value);
    this.toasts.success('Position enregistrée', dto.libelle);
  }

  hasUnsavedChanges(): boolean {
    return this.rows().some((r, i) => this.dirty(r, i));
  }
}
