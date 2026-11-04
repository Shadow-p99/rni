import type { BaseLayerDto } from '@rni/shared';

/** URL de tuile Leaflet ; WMTS en KVP avec matrice {z}/{y}/{x}. */
export function tileUrl(l: BaseLayerDto): string {
  if (l.type === 'xyz') return l.url;
  const sep = l.url.includes('?') ? '&' : '?';
  const q = [
    'SERVICE=WMTS',
    'REQUEST=GetTile',
    'VERSION=1.0.0',
    `LAYER=${encodeURIComponent(l.layer ?? '')}`,
    `STYLE=${encodeURIComponent(l.style ?? 'normal')}`,
    `TILEMATRIXSET=${encodeURIComponent(l.matrixSet ?? 'PM')}`,
    'TILEMATRIX={z}',
    'TILEROW={y}',
    'TILECOL={x}',
    `FORMAT=${encodeURIComponent(l.format ?? 'image/png')}`,
  ].join('&');
  return `${l.url}${sep}${q}`;
}
