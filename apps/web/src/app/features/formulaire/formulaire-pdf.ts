import { FormulaireConfigDto, FormulaireDto, SectionId } from '@rni/shared';
import { DEFAULT_FORMULAIRE_CONFIG } from '../../core/formulaire/formulaire-config.service';

/**
 * BR-FOR-8 : export PDF A4 portrait ; le bloc Profil est systématique, les autres sections
 * sont choisies par l'utilisateur.
 */
export async function exportFormulairePdf(f: FormulaireDto, sections: SectionId[], structure: FormulaireConfigDto = DEFAULT_FORMULAIRE_CONFIG): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 14;
  let y = M;

  const ensure = (h: number) => {
    if (y + h > H - M) {
      pdf.addPage();
      y = M;
    }
  };

  pdf.setFillColor(11, 31, 77);
  pdf.rect(0, 0, W, 22, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('RNI — Fiche de renseignements de crise', M, 10);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(
    `Fiche n° ${f.id_formulaire} — ${f.is_closed ? 'clôturée' : 'active'} — auteur : ${f.auteur_nom} — mise à jour : ${new Date(f.updated_at).toLocaleString('fr-FR')}`,
    M,
    17,
  );
  pdf.setTextColor(0, 0, 0);
  y = 30;

  const wanted: SectionId[] = ['profil', ...sections.filter((s) => s !== 'profil')];
  for (const s of [...structure.sections].sort((a, b) => a.ordre - b.ordre).filter((x) => wanted.includes(x.id))) {
    ensure(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(30, 58, 138);
    pdf.text(s.libelle, M, y);
    pdf.setDrawColor(30, 58, 138);
    pdf.line(M, y + 1.5, W - M, y + 1.5);
    pdf.setTextColor(0, 0, 0);
    y += 7;
    for (const def of structure.champs.filter((d) => d.section === s.id).sort((a, b) => a.ordre - b.ordre)) {
      const raw = f[def.key];
      const value = raw == null || raw === '' ? '—' : String(raw);
      const lines = pdf.splitTextToSize(value, W - M * 2 - 48) as string[];
      ensure(lines.length * 4.5 + 2);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text(def.label, M, y);
      pdf.setFont('helvetica', 'normal');
      pdf.text(lines, M + 48, y);
      y += lines.length * 4.5 + 1.5;
    }
    y += 4;
  }

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text(`Diffusion restreinte — page ${i}/${pages}`, W / 2, H - 6, { align: 'center' });
  }
  const who = [f['nom'], f['prenom']].filter(Boolean).join('_') || 'individu';
  pdf.save(`fiche_crise_${f.id_formulaire}_${String(who).replace(/\s+/g, '_')}.pdf`);
}
