import type { PositionServiceDto } from '@rni/shared';
import type { PlanningRow } from './desktop/planning-desktop.store';

export interface PlanningPdfInput {
  /** Mois `YYYY-MM`. */
  month: string;
  days: { date: string; day: number; letter: string; weekend: boolean; today: boolean }[];
  /** Régions à imprimer (toutes celles du périmètre, ou les résultats du filtre), avec leurs lignes. */
  regions: { libelle: string; rows: PlanningRow[] }[];
  positions: Pick<PositionServiceDto, 'libelle' | 'color'>[];
  editeur: string;
  /** Filtre actif à rappeler (recherche, position « Maintenant »). */
  filtre: string | null;
}

type Rgb = [number, number, number];

/** `#rrggbb` → [r, g, b] (gris si la couleur n'est pas lisible). */
export function hexToRgb(hex: string | null | undefined, fallback: Rgb = [226, 232, 240]): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const NAVY: Rgb = [11, 31, 77];
const RNI_100: Rgb = [227, 233, 248];
const EMPTY_JOUR: Rgb = [226, 232, 240];
const EMPTY_NUIT: Rgb = [203, 213, 225];
const WEEKEND: Rgb = [241, 245, 249];
const TODAY: Rgb = [254, 243, 199];

/**
 * PDF du planning mensuel dessiné **à partir des données** (jsPDF, vectoriel) et non par capture
 * d'écran : rendu identique quel que soit le navigateur, net à l'impression, léger.
 * A4 paysage ; une ligne par personnel, deux demi-cases par jour (haut = Jour, bas = Nuit) colorées
 * selon la position ; en-tête de tableau répété et numéro de page sur chaque page.
 */
export async function exportPlanningPdf(input: PlanningPdfInput, filename: string): Promise<void> {
  (await buildPlanningPdf(input)).save(filename);
}

/** Construit le document (sans l'enregistrer). */
export async function buildPlanningPdf(input: PlanningPdfInput): Promise<import('jspdf').jsPDF> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 8;
  const nameW = 56;
  const dayW = (W - M * 2 - nameW) / input.days.length;
  const rowH = 5;
  const headH = 8;
  const monthLabel = new Date(`${input.month}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  let y = 0;

  const fill = (c: Rgb) => pdf.setFillColor(c[0], c[1], c[2]);
  const ink = (c: Rgb) => pdf.setTextColor(c[0], c[1], c[2]);

  /** Texte tronqué à une largeur (points de suspension). */
  const fit = (text: string, width: number): string => {
    if (pdf.getTextWidth(text) <= width) return text;
    let t = text;
    while (t.length > 1 && pdf.getTextWidth(`${t}…`) > width) t = t.slice(0, -1);
    return `${t}…`;
  };

  const pageTitle = () => {
    fill(NAVY);
    pdf.rect(0, 0, W, 16, 'F');
    ink([255, 255, 255]);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text(`RNI — Planning ${monthLabel}`, M, 7.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const sub = [`Édité le ${new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} par ${input.editeur}`];
    if (input.filtre) sub.push(`Filtre : ${input.filtre}`);
    pdf.text(fit(sub.join(' — '), W - M * 2), M, 12.5);
    y = 20;
  };

  const legend = () => {
    pdf.setFontSize(7.5);
    ink([51, 65, 85]);
    let x = M;
    const items: { label: string; color: Rgb }[] = [
      ...input.positions.map((p) => ({ label: p.libelle, color: hexToRgb(p.color) })),
      { label: 'Sans planning', color: EMPTY_JOUR },
    ];
    for (const it of items) {
      fill(it.color);
      pdf.rect(x, y - 2.6, 3.2, 3.2, 'F');
      pdf.text(it.label, x + 4.4, y);
      x += 4.4 + pdf.getTextWidth(it.label) + 6;
    }
    pdf.text('Chaque jour : demi-case haute = Jour (08h-18h), basse = Nuit (18h-08h)', W - M, y, { align: 'right' });
    y += 4;
  };

  const tableHeader = () => {
    pdf.setFontSize(6.5);
    pdf.setFont('helvetica', 'bold');
    ink([71, 85, 105]);
    pdf.text('Personnel', M + 1, y + 5.2);
    input.days.forEach((d, i) => {
      const x = M + nameW + i * dayW;
      if (d.today || d.weekend) {
        fill(d.today ? TODAY : WEEKEND);
        pdf.rect(x, y, dayW, headH, 'F');
      }
      pdf.setFont('helvetica', 'normal');
      pdf.text(d.letter, x + dayW / 2, y + 3.2, { align: 'center' });
      pdf.setFont('helvetica', 'bold');
      pdf.text(String(d.day), x + dayW / 2, y + 6.6, { align: 'center' });
    });
    pdf.setDrawColor(203, 213, 225);
    pdf.line(M, y + headH, W - M, y + headH);
    y += headH + 0.5;
  };

  const newPage = (first = false) => {
    if (!first) pdf.addPage();
    pageTitle();
    if (first) legend();
    tableHeader();
  };

  const ensure = (h: number, region?: string) => {
    if (y + h <= H - M - 4) return;
    newPage();
    if (region) band(`${region} (suite)`, RNI_100, true);
  };

  const band = (text: string, color: Rgb, bold: boolean) => {
    fill(color);
    pdf.rect(M, y, W - M * 2, 4.2, 'F');
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(bold ? 7.5 : 6.5);
    ink(bold ? [11, 31, 77] : [30, 58, 138]);
    pdf.text(fit(text, W - M * 2 - 2), M + 1, y + 3);
    y += 4.6;
  };

  newPage(true);

  for (const region of input.regions) {
    ensure(4.6 + rowH * 2);
    band(`${region.libelle} — ${region.rows.length} personnel(s)`, RNI_100, true);
    for (const row of region.rows) {
      if (row.departementHeader) {
        ensure(4.6 + rowH, region.libelle);
        band(row.departementHeader, [248, 250, 252], false);
      }
      ensure(rowH, region.libelle);
      const u = row.user;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.5);
      ink([15, 23, 42]);
      const name = `${u.abreviation_grade ?? u.grade ?? ''} ${u.nom} ${u.prenom}`.trim();
      pdf.text(fit(name, nameW - 2), M + 1, y + 2.4);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(5.2);
      ink([100, 116, 139]);
      pdf.text(fit(`${u.nigend} · ${u.libelle_profil}`, nameW - 2), M + 1, y + 4.5);
      row.cells.forEach((c, i) => {
        const x = M + nameW + i * dayW + 0.15;
        const w = dayW - 0.3;
        fill(c.jour.color ? hexToRgb(c.jour.color) : EMPTY_JOUR);
        pdf.rect(x, y + 0.15, w, rowH / 2 - 0.3, 'F');
        fill(c.nuit.color ? hexToRgb(c.nuit.color) : EMPTY_NUIT);
        pdf.rect(x, y + rowH / 2 + 0.15, w, rowH / 2 - 0.3, 'F');
      });
      // Séparation entre personnels plus foncée que la séparation Jour / Nuit (blanche)
      pdf.setDrawColor(148, 163, 184);
      pdf.setLineWidth(0.25);
      pdf.line(M, y + rowH, W - M, y + rowH);
      pdf.setLineWidth(0.2);
      y += rowH;
    }
    y += 2;
  }

  // Pied de page : numérotation
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    ink([100, 116, 139]);
    pdf.text(`RNI — Planning ${monthLabel}`, M, H - 4);
    pdf.text(`Page ${p} / ${pages}`, W - M, H - 4, { align: 'right' });
  }
  return pdf;
}
