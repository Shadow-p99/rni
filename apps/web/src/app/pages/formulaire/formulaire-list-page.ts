import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { FormulaireDto } from '@rni/shared';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { FormulaireApi } from '../../core/data.service';
import { ReferentielService } from '../../core/referentiel.service';

/** Liste des fiches de crise (§6.3) — filtrage région / état / dates appliqué côté API. */
@Component({
  selector: 'rni-formulaire-list-page',
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-3 p-3 desk:p-4">
      <div class="card flex flex-wrap items-end gap-3 p-3">
        <h1 class="mr-4 self-center text-lg font-semibold">Fiches de crise</h1>
        @if (auth.isGign()) {
          <div>
            <label class="label" for="f-region">Région</label>
            <select id="f-region" class="input w-56" [(ngModel)]="region" (ngModelChange)="load()">
              <option [ngValue]="null">Toutes</option>
              @for (r of ref.allRegions(); track r.id_region) {
                <option [ngValue]="r.id_region">{{ r.libelle }}</option>
              }
            </select>
          </div>
        }
        <div>
          <label class="label" for="f-etat">État</label>
          <select id="f-etat" class="input w-40" [(ngModel)]="closed" (ngModelChange)="load()">
            <option [ngValue]="null">Toutes</option>
            <option [ngValue]="false">Actives</option>
            <option [ngValue]="true">Clôturées</option>
          </select>
        </div>
        <div>
          <label class="label" for="f-from">Modifiées du</label>
          <input id="f-from" type="date" class="input" [(ngModel)]="from" (change)="load()" />
        </div>
        <div>
          <label class="label" for="f-to">au</label>
          <input id="f-to" type="date" class="input" [(ngModel)]="to" (change)="load()" />
        </div>
        <a routerLink="/formulaire/new" class="btn-primary ml-auto">+ Nouvelle fiche</a>
      </div>

      <div class="card overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th class="px-3 py-2">Individu</th>
              <th class="px-3 py-2">Crise</th>
              <th class="px-3 py-2">Lieu</th>
              <th class="px-3 py-2">Auteur</th>
              <th class="px-3 py-2">Dernière modification</th>
              <th class="px-3 py-2">État</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (f of fiches(); track f.id_formulaire) {
              <tr class="cursor-pointer hover:bg-slate-50" [routerLink]="['/formulaire', f.id_formulaire]">
                <td class="px-3 py-2 font-medium">{{ f['nom'] }} {{ f['prenom'] }}</td>
                <td class="px-3 py-2">{{ f['crise'] }}</td>
                <td class="max-w-64 truncate px-3 py-2 text-xs">{{ f['terrain_adresse'] ?? f['terrain_localisation'] ?? '—' }}</td>
                <td class="px-3 py-2 text-xs">{{ f.auteur_nom }}<br /><span class="text-slate-500">{{ ref.regionLibelle(f.auteur_id_region) }}</span></td>
                <td class="px-3 py-2 text-xs">{{ f.updated_at | date: 'dd/MM/yyyy HH:mm' }}</td>
                <td class="px-3 py-2">
                  @if (f.is_closed) {
                    <span class="chip bg-slate-200 text-slate-700">Clôturée</span>
                  } @else {
                    <span class="chip bg-green-100 text-green-800">Active</span>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="px-3 py-6 text-center text-slate-500">{{ loading() ? 'Chargement…' : 'Aucune fiche.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class FormulaireListPage {
  protected readonly auth = inject(AuthService);
  protected readonly ref = inject(ReferentielService);
  private readonly api = inject(FormulaireApi);
  protected readonly fiches = signal<FormulaireDto[]>([]);
  protected readonly loading = signal(false);
  protected region: number | null = null;
  protected closed: boolean | null = null;
  protected from = '';
  protected to = '';

  constructor() {
    void this.ref.load();
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.fiches.set(
        await firstValueFrom(
          this.api.list({ region: this.region ?? undefined, closed: this.closed ?? undefined, from: this.from || undefined, to: this.to || undefined }),
        ),
      );
    } finally {
      this.loading.set(false);
    }
  }
}
