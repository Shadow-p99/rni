import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { BaseLayerDto, GeocodeCandidate, IsochroneCollection } from '@rni/shared';
import { API, RequestOptions, ctx, toParams } from './api.config';

@Injectable({ providedIn: 'root' })
export class GeoApi {
  private readonly http = inject(HttpClient);

  baseLayers(opts?: RequestOptions) {
    return this.http.get<BaseLayerDto[]>(`${API}/service/carto`, ctx(opts));
  }
  /** Géocodeur : silencieux, « aucune adresse » est un cas normal de saisie. */
  geocode(address: string) {
    return this.http.get<GeocodeCandidate[]>(`${API}/service/coordinates`, { params: toParams({ address }), ...ctx({ silent: true }) });
  }
  isochrones(x: number, y: number, opts?: RequestOptions) {
    return this.http.get<IsochroneCollection>(`${API}/service/isochrone`, { params: toParams({ x, y }), ...ctx({ timeoutMs: 60_000, ...opts }) });
  }
}
