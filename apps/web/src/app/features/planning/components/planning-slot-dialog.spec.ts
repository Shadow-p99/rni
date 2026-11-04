import { ComponentRef, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Creneau, PlanningDto } from '@rni/shared';
import { AuthService } from '../../../core/auth/auth.service';
import { ReferentielService } from '../../../core/referentiel/referentiel.service';
import { PlanningFormInit, PlanningSlotDialog } from './planning-slot-dialog';

/** Plage multi-jours, par ex. créée par glisser-déposer : du 05/12 Jour au 12/12 Jour, En service. */
const plage: PlanningDto = {
  id_planning: 42, id_user: 7, nigend: '200074', date_debut: '2030-12-05', id_creneaux_debut: 1, date_fin: '2030-12-12', id_creneaux_fin: 1,
  id_pos_service: 3, adresse_temp: null, x_adresse_temp: null, y_adresse_temp: null,
};
const positions = [1, 2, 3].map((id) => ({ id_pos_service: id, libelle: ['', 'Disponible', 'Indisponible', 'En service'][id], color: '#000', is_actif: true }));

describe('PlanningSlotDialog : clic sur une demi-journée d’une plage', () => {
  let ref: ComponentRef<PlanningSlotDialog>;
  let el: HTMLElement;
  let ctrl: HttpTestingController;

  async function open(init: PlanningFormInit) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { profil: signal(3), user: signal({ id_user: 1, nigend: '200073', prenom: 'C', nom: 'F' }), canWritePlanning: () => true },
        },
        { provide: ReferentielService, useValue: { activePositions: () => positions, libelle: (id: number) => positions.find((p) => p.id_pos_service === id)?.libelle ?? '' } },
      ],
    });
    const fixture = TestBed.createComponent(PlanningSlotDialog);
    ref = fixture.componentRef;
    ref.setInput('init', init);
    fixture.detectChanges();
    await fixture.whenStable();
    el = fixture.nativeElement;
    ctrl = TestBed.inject(HttpTestingController);
    return fixture;
  }
  const val = (id: string) => (el.querySelector(id) as HTMLInputElement).value;
  /** Libellé affiché d'une liste déroulante. */
  const shown = (id: string) => {
    const sel = el.querySelector(id) as HTMLSelectElement;
    return sel.options[sel.selectedIndex].text.trim();
  };

  it('ouvre sur « Ce créneau » avec la seule demi-journée cliquée', async () => {
    await open({ planning: plage, slot: { date: '2030-12-08', creneau: Creneau.NUIT } });
    const pressed = el.querySelector('[role=radio][aria-checked=true]')!.textContent!.trim();
    expect(pressed).toBe('Ce créneau (08/12 Nuit)');
    expect([val('#pf-d1'), shown('#pf-c1'), val('#pf-d2'), shown('#pf-c2')]).toEqual(['2030-12-08', 'Nuit (18h-08h)', '2030-12-08', 'Nuit (18h-08h)']);
    expect(el.textContent).toContain('le reste de la plage');
  });

  it('enregistrer : insertion limitée à ce créneau, le reste de la plage est conservé', async () => {
    const fixture = await open({ planning: plage, slot: { date: '2030-12-08', creneau: Creneau.NUIT } });
    const pos = el.querySelector('#pf-pos') as HTMLSelectElement;
    pos.value = pos.options[2].value; // Indisponible
    pos.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const req = ctrl.expectOne('/rni/api/planning/insert');
    expect(req.request.body).toMatchObject({ id_planning: 42, date_debut: '2030-12-08', id_creneaux_debut: 2, date_fin: '2030-12-08', id_creneaux_fin: 2, id_pos_service: 2 });
  });

  it('« Toute la plage » reste accessible', async () => {
    const fixture = await open({ planning: plage, slot: { date: '2030-12-08', creneau: Creneau.NUIT } });
    (Array.from(el.querySelectorAll('[role=radio]')).find((b) => b.textContent!.includes('Toute la plage')) as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect([val('#pf-d1'), val('#pf-d2')]).toEqual(['2030-12-05', '2030-12-12']);
  });

  it('plage d’un seul créneau : modification directe de la plage', async () => {
    await open({ planning: { ...plage, date_fin: '2030-12-05' }, slot: { date: '2030-12-05', creneau: Creneau.JOUR } });
    expect(el.querySelector('[role=radio][aria-checked=true]')!.textContent!.trim()).toBe('Modifier la plage');
  });
});
