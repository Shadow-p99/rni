import {
  Creneau,
  currentSlotBound,
  fromSlot,
  monthBounds,
  plagesOverlap,
  toSlot,
  dateRange,
  compactToIso,
  isIsoDate,
} from './creneaux.js';

describe('créneaux', () => {
  it('convertit date + créneau en index et inversement', () => {
    const s = toSlot('2026-03-15', Creneau.NUIT);
    expect(fromSlot(s)).toEqual({ date: '2026-03-15', creneau: Creneau.NUIT });
    expect(toSlot('2026-03-16', Creneau.JOUR)).toBe(s + 1);
  });

  it('détecte les chevauchements y compris aux bornes identiques (BR-PLA-5)', () => {
    const a = { date_debut: '2026-03-01', id_creneaux_debut: 1, date_fin: '2026-03-05', id_creneaux_fin: 2 };
    expect(plagesOverlap(a, { date_debut: '2026-03-05', id_creneaux_debut: 2, date_fin: '2026-03-06', id_creneaux_fin: 1 })).toBe(true);
    expect(plagesOverlap(a, { date_debut: '2026-03-06', id_creneaux_debut: 1, date_fin: '2026-03-06', id_creneaux_fin: 1 })).toBe(false);
    expect(plagesOverlap(a, a)).toBe(true);
    expect(plagesOverlap(a, { date_debut: '2026-02-01', id_creneaux_debut: 1, date_fin: '2026-04-01', id_creneaux_fin: 1 })).toBe(true);
  });

  it('calcule le créneau courant dans le fuseau du département', () => {
    // 2026-07-01T05:00Z = 07h à Paris (avant 8h → nuit de la veille)
    expect(currentSlotBound(new Date('2026-07-01T05:00:00Z'), 'Europe/Paris')).toEqual({ date: '2026-06-30', creneau: Creneau.NUIT });
    expect(currentSlotBound(new Date('2026-07-01T07:00:00Z'), 'Europe/Paris')).toEqual({ date: '2026-07-01', creneau: Creneau.JOUR });
    expect(currentSlotBound(new Date('2026-07-01T17:00:00Z'), 'Europe/Paris')).toEqual({ date: '2026-07-01', creneau: Creneau.NUIT });
    // La Réunion UTC+4 : 2026-07-01T05:00Z = 09h → Jour
    expect(currentSlotBound(new Date('2026-07-01T05:00:00Z'), 'Indian/Reunion')).toEqual({ date: '2026-07-01', creneau: Creneau.JOUR });
    // Guyane UTC-3 : 2026-07-01T05:00Z = 02h → nuit du 30
    expect(currentSlotBound(new Date('2026-07-01T05:00:00Z'), 'America/Cayenne')).toEqual({ date: '2026-06-30', creneau: Creneau.NUIT });
  });

  it('borne les mois, y compris février bissextile', () => {
    expect(monthBounds('2028-02')).toEqual({ first: '2028-02-01', last: '2028-02-29' });
    expect(monthBounds('2026-12')).toEqual({ first: '2026-12-01', last: '2026-12-31' });
    expect(() => monthBounds('2026-13')).toThrow();
  });

  it('utilitaires de dates', () => {
    expect(dateRange('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
    expect(compactToIso('20260304')).toBe('2026-03-04');
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-02-28')).toBe(true);
  });
});

describe('minuit local', () => {
  it('heure d’hiver, d’été et jours de changement d’heure (Europe/Paris)', async () => {
    const { zonedMidnight, startOfLocalDay } = await import('./creneaux.js');
    expect(zonedMidnight('2026-01-15').toISOString()).toBe('2026-01-14T23:00:00.000Z');
    expect(zonedMidnight('2026-07-15').toISOString()).toBe('2026-07-14T22:00:00.000Z');
    expect(zonedMidnight('2026-03-29').toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(zonedMidnight('2026-10-25').toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(zonedMidnight('2026-07-15', 'America/Martinique').toISOString()).toBe('2026-07-15T04:00:00.000Z');
    expect(startOfLocalDay(new Date('2026-07-15T21:30:00Z')).toISOString()).toBe('2026-07-14T22:00:00.000Z');
    expect(startOfLocalDay(new Date('2026-07-15T22:30:00Z')).toISOString()).toBe('2026-07-15T22:00:00.000Z');
  });
});
