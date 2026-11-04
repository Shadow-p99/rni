import { Component, inject, input, model } from '@angular/core';
import { ReferentielService } from '../../core/referentiel/referentiel.service';

/** Valeur représentant « sans planning » dans un filtre de positions. */
export const SANS_PLANNING = 0;

/** Filtre multi-sélection des positions de service (pastilles colorées). */
@Component({
  selector: 'rni-position-filter',
  host: { class: 'flex flex-wrap items-center gap-1 text-xs', role: 'group', '[attr.aria-label]': 'label() || "Positions de service"' },
  template: `
    @if (label()) {
      <span class="text-slate-500">{{ label() }}</span>
    }
    @for (p of ref.positions(); track p.id_pos_service) {
      @let on = value().has(p.id_pos_service);
      <button type="button" class="chip border" [attr.aria-pressed]="on" [style.borderColor]="p.color" [style.background]="on ? p.color : 'transparent'" [style.color]="on ? '#fff' : p.color" (click)="toggle(p.id_pos_service)">
        {{ p.libelle }}
      </button>
    }
    @if (withNone()) {
      @let none = value().has(SANS_PLANNING);
      <button type="button" class="chip border border-slate-400" [attr.aria-pressed]="none" [class.bg-slate-500]="none" [class.text-white]="none" (click)="toggle(SANS_PLANNING)">Sans planning</button>
    }
    @if (clearable() && value().size) {
      <button type="button" class="text-slate-500 underline" (click)="clear()">tout</button>
    }
  `,
})
export class PositionFilter {
  protected readonly ref = inject(ReferentielService);
  protected readonly SANS_PLANNING = SANS_PLANNING;
  readonly label = input('');
  readonly withNone = input(false);
  /** Affiche « tout » pour vider le filtre (filtre vide = toutes les positions). */
  readonly clearable = input(false);
  readonly value = model<Set<number>>(new Set());

  toggle(id: number): void {
    const s = new Set(this.value());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.value.set(s);
  }

  clear(): void {
    this.value.set(new Set());
  }
}
