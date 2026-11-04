import type { BaseLayerDto, GeocodeCandidate, IsochroneCollection, NeoLineDto } from '@rni/shared';
import { CacheService, CacheTag, CacheTtl } from '../../common/cache/cache.service.js';
import type { FacadeClient, GeolocClient, GeolocPosition, RemopClient } from './external.types.js';

/**
 * Cache des services externes (réels ou simulés) : ce sont les appels les plus lents (réseau
 * inter-applicatif). Les erreurs ne sont jamais mises en cache ; `ping` (test de vie) n'est jamais
 * mis en cache.
 */
const T = [CacheTag.EXTERNAL];

export class CachedFacadeClient implements FacadeClient {
  constructor(
    private readonly inner: FacadeClient,
    private readonly cache: CacheService,
  ) {}

  baseLayers(): Promise<BaseLayerDto[]> {
    return this.cache.wrap('ext:facade:carto', CacheTtl.EXTERNAL_LONG, () => this.inner.baseLayers(), T);
  }

  geocode(address: string): Promise<GeocodeCandidate[]> {
    const key = address.trim().toLowerCase().replace(/\s+/g, ' ');
    return this.cache.wrap(`ext:geocode:${key}`, CacheTtl.EXTERNAL, () => this.inner.geocode(address), T);
  }

  isochrones(lng: number, lat: number, timebreaks: number[]): Promise<IsochroneCollection> {
    // ~1 m de précision : un même point (unité, adresse) réutilise le calcul
    const key = `${lng.toFixed(5)},${lat.toFixed(5)}:${timebreaks.join(',')}`;
    return this.cache.wrap(`ext:isochrone:${key}`, CacheTtl.EXTERNAL_LONG, () => this.inner.isochrones(lng, lat, timebreaks), T);
  }

  ping(): Promise<void> {
    return this.inner.ping();
  }
}

export class CachedGeolocClient implements GeolocClient {
  constructor(
    private readonly inner: GeolocClient,
    private readonly cache: CacheService,
  ) {}

  /** Positions des terminaux : quasi temps réel (15 s). */
  positions(): Promise<GeolocPosition[]> {
    return this.cache.wrap('ext:geoloc:positions', CacheTtl.LIVE, () => this.inner.positions(), T);
  }

  ping(): Promise<void> {
    return this.inner.ping();
  }
}

export class CachedRemopClient implements RemopClient {
  constructor(
    private readonly inner: RemopClient,
    private readonly cache: CacheService,
  ) {}

  lines(nigend: string): Promise<NeoLineDto[]> {
    return this.cache.wrap(`ext:remop:${nigend}`, CacheTtl.EXTERNAL, () => this.inner.lines(nigend), T);
  }

  ping(): Promise<void> {
    return this.inner.ping();
  }
}
