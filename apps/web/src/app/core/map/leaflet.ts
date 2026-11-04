/**
 * Leaflet + Leaflet.markercluster.
 * Le build ESM de Leaflet expose un espace de noms figé, alors que markercluster (UMD) étend
 * l'objet global `L` : on publie donc une copie mutable de l'espace de noms avant de charger le plugin.
 */
import './leaflet-global';
import 'leaflet.markercluster';
import type * as Leaflet from 'leaflet';

export const L = (globalThis as unknown as { L: typeof Leaflet }).L;
