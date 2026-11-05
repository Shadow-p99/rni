import { ComponentRef, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Creneau, PlanningDto } from '@rni/shared';
import { AuthService } from '../../../core/auth/auth.service';
import { ConfigService } from '../../../core/config/config.service';
import { ReferentielService } from '../../../core/referentiel/referentiel.service';
import { ConfirmService } from '../../../shared/ui/confirm';
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

  async function open(init: PlanningFormInit, params: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { profil: signal(3), user: signal({ id_user: 1, nigend: '200073', prenom: 'C', nom: 'F' }), canWritePlanning: () => true, planningSoiSeul: () => false, canRestrictedPositions: () => true },
        },
        { provide: ReferentielService, useValue: { activePositions: () => positions, positions: () => positions, restrictedPositions: () => [4, 5], libelle: (id: number) => positions.find((p) => p.id_pos_service === id)?.libelle ?? '' } },
      ],
    });
    TestBed.inject(ConfigService).params.set(params);
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

  describe('suppression', () => {
    const button = (label: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim() === label) as HTMLButtonElement | undefined;
    const flushAsync = () => new Promise((r) => setTimeout(r));

    it('« Supprimer ce créneau » : aperçu, confirmation, puis suppression de la seule demi-journée', async () => {
      const fixture = await open({ planning: plage, slot: { date: '2030-12-08', creneau: Creneau.NUIT } });
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
      expect(button('Supprimer toute la plage')).toBeUndefined();
      button('Supprimer ce créneau')!.click();
      const ov = ctrl.expectOne((r) => r.url === '/rni/api/planning/overlaps');
      expect(ov.request.params.get('date_debut')).toBe('2030-12-08');
      expect(ov.request.params.get('id_creneaux_debut')).toBe('2');
      ov.flush([plage]);
      await flushAsync();
      expect(ask).toHaveBeenCalledWith('Supprimer ce créneau', expect.stringContaining('du 08/12/2030 (Nuit) au 08/12/2030 (Nuit)'), expect.anything());
      const clear = ctrl.expectOne('/rni/api/planning/clear');
      expect(clear.request.body).toEqual({ nigend: '200074', date_debut: '2030-12-08', id_creneaux_debut: 2, date_fin: '2030-12-08', id_creneaux_fin: 2 });
      let saved = false;
      fixture.componentInstance.saved.subscribe(() => (saved = true));
      clear.flush({ supprimees: 1, conservees: 2 });
      await flushAsync();
      expect(saved).toBe(true);
    });

    it('« Toute la plage » : bouton de suppression de la plage entière', async () => {
      const fixture = await open({ planning: plage, slot: { date: '2030-12-08', creneau: Creneau.NUIT } });
      (Array.from(el.querySelectorAll('[role=radio]')).find((b) => b.textContent!.includes('Toute la plage')) as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(button('Supprimer toute la plage')).toBeDefined();
      expect(button('Supprimer ce créneau')).toBeUndefined();
    });

    it('« Supprimer la sélection » après un glisser ; sélection vide : message, aucune suppression', async () => {
      const fixture = await open({ user: { nigend: '200074', label: 'x' }, range: { date_debut: '2030-12-20', id_creneaux_debut: 2, date_fin: '2030-12-22', id_creneaux_fin: 1 } });
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask');
      button('Supprimer la sélection')!.click();
      ctrl.expectOne((r) => r.url === '/rni/api/planning/overlaps').flush([]);
      await flushAsync();
      fixture.detectChanges();
      expect(ask).not.toHaveBeenCalled();
      ctrl.expectNone('/rni/api/planning/clear');
      expect(el.textContent).toContain('rien à supprimer');
    });

    it('création simple (sans sélection) : pas de bouton de suppression', async () => {
      await open({ user: { nigend: '200074', label: 'x' }, date: '2030-12-20', creneau: Creneau.JOUR });
      expect(button('Supprimer la sélection')).toBeUndefined();
    });
  });
  describe('planning figé (jours glissants)', () => {
    const day = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const jours = { 'rni.planning.jours_glissants': '3' };
    const longue: PlanningDto = { ...plage, date_debut: day(-6), date_fin: day(4) };

    it('demi-journée figée : consultation seule, avec le motif', async () => {
      await open({ planning: longue, slot: { date: day(-5), creneau: Creneau.JOUR } }, jours);
      expect(el.textContent).toContain('Le planning est figé avant le');
      expect(el.textContent).toContain('3 jour(s) glissant(s)');
      expect(el.querySelector('[role=radio]')).toBeNull();
      expect((el.querySelector('#pf-d1') as HTMLInputElement).disabled).toBe(true);
      expect(Array.from(el.querySelectorAll('button')).some((b) => b.textContent!.trim() === 'Enregistrer')).toBe(false);
    });

    it('plage commencée avant la borne : seul « Ce créneau » est proposé', async () => {
      await open({ planning: longue, slot: { date: day(1), creneau: Creneau.NUIT } }, jours);
      const modes = Array.from(el.querySelectorAll('[role=radio]')).map((b) => b.textContent!.trim());
      expect(modes).toHaveLength(1);
      expect(modes[0]).toContain('Ce créneau');
      expect(el.textContent).toContain('planning figé');
      expect(Array.from(el.querySelectorAll('button')).some((b) => b.textContent!.trim() === 'Supprimer toute la plage')).toBe(false);
      expect((el.querySelector('#pf-d1') as HTMLInputElement).min).toBe(day(-3));
    });

    it('création sur une case figée : refusée ; sans paramètre, règle M-1', async () => {
      await open({ user: { nigend: '200074', label: 'X' }, date: day(-4), creneau: Creneau.JOUR }, jours);
      expect(el.textContent).toContain('Le planning est figé avant le');
      TestBed.resetTestingModule();
      await open({ user: { nigend: '200074', label: 'X' }, date: day(-4), creneau: Creneau.JOUR });
      expect(el.textContent).not.toContain('figé');
    });
  });
});
