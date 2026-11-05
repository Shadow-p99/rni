import { DatePipe } from '@angular/common';
import { Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { FormulaireDto } from '@rni/shared';
import { ReferentielService } from '../../../core/referentiel/referentiel.service';

/** Tableau des fiches de crise. */
@Component({
  selector: 'rni-formulaire-table',
  imports: [DatePipe, RouterLink],
  host: { class: 'block overflow-x-auto' },
  template: `
    <table class="w-full text-sm">
      <thead class="bg-slate-50 text-left text-xs text-slate-500 uppercase">
        <tr>
          <th class="px-3 py-2">Individu</th>
          <th class="px-3 py-2">Crise</th>
          <th class="px-3 py-2">Lieu</th>
          <th class="px-3 py-2">Auteur</th>
          <th class="px-3 py-2">Dernière modification</th>
          <th class="px-3 py-2">État</th>
          <th class="px-3 py-2 text-right"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        @for (f of fiches(); track f.id_formulaire) {
          <tr class="hover:bg-slate-50">
            <td class="px-3 py-2 font-medium"><a class="text-rni-700 hover:underline" [routerLink]="['/formulaire', f.id_formulaire]">{{ f['nom'] }} {{ f['prenom'] }}</a></td>
            <td class="px-3 py-2">{{ f['crise'] }}</td>
            <td class="max-w-64 truncate px-3 py-2 text-xs">{{ f['terrain_adresse'] ?? f['terrain_localisation'] ?? '—' }}</td>
            <td class="px-3 py-2 text-xs">{{ f.auteur_nom }}<br /><span class="text-slate-500">{{ ref.regionLibelle(f.auteur_id_region) }}</span></td>
            <td class="px-3 py-2 text-xs">{{ f.updated_at | date: 'dd/MM/yyyy HH:mm' }}</td>
            <td class="px-3 py-2">
              <span class="chip" [class]="f.is_closed ? 'bg-slate-200 text-slate-700' : 'bg-green-100 text-green-800'">{{ f.is_closed ? 'Clôturée' : 'Active' }}</span>
            </td>
            <td class="px-3 py-2 text-right whitespace-nowrap">
              @if (f.can_cloturer) {
                <button type="button" class="btn-ghost px-2 py-1 text-xs text-amber-700" [disabled]="busy() === f.id_formulaire" (click)="closeRequest.emit(f)">
                  🔒 {{ busy() === f.id_formulaire ? 'Clôture…' : 'Clôturer' }}
                </button>
              }
            </td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class FormulaireTable {
  protected readonly ref = inject(ReferentielService);
  readonly fiches = input.required<FormulaireDto[]>();
  /** Fiche en cours de clôture. */
  readonly busy = input<number | null>(null);
  /** Clôture demandée (droit `formulaire.cloturer`, calculé par l'API pour chaque fiche). */
  readonly closeRequest = output<FormulaireDto>();
}
