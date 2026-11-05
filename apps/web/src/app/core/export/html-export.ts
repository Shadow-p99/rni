/**
 * Export image (PNG) d'un élément de la page — la carte. Les PDF (planning, fiches de crise) sont
 * dessinés à partir des données avec jsPDF, sans capture d'écran.
 *
 * Rendu par **le navigateur lui-même** (modern-screenshot : clone du DOM dans un SVG
 * `foreignObject`) et non par une réimplémentation du CSS : fidèle quelles que soient les
 * couleurs (oklch de Tailwind 4) et les transformations (calques Leaflet), sous Chrome, Edge et
 * Firefox. Les éléments marqués `data-export-ignore` (barres d'outils…) sont exclus.
 */

export const EXPORT_IGNORE = 'data-export-ignore';

/** Image produite vide ou uniforme : rien à exporter (on ne télécharge pas un fichier blanc). */
export class BlankExportError extends Error {}
/** Image « teintée » par une ressource sans autorisation CORS (fond cartographique). */
export class TaintedExportError extends Error {}

/** Pixel transparent : remplace une image distante indisponible (tuile hors ligne, CORS refusé). */
const TRANSPARENT_PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** Image distante → data URL ; ne lève jamais (une tuile manquante ne fait pas échouer l'export). */
async function fetchAsDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  try {
    const res = await fetch(url, { mode: 'cors', cache: 'force-cache' });
    if (!res.ok) return TRANSPARENT_PX;
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : TRANSPARENT_PX);
      reader.onerror = () => resolve(TRANSPARENT_PX);
      reader.readAsDataURL(blob);
    });
  } catch {
    return TRANSPARENT_PX;
  }
}

async function renderToCanvas(el: HTMLElement, scale: number): Promise<HTMLCanvasElement> {
  const { domToCanvas } = await import('modern-screenshot');
  return domToCanvas(el, {
    scale,
    backgroundColor: '#ffffff',
    width: el.scrollWidth,
    height: el.scrollHeight,
    filter: (node) => !(node instanceof Element && node.hasAttribute(EXPORT_IGNORE)),
    // Tuiles et images distantes rechargées en CORS puis intégrées à l'image
    fetchFn: fetchAsDataUrl,
    fetch: { requestInit: { mode: 'cors', cache: 'force-cache' }, placeholderImage: TRANSPARENT_PX },
    timeout: 30_000,
  });
}

/**
 * Contrôle du résultat sur une réduction 32 × 32 : une image entièrement transparente ou d'une
 * seule couleur signale un rendu raté.
 */
export function assertNotBlank(canvas: HTMLCanvasElement): void {
  if (!canvas.width || !canvas.height) throw new BlankExportError('Image vide (dimensions nulles)');
  const probe = document.createElement('canvas');
  probe.width = probe.height = 32;
  const ctx = probe.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0, 32, 32);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, 32, 32).data;
  } catch (e) {
    throw new TaintedExportError((e as Error).message);
  }
  const first = data.slice(0, 4).join(',');
  let uniform = true;
  let opaque = false;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) opaque = true;
    if (uniform && `${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}` !== first) uniform = false;
  }
  if (!opaque || uniform) throw new BlankExportError('Image vide ou uniforme');
}

function download(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
}

/** Capture PNG d'un élément (export de la carte). */
export async function exportElementToPng(el: HTMLElement, filename: string): Promise<void> {
  const canvas = await renderToCanvas(el, Math.min(2, window.devicePixelRatio || 1));
  assertNotBlank(canvas);
  download(canvas.toDataURL('image/png'), filename);
}
