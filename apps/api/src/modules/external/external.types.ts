import type { BaseLayerDto, FeatureCollection, GeocodeCandidate, IsochroneCollection, NeoLineDto } from '@rni/shared';

/** Position GEOLOC d'un terminal NEO (normalisée). */
export interface GeolocPosition {
  indicatif: string;
  lat: number;
  lng: number;
  horodatage: string | null;
}

export interface GeolocClient {
  positions(): Promise<GeolocPosition[]>;
  ping(): Promise<void>;
}

export interface RemopClient {
  lines(nigend: string): Promise<NeoLineDto[]>;
  ping(): Promise<void>;
}

export interface FacadeClient {
  baseLayers(): Promise<BaseLayerDto[]>;
  geocode(address: string): Promise<GeocodeCandidate[]>;
  isochrones(lng: number, lat: number, timebreaks: number[]): Promise<IsochroneCollection>;
  ping(): Promise<void>;
}

export const GEOLOC_CLIENT = Symbol('GEOLOC_CLIENT');
export const REMOP_CLIENT = Symbol('REMOP_CLIENT');
export const FACADE_CLIENT = Symbol('FACADE_CLIENT');

export type AnyFeatureCollection = FeatureCollection<{ type: string; coordinates: unknown }, Record<string, unknown>>;
