import { Component, HostListener, computed, inject, input, output } from '@angular/core';
import { Creneau, PlageBounds, TimetableUserDto, toSlot } from '@rni/shared';
import { ConfigService } from '../../../core/config/config.service';
import { RangeSelection, rangeToPlage } from './range-selection';
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

/** Période sélectionnée par glisser sur la ligne d'un agent. */
export interface RangeSelect {
  user: TimetableUserDto;
  plage: PlageBounds;
}

/**
 * Grille mensuelle d'une région : une ligne par personnel, demi-cases Jour / Nuit (BR-PLA-1).
 * Clic : ouvre la plage (ou crée un créneau). Clic-glisser sur la ligne d'un agent : sélectionne
 * plusieurs créneaux et émet `rangeSelect` au relâchement (souris et tactile).
 */
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
            <th scope="row" class="sticky left-0 z-10 border-b border-slate-400 bg-white px-2 py-0.5 text-left font-normal whitespace-nowrap">
              <span class="font-medium">{{ row.user.abreviation_grade }} {{ row.user.nom }}</span> {{ row.user.prenom }}
              @if (row.user.id_profil !== 4) {
                <span class="chip ml-1 bg-rni-100 px-1.5 text-[10px] text-rni-800">{{ row.user.libelle_profil }}</span>
              }
            </th>
            @for (c of row.cells; track c.date) {
              <!-- Bas de ligne foncé : distingue deux personnels de la séparation Jour / Nuit (blanche) -->
              <td class="h-7 border-b border-l border-l-slate-100 border-b-slate-400 p-0" [class.bg-slate-50]="c.weekend" [class.!bg-amber-50]="c.today">
                <!-- Toujours deux demi-cases séparées : Jour (haut) et Nuit (bas) -->
                @for (h of [c.jour, c.nuit]; track h.slot) {
                  <button
                    type="button"
                    class="block h-3.5 w-full"
                    [class.border-b]="h.creneau === 1"
                    [class.border-white]="h.creneau === 1"
                    [class.rni-cell-selected]="selected(row.user.id_user, h.slot)"
                    [class.rni-cell-frozen]="h.slot < minSlot()"
                    [class.cursor-pointer]="row.editable"
                    [class.touch-none]="row.editable"
                    [style.background-color]="h.color || (h.creneau === 1 ? '#e2e8f0' : '#cbd5e1')"
                    [title]="title(h)"
                    [attr.aria-label]="title(h)"
                    [attr.data-user]="row.user.id_user"
                    [attr.data-slot]="h.slot"
                    [disabled]="!row.editable"
                    (pointerdown)="onPointerDown($event, row.user, h)"
                    (click)="onKeyboardClick($event, row.user, h)"
                  ></button>
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
  readonly rangeSelect = output<RangeSelect>();

  private readonly config = inject(ConfigService);
  /** BR-PLA-3 : premier créneau modifiable ; les demi-cases antérieures sont figées (consultation). */
  protected readonly minSlot = computed(() => toSlot(this.config.planningMinDate(), Creneau.JOUR));

  private readonly selection = new RangeSelection();
  /** Demi-case de départ (pour le simple clic) et agent concerné. */
  private origin: { user: TimetableUserDto; half: HalfCell } | null = null;

  protected selected(userId: number, slot: number): boolean {
    return this.selection.contains(userId, slot);
  }

  /** Demi-case (agent, créneau) sous le pointeur. */
  private slotAt(target: Element | null): { userId: number; slot: number } | null {
    const el = target?.closest<HTMLElement>('[data-slot]');
    return el ? { userId: Number(el.dataset['user']), slot: Number(el.dataset['slot']) } : null;
  }

  onPointerDown(e: PointerEvent, user: TimetableUserDto, half: HalfCell): void {
    if (e.button !== 0) return;
    e.preventDefault(); // pas de sélection de texte pendant le glisser
    this.origin = { user, half };
    this.selection.start(user.id_user, half.slot);
    // Le tactile capture le pointeur sur l'élément de départ : on le relâche pour suivre le doigt.
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  }

  @HostListener('document:pointermove', ['$event'])
  onPointerMove(e: PointerEvent): void {
    if (!this.selection.active()) return;
    const at = this.slotAt(document.elementFromPoint(e.clientX, e.clientY));
    // Planning figé : pas de sélection depuis une case figée, et la sélection s'arrête à la borne
    if (!at || !this.origin || this.origin.half.slot < this.minSlot()) return;
    this.selection.move(at.userId, Math.max(at.slot, this.minSlot()));
  }

  @HostListener('document:pointerup')
  onPointerUp(): void {
    if (!this.selection.active() || !this.origin) return;
    const range = this.selection.end();
    const { user, half } = this.origin;
    this.origin = null;
    if (!range) return;
    if (range.start === range.end) this.cellClick.emit({ user, half });
    else this.rangeSelect.emit({ user, plage: rangeToPlage(range) });
  }

  @HostListener('document:pointercancel')
  @HostListener('document:keydown.escape')
  onCancel(): void {
    this.selection.cancel();
    this.origin = null;
  }

  /** Clavier (Entrée / Espace) : le clic souris est géré par les événements de pointeur. */
  onKeyboardClick(e: MouseEvent, user: TimetableUserDto, half: HalfCell): void {
    if (e.detail === 0) this.cellClick.emit({ user, half });
  }

  protected title(h: HalfCell): string {
    const date = h.date.split('-').reverse().join('/');
    const cr = h.creneau === Creneau.JOUR ? 'Jour' : 'Nuit';
    const p = h.planning;
    const fige = h.slot < this.minSlot() ? ' (figé)' : '';
    if (!p) return `${date} ${cr} — aucun planning${fige}`;
    return `${date} ${cr} — ${this.libelle()(p.id_pos_service)}${p.adresse_temp ? ' — ' + p.adresse_temp : ''}${fige}`;
  }
}
