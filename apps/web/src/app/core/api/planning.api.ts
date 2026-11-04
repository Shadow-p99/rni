import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  InsertPlanningDto,
  MobileDayCountsDto,
  PersonnelCollection,
  PlanningDetailDto,
  PlanningDto,
  PlanningInputDto,
  RegionCountsDto,
  TimetableDto,
  TimetableFilter,
} from '@rni/shared';
import { API, RequestOptions, ctx, toParams } from './api.config';

@Injectable({ providedIn: 'root' })
export class PlanningApi {
  private readonly http = inject(HttpClient);

  /** Calendrier du mois ; `filter` = recherche serveur dans tout le périmètre. */
  timetable(month: string, region?: number | null, opts?: RequestOptions, filter: TimetableFilter = {}) {
    return this.http.get<TimetableDto>(`${API}/planning/timetable`, {
      params: toParams({ month, region, q: filter.q, positions: filter.positions?.length ? filter.positions.join(',') : undefined }),
      ...ctx(opts),
    });
  }
  geojson(opts?: RequestOptions) {
    return this.http.get<PersonnelCollection>(`${API}/planning/geojson`, ctx(opts));
  }
  byDate(date: string, region?: number | null, opts?: RequestOptions) {
    return this.http.get<PlanningDetailDto[]>(`${API}/planning/byDateAndIdRegion/${date}`, { params: toParams({ region }), ...ctx(opts) });
  }
  create(dto: PlanningInputDto, opts?: RequestOptions) {
    return this.http.post<PlanningDto>(`${API}/planning`, dto, ctx(opts));
  }
  update(id: number, dto: PlanningInputDto, opts?: RequestOptions) {
    return this.http.put<PlanningDto>(`${API}/planning/${id}`, dto, ctx(opts));
  }
  insert(dto: InsertPlanningDto, opts?: RequestOptions) {
    return this.http.post<PlanningDto[]>(`${API}/planning/insert`, dto, ctx(opts));
  }
  remove(id: number, opts?: RequestOptions) {
    return this.http.delete<void>(`${API}/planning/${id}`, ctx(opts));
  }
  regionCounts(opts?: RequestOptions) {
    return this.http.get<RegionCountsDto[]>(`${API}/region/getNbPositionServiceByRegion`, ctx(opts));
  }
  mobileCounts(from: string, to: string, region?: number | null, opts?: RequestOptions) {
    return this.http.get<MobileDayCountsDto[]>(`${API}/region/getNbPositionServiceAllRegionMobile`, {
      params: toParams({ from: from.replaceAll('-', ''), to: to.replaceAll('-', ''), region }),
      ...ctx(opts),
    });
  }
}
