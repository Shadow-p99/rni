import type { TimetableUserDto } from '@rni/shared';
import { buildCells } from './planning-cells';
import { buildPlanningPdf, hexToRgb } from './planning-pdf';

const days = Array.from({ length: 30 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`);
const user = (i: number): TimetableUserDto => ({
  id_user: i, nigend: String(200000 + i), grade: 'Adjudant', abreviation_grade: 'ADJ', nom: `NOM${i}`, prenom: 'Prénom',
  id_profil: 4, libelle_profil: 'Négociateur', code_unite: null, libelle_unite: null, id_departement: '78', libelle_departement: 'Yvelines',
  plannings: [{ id_planning: i, id_user: i, nigend: '', date_debut: '2026-11-03', id_creneaux_debut: 1, date_fin: '2026-11-05', id_creneaux_fin: 2, id_pos_service: 1,
    adresse_temp: null, x_adresse_temp: null, y_adresse_temp: null, affiche: { date_debut: '2026-11-03', id_creneaux_debut: 1, date_fin: '2026-11-05', id_creneaux_fin: 2 } }],
});

describe('PDF du planning (vectoriel)', () => {
  it('couleurs', () => {
    expect(hexToRgb('#16a34a')).toEqual([22, 163, 74]);
    expect(hexToRgb('oklch(0.5 0.1 120)')).toEqual([226, 232, 240]);
  });

  it('pagination : en-tête répété et numéros de page', async () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({
      user: user(i),
      cells: buildCells(user(i).plannings, days, () => '#16a34a', '2026-11-05'),
      departementHeader: i === 0 ? '78 — Yvelines' : null,
      editable: true,
    }));
    const region = { libelle: 'Île-de-France', rows };
    const doc = await buildPlanningPdf(
      {
        month: '2026-11',
        days: days.map((date, i) => ({ date, day: i + 1, letter: 'LMMJVSD'[i % 7], weekend: i % 7 > 4, today: i === 4 })),
        regions: [region],
        positions: [{ libelle: 'Disponible', color: '#16a34a' }],
        editeur: 'LTN FOURNIER Céline',
        filtre: null,
      },
    );
    const pages = doc.getNumberOfPages();
    expect(pages).toBeGreaterThan(1);
    // Contenu des pages (flux texte non compressés de jsPDF)
    const raw = doc.output();
    expect(raw.match(/\(Personnel\) Tj/g)?.length).toBe(pages);
    expect(raw).toContain(`(Page ${pages} / ${pages}) Tj`);
    // Bandeau de région répété en tête de page (parenthèses échappées dans le flux PDF)
    expect(raw).toContain('(Île-de-France \\(suite\\)) Tj');
    expect(raw).toContain('(ADJ NOM79 Pr');
  });
});
