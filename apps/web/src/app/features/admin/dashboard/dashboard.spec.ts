import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AdminDashboardDto } from '@rni/shared';
import { fmtAgo, fmtMs } from '../format';
import { DashboardPage, availabilityTone, errorsTone, latencyTone } from './dashboard-page';
import { niceScale } from './time-chart';

const hour = (i: number) => new Date(Date.UTC(2026, 10, 4, i)).toISOString();
export const DASHBOARD: AdminDashboardDto = {
  genere_le: hour(12),
  fenetre_connexion_min: 5,
  kpis: {
    connectes: 3, utilisateurs_jour: 12, requetes_jour: 1284, requetes_par_minute: 4.2, erreurs_jour: 2, erreurs_5xx_jour: 1,
    journal_erreurs_jour: 2, avertissements_jour: 5, refus_jour: 7, lentes_jour: 0, seuil_lent_ms: 1000,
    temps_moyen_jour_ms: 42, temps_moyen_heure_ms: 38, p95_jour_ms: 100, disponibilite_jour: 99.92,
  },
  heures: Array.from({ length: 24 }, (_, i) => ({ heure: hour(i), nb: i * 10, nb_4xx: 0, nb_5xx: 0, moyenne_ms: i ? 30 + i : null, max_ms: 80 })),
  routes: [{ methode: 'GET', route: '/planning/timetable', nb: 400, nb_5xx: 0, moyenne_ms: 55, max_ms: 210, p95_ms: 100, part_temps: 61.5 }],
  connectes: [{ nigend: '200073', grade: 'LTN', nom: 'FOURNIER', prenom: 'Céline', libelle_profil: 'Référent', libelle_region: 'Île-de-France', derniere_activite: hour(12), derniere_route: '/planning/timetable', nb_requetes_jour: 40 }],
  dernieres_erreurs: [{ id_log: 9, horodatage: hour(11), niveau: 'error', contexte: 'ErrorHandler', message: 'GET /x → RNI-0000', pile: null, request_id: 'abc-123-def', nigend: null, pid: 1, hote: 'h' }],
  metier: { plannings_crees_jour: 8, plannings_modifies_jour: 3, comptes_actifs: 92, comptes_par_profil: [{ libelle: 'Négociateur', nb: 60 }], fiches_ouvertes: 2, fiches_creees_jour: 1 },
  systeme: {
    version: '2.0.0', environnement: 'production', node: 'v22', pid: 1, hote: 'h', demarre_le: hour(0), workers: 4,
    memoire_mo: { rss: 120, tas: 60 }, cache: { entrees: 10, taille_mo: 1.5, taux_succes: 0.9, ecoute: true },
    journalisation: { niveau: 'log', source: 'base', niveau_base: 'log', contextes: { HTTP: 'warn' }, sql: false },
    base: { nom: 'rni', taille_mo: 42, connexions_api: 9, version: '16.4', migration: '2.6.0-supervision' },
    journal: { lignes: 1000, plus_ancien: hour(0) },
  },
};

describe('tableau de bord', () => {
  it('graduations rondes', () => {
    expect(niceScale(0)).toEqual({ top: 1, step: 0.25 });
    expect(niceScale(230)).toEqual({ top: 300, step: 100 });
    expect(niceScale(9)).toEqual({ top: 10, step: 2.5 });
    expect(niceScale(1284).top).toBeGreaterThanOrEqual(1284);
  });

  it('appréciation des indicateurs (icône + texte, jamais la couleur seule)', () => {
    expect(latencyTone(42)).toEqual({ tone: 'good', status: 'Normal' });
    expect(latencyTone(450).tone).toBe('warning');
    expect(latencyTone(1500)).toEqual({ tone: 'critical', status: 'Lent' });
    expect(errorsTone(0).status).toBe('Aucune');
    expect(errorsTone(3).tone).toBe('critical');
    expect(availabilityTone(98).status).toBe('Dégradée');
    expect(availabilityTone(null).tone).toBe('neutral');
    expect(fmtMs(1530)).toBe('1,5 s');
    expect(fmtAgo(new Date(Date.now() - 125_000).toISOString())).toBe('il y a 2 min');
  });

  it('affiche les indicateurs, les connectés et les erreurs', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/rni/api/admin/dashboard').flush(DASHBOARD);
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid=kpi-connectes]')!.textContent!.trim()).toBe('3');
    expect(el.querySelector('[data-testid=kpi-requetes]')!.textContent!.trim()).toBe('1\u202f284');
    expect(el.querySelector('[data-testid=kpi-temps]')!.textContent!.trim()).toBe('42 ms');
    expect(el.textContent).toContain('À examiner');
    expect(el.textContent).toContain('FOURNIER');
    expect(el.textContent).toContain('GET /x → RNI-0000');
    expect(el.textContent).toContain('/planning/timetable');
    expect(el.querySelectorAll('rni-time-chart svg').length).toBe(2);
    fixture.destroy();
  });
});
