import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { AliveCheckDto, AppInfoDto, CreneauDto, PositionServiceDto, ProfilDto, RegionDto } from '@rni/shared';
import { API, RequestOptions, ctx } from './api.config';

/** Services techniques et référentiels. */
@Injectable({ providedIn: 'root' })
export class ServiceApi {
  private readonly http = inject(HttpClient);

  info() {
    return this.http.get<AppInfoDto>(`${API}/service`, ctx({ silent: true }));
  }
  configuration() {
    return this.http.get<Record<string, string | null>>(`${API}/service/configuration`, ctx({ silent: true }));
  }
  testvie() {
    return this.http.get<AliveCheckDto[]>(`${API}/service/testvie`, ctx({ silent: true, timeoutMs: 45_000 }));
  }
  positions(opts?: RequestOptions) {
    return this.http.get<PositionServiceDto[]>(`${API}/referentiel/positions`, ctx(opts));
  }
  creneaux(opts?: RequestOptions) {
    return this.http.get<CreneauDto[]>(`${API}/referentiel/creneaux`, ctx(opts));
  }
  profils(opts?: RequestOptions) {
    return this.http.get<ProfilDto[]>(`${API}/referentiel/profils`, ctx(opts));
  }
  visibleRegions(opts?: RequestOptions) {
    return this.http.get<RegionDto[]>(`${API}/region`, ctx(opts));
  }
  allRegions(opts?: RequestOptions) {
    return this.http.get<RegionDto[]>(`${API}/region/all`, ctx(opts));
  }
}
