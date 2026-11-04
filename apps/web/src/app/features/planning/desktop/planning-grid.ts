import { Component, input, output } from '@angular/core';
import { Creneau, TimetableUserDto } from '@rni/shared';
import { HalfCell } from '../planning-cells';
import { PlanningRow } from './planning-desktop.store';

export interface DayHeader {
  date: string;
  day: number;
  letter: string;
  weekend: boolean;
  today: boolean;
}

export interface CellClick {
  user: TimetableUserDto;
  half: HalfCell;
}

/** Grille mensuelle d'une région : une ligne par personnel, demi-cases Jour / Nuit (BR-PLA-1). */
@Component({
  selector: 'rni-planning-grid',
  host: { class: 'block overflow-x-auto' },
  template: `
    <table class="w-full border-collapse text-xs">
      <thead>
        <tr>
          <th class="sticky left-0 z-10 min-w-56 border-b border-slate-200 bg-white px-2 py-1 text-left font-semibold">Personnel</th>
          @for (h of days(); track h.date) {
            <th class="min-w-7 border-b border-l border-slate-200 px-0 py-1 text-center font-medium" [class.bg-slate-100]="h.weekend" [class.!bg-amber-100]="h.today">
              <div class="text-[10px] text-slate-400">{{ h.letter }}</div>
              {{ h.day }}
            </th>
          }
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track row.user.id_user) {
          @if (row.departementHeader) {
            <tr>
              <td [attr.colspan]="days().length + 1" class="sticky left-0 bg-rni-100/60 px-2 py-0.5 text-[11px] font-semibold text-rni-900">{{ row.departementHeader }}</td>
            </tr>
          }
          <tr class="hover:bg-slate-50">
            <th scope="row" class="sticky left-0 z-10 border-b border-slate-100 bg-white px-2 py-0.5 text-left font-normal whitespace-nowrap">
              <span class="font-medium">{{ row.user.abreviation_grade }} {{ row.user.nom }}</span> {{ row.user.prenom }}
              @if (row.user.id_profil !== 4) {
                <span class="chip ml-1 bg-rni-100 px-1.5 text-[10px] text-rni-800">{{ row.user.libelle_profil }}</span>
              }
            </th>
            @for (c of row.cells; track c.date) {
              <td class="h-7 border-b border-l border-slate-100 p-0" [class.bg-slate-50]="c.weekend" [class.!bg-amber-50]="c.today">
                @if (c.full) {
                  <button type="button" class="block h-7 w-full" [style.background]="c.jour.color" [title]="title(c.jour)" [attr.aria-label]="title(c.jour)" [disabled]="!row.editable" [class.cursor-pointer]="row.editable" (click)="cellClick.emit({ user: row.user, half: c.jour })"></button>
                } @else {
                  <button type="button" class="block h-3.5 w-full border-b border-white/70" [style.background]="c.jour.color || '#e2e8f0'" [title]="title(c.jour)" [attr.aria-label]="title(c.jour)" [disabled]="!row.editable" [class.cursor-pointer]="row.editable" (click)="cellClick.emit({ user: row.user, half: c.jour })"></button>
                  <button type="button" class="block h-3.5 w-full" [style.background]="c.nuit.color || '#cbd5e1'" [title]="title(c.nuit)" [attr.aria-label]="title(c.nuit)" [disabled]="!row.editable" [class.cursor-pointer]="row.editable" (click)="cellClick.emit({ user: row.user, half: c.nuit })"></button>
                }
              </td>
            }
          </tr>
        } @empty {
          <tr><td [attr.colspan]="days().length + 1" class="px-3 py-4 text-center text-slate-500">Aucun personnel ne correspond.</td></tr>
        }
      </tbody>
    </table>
  `,
})
export class PlanningGrid {
  readonly rows = input.required<PlanningRow[]>();
  readonly days = input.required<DayHeader[]>();
  /** Libellé d'une position (pour l'infobulle). */
  readonly libelle = input<(id: number) => string>((id) => String(id));
  readonly cellClick = output<CellClick>();

  protected title(h: HalfCell): string {
    const date = h.date.split('-').reverse().join('/');
    const cr = h.creneau === Creneau.JOUR ? 'Jour' : 'Nuit';
    const p = h.planning;
    if (!p) return `${date} ${cr} — aucun planning`;
    return `${date} ${cr} — ${this.libelle()(p.id_pos_service)}${p.adresse_temp ? ' — ' + p.adresse_temp : ''}`;
  }
}
