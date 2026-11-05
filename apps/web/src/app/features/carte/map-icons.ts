import { NO_PLANNING_COLOR, PersonnelPointProperties } from '@rni/shared';
import type * as Leaflet from 'leaflet';
import { L } from '../../core/map/leaflet';

/** Marqueur d'un personnel : couleur de la position ; pointillés si localisé via NEO. */
export function personIcon(p: PersonnelPointProperties): Leaflet.DivIcon {
  const ring = p.adresse_type === 'localisation' ? 'outline:2px dashed #0f172a;outline-offset:2px;' : '';
  const glyph = p.adresse_type === 'localisation' ? '📱' : p.adresse_type === 'temporaire' ? '•' : '';
  return L.divIcon({
    className: 'rni-marker rni-person',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div style="width:22px;height:22px;background:${p.color};${ring}" class="flex items-center justify-center rounded-full border-2 border-white text-[10px] text-white shadow">${glyph}</div>`,
  });
}

/**
 * BR-CAR-4 : couleur d'un cluster — positions prioritaires paramétrées en base (par défaut Alerte
 * puis Disponible), sinon première position planifiée.
 */
export function clusterColor(children: PersonnelPointProperties[], priority: readonly number[] = [4, 1], noPlanning = NO_PLANNING_COLOR): string {
  for (const pos of priority) {
    const hit = children.find((p) => p.id_planning && p.id_pos_service === pos);
    if (hit) return hit.color;
  }
  return children.find((p) => p.id_planning)?.color ?? noPlanning;
}

export function clusterIcon(count: number, color: string): Leaflet.DivIcon {
  const size = count < 10 ? 34 : count < 50 ? 40 : 46;
  return L.divIcon({
    className: 'rni-cluster',
    iconSize: [size, size],
    html: `<div style="width:${size}px;height:${size}px;background:${color};box-shadow:0 0 0 4px ${color}55" class="flex items-center justify-center rounded-full border-2 border-white text-sm font-bold text-white">${count}</div>`,
  });
}

export function criseIcon(): Leaflet.DivIcon {
  return L.divIcon({
    className: 'rni-marker',
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    html: `<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true"><path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.7 23.3 0 15 0z" fill="#dc2626" stroke="#fff" stroke-width="2"/><circle cx="15" cy="15" r="5.5" fill="#fff"/></svg>`,
  });
}
