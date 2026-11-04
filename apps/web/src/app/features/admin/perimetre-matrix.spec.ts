import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Perimetre, PerimetreModule, PerimetreProfilDto } from '@rni/shared';
import { PerimetreChange, PerimetreMatrix } from './perimetre-matrix';

const rows: PerimetreProfilDto[] = [
  { id_profil: 3, libelle_profil: 'Référent', carte: 'region_voisines', planning: 'region', locked: false, updated_at: null, updated_by: null },
];

@Component({
  imports: [PerimetreMatrix],
  template: `<rni-perimetre-matrix [rows]="rows" [value]="value" (perimetreChange)="received.push($event)" />`,
})
class Host {
  rows = rows;
  received: unknown[] = [];
  value = (row: PerimetreProfilDto, m: PerimetreModule): Perimetre => row[m];
}

describe('PerimetreMatrix', () => {
  it('un changement de liste émet un seul événement, avec la ligne (régression : événement natif « change » remonté)', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const select = fixture.nativeElement.querySelector('select[aria-label="Planning — Référent"]') as HTMLSelectElement;
    select.value = 'national';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const received = fixture.componentInstance.received as PerimetreChange[];
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ row: rows[0], module: 'planning', perimetre: 'national' });
  });
});
