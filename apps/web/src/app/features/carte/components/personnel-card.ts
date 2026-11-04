import { DatePipe } from '@angular/common';
import { Component, computed, input, model, output } from '@angular/core';
import { PersonnelPointProperties, dedupeNeo } from '@rni/shared';

/** Fiche informative au clic (§4.3) ; navigation numérotée si plusieurs personnes au même endroit. */
@Component({
  selector: 'rni-personnel-card',
  imports: [DatePipe],
  host: { class: 'card flex flex-col overflow-hidden shadow-xl', role: 'dialog', 'aria-label': 'Fiche du personnel' },
  template: `
    @if (selected(); as p) {
      <header class="flex items-start gap-2 border-b border-slate-200 p-3">
        <div class="flex-1">
          <p class="font-semibold text-slate-800">{{ p.grade }} {{ p.prenom }} {{ p.nom }}</p>
          <p class="text-xs text-slate-500">{{ p.code_unite }} — {{ p.libelle_unite }}</p>
        </div>
        <button type="button" class="btn-ghost px-2" (click)="closed.emit()" aria-label="Fermer la fiche">✕</button>
      </header>
      @if (people().length > 1) {
        <div class="flex flex-wrap gap-1 border-b border-slate-200 p-2" role="tablist" aria-label="Personnes au même endroit">
          @for (s of people(); track s.id_user; let i = $index) {
            <button type="button" role="tab" class="size-7 rounded-full border-2 text-xs font-bold text-white" [style.background]="s.color" [class.border-slate-900]="i === index()" [class.border-white]="i !== index()" [attr.aria-selected]="i === index()" [title]="s.prenom + ' ' + s.nom" (click)="index.set(i)">
              {{ i + 1 }}
            </button>
          }
        </div>
      }
      <dl class="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        <div>
          <dt class="text-xs text-slate-500">Position de service</dt>
          <dd><span class="chip text-white" [style.background]="p.color">{{ p.id_planning ? p.libelle_pos_service : 'Sans planning' }}</span></dd>
        </div>
        <div>
          <dt class="text-xs text-slate-500">Adresse</dt>
          <dd>
            @switch (p.adresse_type) {
              @case ('localisation') {
                <span class="font-medium">Localisé via NEO le {{ p.horodatage | date: 'dd/MM/yyyy' }} à {{ p.horodatage | date: 'HH:mm' }}</span>
              }
              @case ('temporaire') {
                <span class="text-xs text-slate-500">(adresse temporaire)</span> {{ p.adresse }}
              }
              @default {
                <span class="text-xs text-slate-500">(unité)</span> {{ p.adresse ?? '—' }}
              }
            }
          </dd>
        </div>
        <div>
          <dt class="text-xs text-slate-500">Coordonnées GPS</dt>
          <dd class="font-mono text-xs">{{ coords() }}</dd>
        </div>
        @for (t of phones(); track t.label) {
          <div>
            <dt class="text-xs text-slate-500">{{ t.label }}</dt>
            <dd><a class="text-rni-700 underline-offset-2 hover:underline" [href]="'tel:' + t.tel">{{ t.value }}</a></dd>
          </div>
        }
        @if (p.commentaire) {
          <div>
            <dt class="text-xs text-slate-500">Commentaire</dt>
            <dd class="whitespace-pre-line">{{ p.commentaire }}</dd>
          </div>
        }
      </dl>
    }
  `,
})
export class PersonnelCard {
  readonly people = input.required<PersonnelPointProperties[]>();
  readonly index = model(0);
  /** Coordonnées [lng, lat] par id_user. */
  readonly coordsOf = input<(idUser: number) => [number, number] | null>(() => null);
  readonly closed = output<void>();

  protected readonly selected = computed(() => this.people()[this.index()] ?? null);
  protected readonly coords = computed(() => {
    const p = this.selected();
    const c = p ? this.coordsOf()(p.id_user) : null;
    return c ? `${c[1].toFixed(5)}, ${c[0].toFixed(5)}` : '—';
  });
  /** §4.3 : NEO 1/2 (dédoublonnés), personnel, unité — cliquables (`tel:`). */
  protected readonly phones = computed(() => {
    const p = this.selected();
    if (!p) return [];
    const n = dedupeNeo(p.numero_neo_1, p.numero_neo_2);
    return [
      { label: 'Téléphone NEO 1', value: n.neo1 },
      { label: 'Téléphone NEO 2', value: n.neo2 },
      { label: 'Téléphone personnel', value: p.tel_perso },
      { label: 'Téléphone unité', value: p.tel_unite },
    ]
      .filter((t): t is { label: string; value: string } => !!t.value)
      .map((t) => ({ ...t, tel: t.value.replace(/[^\d+]/g, '') }));
  });
}
