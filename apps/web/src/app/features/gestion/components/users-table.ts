import { Component, input, output } from '@angular/core';
import { SortDir, UserDto, UserSort, dedupeNeo } from '@rni/shared';
import { SortHeader } from '../../../shared/ui/sort-header';

interface Column {
  label: string;
  sort?: UserSort;
}

/** Tableau du personnel (présentation seule). */
@Component({
  selector: 'rni-users-table',
  imports: [SortHeader],
  host: { class: 'block overflow-x-auto' },
  template: `
    <table class="w-full text-sm">
      <thead class="bg-slate-50 text-left text-xs text-slate-500 uppercase">
        <tr>
          @for (c of columns; track c.label) {
            @if (c.sort) {
              <th rniSortHeader [active]="sort() === c.sort" [dir]="dir()" (sortToggle)="sortChange.emit(c.sort)">{{ c.label }}</th>
            } @else {
              <th class="px-3 py-2">{{ c.label }}</th>
            }
          }
          <th class="px-3 py-2 text-right">Actions</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        @for (u of users(); track u.id_user) {
          <tr class="hover:bg-slate-50">
            <td class="px-3 py-2"><span class="font-medium">{{ u.abreviation_grade }} {{ u.nom }}</span> {{ u.prenom }}</td>
            <td class="px-3 py-2 font-mono text-xs">{{ u.nigend }}</td>
            <td class="px-3 py-2 text-xs">{{ u.code_unite }} — {{ u.libelle_unite }}</td>
            <td class="px-3 py-2 text-xs">{{ u.libelle_region }}</td>
            <td class="px-3 py-2"><span class="chip bg-rni-100 text-rni-800">{{ u.libelle_profil }}</span></td>
            <td class="px-3 py-2 text-xs text-slate-600">
              <div>NEO : {{ neo(u) }}</div>
              @if (u.tel_perso) {
                <div>Perso : {{ u.tel_perso }}</div>
              }
            </td>
            <td class="px-3 py-2 text-right whitespace-nowrap">
              @if (canManage()(u)) {
                <button type="button" class="btn-ghost px-2" (click)="edit.emit(u)">Modifier</button>
                @if (u.id_user !== currentUserId()) {
                  <button type="button" class="btn-ghost px-2 text-red-700" (click)="remove.emit(u)">Supprimer</button>
                }
              }
            </td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class UsersTable {
  readonly users = input.required<UserDto[]>();
  readonly sort = input<UserSort>('defaut');
  readonly dir = input<SortDir>('asc');
  readonly currentUserId = input<number | null>(null);
  readonly canManage = input<(u: UserDto) => boolean>(() => false);
  readonly sortChange = output<UserSort>();
  readonly edit = output<UserDto>();
  readonly remove = output<UserDto>();

  protected readonly columns: Column[] = [
    { label: 'Personnel', sort: 'nom' },
    { label: 'Nigend', sort: 'nigend' },
    { label: 'Unité', sort: 'unite' },
    { label: 'Région', sort: 'region' },
    { label: 'Profil', sort: 'profil' },
    { label: 'Téléphones' },
  ];

  protected neo(u: UserDto): string {
    const n = dedupeNeo(u.numero_neo_1, u.numero_neo_2);
    return [n.neo1, n.neo2].filter(Boolean).join(' / ') || '—';
  }
}
