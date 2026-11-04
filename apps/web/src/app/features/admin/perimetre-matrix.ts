import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { PERIMETRES, PERIMETRE_LIBELLES, PERIMETRE_MODULES, PERIMETRE_MODULE_LIBELLES, Perimetre, PerimetreModule, PerimetreProfilDto } from '@rni/shared';

export interface PerimetreChange {
  row: PerimetreProfilDto;
  module: PerimetreModule;
  perimetre: Perimetre;
}

/** Tableau profils × modules (carte, planning) avec le choix du périmètre. */
@Component({
  selector: 'rni-perimetre-matrix',
  imports: [DatePipe],
  host: { class: 'block overflow-x-auto' },
  template: `
    <table class="w-full text-sm">
      <thead class="bg-slate-50 text-left text-xs text-slate-500 uppercase">
        <tr>
          <th class="px-3 py-2">Profil</th>
          @for (m of modules; track m) {
            <th class="px-3 py-2">{{ moduleLabels[m] }}</th>
          }
          <th class="px-3 py-2">Dernière modification</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        @for (row of rows(); track row.id_profil) {
          <tr [class.bg-slate-50]="row.locked">
            <th scope="row" class="px-3 py-2 text-left font-medium">
              {{ row.libelle_profil }}
              @if (row.locked) {
                <span class="block text-xs font-normal text-slate-500">Toujours national (non modifiable)</span>
              }
            </th>
            @for (m of modules; track m) {
              <td class="px-3 py-2">
                <select
                  class="input"
                  [class.!border-amber-500]="changed()(row, m)"
                  [class.!bg-amber-50]="changed()(row, m)"
                  [value]="value()(row, m)"
                  [disabled]="row.locked || disabled()"
                  [attr.aria-label]="moduleLabels[m] + ' — ' + row.libelle_profil"
                  (change)="change.emit({ row, module: m, perimetre: $any($event.target).value })"
                >
                  @for (p of perimetres; track p) {
                    <option [value]="p" [selected]="p === value()(row, m)">{{ labels[p] }}</option>
                  }
                </select>
              </td>
            }
            <td class="px-3 py-2 text-xs text-slate-500">
              @if (row.updated_by && row.updated_at) {
                {{ row.updated_at | date: 'dd/MM/yyyy HH:mm' }} — {{ row.updated_by }}
              } @else {
                Valeur initiale
              }
            </td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class PerimetreMatrix {
  readonly rows = input.required<PerimetreProfilDto[]>();
  readonly value = input.required<(row: PerimetreProfilDto, m: PerimetreModule) => Perimetre>();
  readonly changed = input<(row: PerimetreProfilDto, m: PerimetreModule) => boolean>(() => false);
  readonly disabled = input(false);
  readonly change = output<PerimetreChange>();

  protected readonly modules = PERIMETRE_MODULES;
  protected readonly moduleLabels = PERIMETRE_MODULE_LIBELLES;
  protected readonly perimetres = PERIMETRES;
  protected readonly labels = PERIMETRE_LIBELLES;
}
