import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CRISE_PAR_DEFAUT, type FormulaireChampDto, type FormulaireConfigDto, type FormulaireSectionDto } from '@rni/shared';
import { ParametrageApi } from '../../../core/api/parametrage.api';
import { FormulaireConfigService } from '../../../core/formulaire/formulaire-config.service';
import { ToastService } from '../../../core/notifications/toast.service';
import { HasUnsavedChanges } from '../../../core/platform/unsaved-changes.guard';
import { ActionState, AsyncState } from '../../../core/state/async-state';
import { AsyncView } from '../../../shared/ui/async-view';
import { ErrorPanel } from '../../../shared/ui/error-panel';
import { PageHeader } from '../../../shared/ui/page-header';
import { Switch } from '../../../shared/ui/switch';

interface CriseRow {
  id_type_crise: number | null;
  libelle: string;
  is_actif: boolean;
}

interface Draft {
  crises: CriseRow[];
  sections: FormulaireSectionDto[];
  champs: FormulaireChampDto[];
}

const KIND_LIBELLES: Record<string, string> = {
  text: 'Texte court',
  textarea: 'Texte long',
  number: 'Nombre',
  note: 'Note 0 à 10',
  select: 'Type de crise',
  phone: 'Téléphone',
  address: 'Adresse (géocodée)',
};

function toDraft(c: FormulaireConfigDto): Draft {
  return {
    crises: c.crises.map((x) => ({ id_type_crise: x.id_type_crise || null, libelle: x.libelle, is_actif: x.is_actif })),
    sections: c.sections.map((s) => ({ ...s })),
    champs: [...c.champs].sort((a, b) => a.ordre - b.ordre).map((f) => ({ ...f })),
  };
}

/**
 * Administration › Fiche de crise : types de crise proposés, libellés et impression des sections,
 * libellé, caractère obligatoire et ordre des champs. La nature d'un champ (texte, note, adresse…)
 * est fixée par la base de données de l'application.
 */
@Component({
  selector: 'rni-formulaire-config-page',
  imports: [FormsModule, PageHeader, AsyncView, ErrorPanel, Switch],
  template: `
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-3 p-3 desk:p-4">
      <rni-page-header title="Administration — fiche de crise" subtitle="Types de crise, sections et champs de la fiche">
        <ng-container actions>
          @if (dirty()) {
            <span class="text-xs text-amber-700">Modifications non enregistrées</span>
            <button type="button" class="btn-secondary" (click)="cancel()" [disabled]="action.busy()">Annuler</button>
          }
          <button type="button" class="btn-primary" (click)="save()" [disabled]="!dirty() || action.busy()">{{ action.busy() ? 'Enregistrement…' : 'Enregistrer' }}</button>
        </ng-container>
      </rni-page-header>
      <rni-error-panel [error]="action.error()" />

      <rni-async-view [loading]="config.loading()" [pending]="config.pending()" [error]="config.error()" (retry)="load()">
        @if (draft(); as d) {
          <div class="grid grid-cols-1 gap-3 desk:grid-cols-3">
            <section class="card p-3">
              <h2 class="font-semibold">Types de crise</h2>
              <p class="mb-2 text-xs text-slate-500">
                Proposés dans la liste « Type de crise ». « {{ defaut }} » est la valeur par défaut. Renommer ou retirer un type ne modifie pas les fiches déjà enregistrées.
              </p>
              <ul class="flex flex-col gap-1.5">
                @for (c of d.crises; track $index; let i = $index, first = $first, last = $last) {
                  <li class="flex items-center gap-1.5">
                    <input class="input !py-1" maxlength="128" [(ngModel)]="c.libelle" (ngModelChange)="touch()" [disabled]="c.libelle === defaut && c.id_type_crise != null" [attr.aria-label]="'Type de crise ' + (i + 1)" />
                    <rni-switch label="Proposé" [(checked)]="c.is_actif" (checkedChange)="touch()" [disabled]="c.libelle === defaut" />
                    <button type="button" class="btn-ghost px-1.5" (click)="move(d.crises, i, -1)" [disabled]="first" aria-label="Monter">↑</button>
                    <button type="button" class="btn-ghost px-1.5" (click)="move(d.crises, i, 1)" [disabled]="last" aria-label="Descendre">↓</button>
                    <button type="button" class="btn-ghost px-1.5 text-red-700" (click)="removeCrise(i)" [disabled]="c.libelle === defaut" aria-label="Retirer">✕</button>
                  </li>
                }
              </ul>
              <button type="button" class="btn-secondary mt-2" (click)="addCrise()">+ Ajouter un type</button>
            </section>

            <section class="card p-3 desk:col-span-2">
              <h2 class="font-semibold">Sections et champs</h2>
              <p class="mb-2 text-xs text-slate-500">
                Champs marqués obligatoires : saisie exigée avant l'enregistrement de la fiche (le nom ou le prénom reste toujours exigé). Sections imprimables : proposées à l'export PDF.
              </p>
              @for (s of d.sections; track s.id) {
                <div class="mb-3 rounded-md border border-slate-200">
                  <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                    <input class="input max-w-80 !py-1 font-semibold" maxlength="128" [(ngModel)]="s.libelle" (ngModelChange)="touch()" aria-label="Libellé de la section" />
                    <label class="ml-auto flex items-center gap-2 text-xs text-slate-600">
                      Imprimable
                      <rni-switch label="Section imprimable" [(checked)]="s.imprimable" (checkedChange)="touch()" [disabled]="s.id === 'profil'" />
                    </label>
                  </div>
                  <table class="w-full text-sm">
                    <tbody class="divide-y divide-slate-100">
                      @for (f of fieldsOf(s.id); track f.key; let first = $first, last = $last) {
                        <tr>
                          <td class="px-3 py-1.5"><input class="input !py-1" maxlength="128" [(ngModel)]="f.label" (ngModelChange)="touch()" [attr.aria-label]="'Libellé du champ ' + f.key" /></td>
                          <td class="px-2 py-1.5 text-xs whitespace-nowrap text-slate-500">{{ kind(f.kind) }}</td>
                          <td class="px-2 py-1.5 text-xs whitespace-nowrap">
                            @if (f.kind !== 'note' && f.key !== 'nom' && f.key !== 'prenom') {
                              <label class="flex items-center gap-1.5">
                                <rni-switch label="Obligatoire" [(checked)]="f.required" (checkedChange)="touch()" />Obligatoire
                              </label>
                            }
                          </td>
                          <td class="px-2 py-1.5 text-right whitespace-nowrap">
                            <button type="button" class="btn-ghost px-1.5" (click)="moveField(f, -1)" [disabled]="first" aria-label="Monter">↑</button>
                            <button type="button" class="btn-ghost px-1.5" (click)="moveField(f, 1)" [disabled]="last" aria-label="Descendre">↓</button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </section>
          </div>
        }
      </rni-async-view>
    </div>
  `,
})
export class FormulaireConfigPage implements HasUnsavedChanges {
  private readonly api = inject(ParametrageApi);
  private readonly toasts = inject(ToastService);
  private readonly structure = inject(FormulaireConfigService);
  protected readonly config = new AsyncState<FormulaireConfigDto | null>(null);
  protected readonly action = new ActionState();
  protected readonly draft = signal<Draft | null>(null);
  protected readonly defaut = CRISE_PAR_DEFAUT;
  private readonly version = signal(0);

  protected readonly dirty = computed(() => {
    this.version();
    const c = this.config.data();
    return !!c && JSON.stringify(this.draft()) !== JSON.stringify(toDraft(c));
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const c = await this.config.load(() => this.api.formulaire({ silent: true }));
    if (c) this.draft.set(toDraft(c));
  }

  protected touch(): void {
    this.version.update((v) => v + 1);
  }

  protected kind(k: string): string {
    return KIND_LIBELLES[k] ?? k;
  }

  protected fieldsOf(section: string): FormulaireChampDto[] {
    this.version();
    return this.draft()!.champs.filter((f) => f.section === section);
  }

  protected move<T>(list: T[], i: number, delta: number): void {
    const j = i + delta;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.touch();
  }

  /** Déplace un champ au sein de sa section (l'ordre global est renuméroté à l'enregistrement). */
  protected moveField(f: FormulaireChampDto, delta: number): void {
    const champs = this.draft()!.champs;
    const same = champs.filter((x) => x.section === f.section);
    const k = same.indexOf(f);
    const other = same[k + delta];
    if (!other) return;
    const i = champs.indexOf(f);
    const j = champs.indexOf(other);
    [champs[i], champs[j]] = [champs[j], champs[i]];
    this.touch();
  }

  protected addCrise(): void {
    this.draft()!.crises.push({ id_type_crise: null, libelle: '', is_actif: true });
    this.touch();
  }

  protected removeCrise(i: number): void {
    this.draft()!.crises.splice(i, 1);
    this.touch();
  }

  protected cancel(): void {
    const c = this.config.data();
    if (c) this.draft.set(toDraft(c));
    this.action.clear();
  }

  protected async save(): Promise<void> {
    const d = this.draft();
    if (!d) return;
    const body = {
      crises: d.crises.filter((c) => c.libelle.trim()).map((c) => ({ id_type_crise: c.id_type_crise, libelle: c.libelle.trim(), is_actif: c.is_actif })),
      sections: d.sections.map((s) => ({ id: s.id, libelle: s.libelle, imprimable: s.imprimable })),
      champs: d.champs.map((f, i) => ({ key: f.key, label: f.label, required: f.required, ordre: (i + 1) * 10 })),
    };
    const r = await this.action.run(() => this.api.updateFormulaire(body, { silent: true }));
    if (!r.ok) return;
    this.config.set(r.value);
    this.draft.set(toDraft(r.value));
    this.structure.config.set(r.value);
    this.toasts.success('Fiche de crise enregistrée', 'Appliquée aux fiches ouvertes à partir de maintenant.');
  }

  hasUnsavedChanges(): boolean {
    return this.dirty();
  }
}
