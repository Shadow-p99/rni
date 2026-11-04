/** Export d'un élément HTML en PDF A4 (html2canvas + jsPDF), paginé si nécessaire. */
export async function exportElementToPdf(el: HTMLElement, filename: string, orientation: 'landscape' | 'portrait' = 'landscape'): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: el.scrollWidth });
  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const w = pageW - margin * 2;
  const pxPerMm = canvas.width / w;
  const sliceH = Math.floor((pageH - margin * 2) * pxPerMm);
  for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.min(sliceH, canvas.height - y);
    slice.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
    if (page > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin, w, slice.height / pxPerMm);
  }
  pdf.save(filename);
}

/** Capture PNG d'un élément (export de la carte). */
export async function exportElementToPng(el: HTMLElement, filename: string): Promise<void> {
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(el, { useCORS: true, backgroundColor: null, scale: 1 });
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}
