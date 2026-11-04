import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  AliveCheckDto,
  BaseLayerDto,
  CreateUserDto,
  CurrentUserDto,
  FormulaireDto,
  FormulaireFilter,
  GeocodeCandidate,
  InsertPlanningDto,
  IsochroneCollection,
  MobileDayCountsDto,
  MockUserDto,
  NeoLineDto,
  PersonnelCollection,
  PlanningDetailDto,
  PlanningDto,
  PlanningInputDto,
  RegionCountsDto,
  RpsiPersonnelDto,
  TimetableDto,
  UpdateUserDto,
  UserDto,
  UserListQuery,
  Page,
} from '@rni/shared';
import { API } from './api';
import { SILENT } from './http.interceptor';

const silent = { context: new HttpContext().set(SILENT, true) };

function params(obj: Record<string, string | number | boolean | null | undefined>): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(obj)) if (v != null && v !== '') p = p.set(k, String(v));
  return p;
}

@Injectable({ providedIn: 'root' })
export class PlanningApi {
  private readonly http = inject(HttpClient);

  timetable(month: string, region?: number | null) {
    return this.http.get<TimetableDto>(`${API}/planning/timetable`, { params: params({ month, region }) });
  }
  geojson() {
    return this.http.get<PersonnelCollection>(`${API}/planning/geojson`);
  }
  byDate(date: string, region?: number | null) {
    return this.http.get<PlanningDetailDto[]>(`${API}/planning/byDateAndIdRegion/${date}`, { params: params({ region }) });
  }
  create(dto: PlanningInputDto) {
    return this.http.post<PlanningDto>(`${API}/planning`, dto);
  }
  update(id: number, dto: PlanningInputDto) {
    return this.http.put<PlanningDto>(`${API}/planning/${id}`, dto);
  }
  insert(dto: InsertPlanningDto) {
    return this.http.post<PlanningDto[]>(`${API}/planning/insert`, dto);
  }
  remove(id: number) {
    return this.http.delete<void>(`${API}/planning/${id}`);
  }
  regionCounts() {
    return this.http.get<RegionCountsDto[]>(`${API}/region/getNbPositionServiceByRegion`);
  }
  mobileCounts(from: string, to: string, region?: number | null) {
    return this.http.get<MobileDayCountsDto[]>(`${API}/region/getNbPositionServiceAllRegionMobile`, {
      params: params({ from: from.replaceAll('-', ''), to: to.replaceAll('-', ''), region }),
    });
  }
}

@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);

  /** Liste paginée côté serveur (recherche, filtres, tri). */
  list(query: UserListQuery) {
    return this.http.get<Page<UserDto>>(`${API}/users`, { params: params({ ...query }) });
  }
  search(q: string) {
    return this.http.get<UserDto[]>(`${API}/users/search`, { params: params({ q }), ...silent });
  }
  rpsi(q: string) {
    return this.http.get<RpsiPersonnelDto[]>(`${API}/users/rpsi`, { params: params({ q }), ...silent });
  }
  create(dto: CreateUserDto) {
    return this.http.post<UserDto>(`${API}/users`, dto);
  }
  update(id: number, dto: UpdateUserDto) {
    return this.http.put<UserDto>(`${API}/users/${id}`, dto);
  }
  remove(id: number) {
    return this.http.delete<void>(`${API}/users/${id}`);
  }
  neoLines(nigend: string) {
    return this.http.get<NeoLineDto[]>(`${API}/service/listTelUser/${nigend}`);
  }
  infoDevice(geoloc_id_geoloc: string | null) {
    return this.http.put<CurrentUserDto>(`${API}/users/infoDeviceUser`, { geoloc_id_geoloc });
  }
  activateLocation(isIndispo: boolean, value: boolean) {
    return this.http.put<CurrentUserDto>(`${API}/users/activateLocation`, { isIndispo, value });
  }
  mockUsers() {
    return this.http.get<MockUserDto[]>(`${API}/service/mock-users`, silent);
  }
}

@Injectable({ providedIn: 'root' })
export class FormulaireApi {
  private readonly http = inject(HttpClient);

  list(filter: FormulaireFilter) {
    return this.http.get<FormulaireDto[]>(`${API}/formulaire`, { params: params({ ...filter }) });
  }
  get(id: number) {
    return this.http.get<FormulaireDto>(`${API}/formulaire/${id}`);
  }
  create(body: Record<string, unknown>) {
    return this.http.post<FormulaireDto>(`${API}/formulaire`, body);
  }
  update(id: number, body: Record<string, unknown>) {
    return this.http.put<FormulaireDto>(`${API}/formulaire/${id}`, body);
  }
  close(id: number) {
    return this.http.put<FormulaireDto>(`${API}/formulaire/${id}/close`, {});
  }
  remove(id: number) {
    return this.http.delete<void>(`${API}/formulaire/${id}`);
  }
}

@Injectable({ providedIn: 'root' })
export class GeoApi {
  private readonly http = inject(HttpClient);

  baseLayers() {
    return this.http.get<BaseLayerDto[]>(`${API}/service/carto`);
  }
  /** Géocodeur (silencieux : « aucune adresse » est un cas normal de saisie). */
  geocode(address: string) {
    return this.http.get<GeocodeCandidate[]>(`${API}/service/coordinates`, { params: params({ address }), ...silent });
  }
  isochrones(x: number, y: number) {
    return this.http.get<IsochroneCollection>(`${API}/service/isochrone`, { params: params({ x, y }) });
  }
  testvie() {
    return this.http.get<AliveCheckDto[]>(`${API}/service/testvie`, silent);
  }
}
