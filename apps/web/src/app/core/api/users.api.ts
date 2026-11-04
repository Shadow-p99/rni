import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CreateUserDto,
  CurrentUserDto,
  MockUserDto,
  NeoLineDto,
  Page,
  RpsiPersonnelDto,
  UpdateUserDto,
  UserDto,
  UserListQuery,
} from '@rni/shared';
import { API, RequestOptions, ctx, toParams } from './api.config';

@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);

  isUser() {
    return this.http.get<boolean>(`${API}/users/isUser`, ctx({ silent: true, allow401: true }));
  }
  me(opts?: RequestOptions) {
    return this.http.get<CurrentUserDto>(`${API}/users/me`, ctx(opts));
  }
  /** Liste paginée côté serveur (recherche, filtres, tri). */
  list(query: UserListQuery, opts?: RequestOptions) {
    return this.http.get<Page<UserDto>>(`${API}/users`, { params: toParams(query), ...ctx(opts) });
  }
  /** Personnel planifiable (autocomplétion). */
  search(q: string) {
    return this.http.get<UserDto[]>(`${API}/users/search`, { params: toParams({ q }), ...ctx({ silent: true }) });
  }
  /** Personnel RPSI (autocomplétion d'inscription). */
  rpsi(q: string) {
    return this.http.get<RpsiPersonnelDto[]>(`${API}/users/rpsi`, { params: toParams({ q }), ...ctx({ silent: true }) });
  }
  create(dto: CreateUserDto, opts?: RequestOptions) {
    return this.http.post<UserDto>(`${API}/users`, dto, ctx(opts));
  }
  update(id: number, dto: UpdateUserDto, opts?: RequestOptions) {
    return this.http.put<UserDto>(`${API}/users/${id}`, dto, ctx(opts));
  }
  remove(id: number, opts?: RequestOptions) {
    return this.http.delete<void>(`${API}/users/${id}`, ctx(opts));
  }
  neoLines(nigend: string, opts?: RequestOptions) {
    return this.http.get<NeoLineDto[]>(`${API}/service/listTelUser/${encodeURIComponent(nigend)}`, ctx(opts));
  }
  infoDevice(geoloc_id_geoloc: string | null, opts?: RequestOptions) {
    return this.http.put<CurrentUserDto>(`${API}/users/infoDeviceUser`, { geoloc_id_geoloc }, ctx(opts));
  }
  activateLocation(isIndispo: boolean, value: boolean, opts?: RequestOptions) {
    return this.http.put<CurrentUserDto>(`${API}/users/activateLocation`, { isIndispo, value }, ctx(opts));
  }
  mockUsers() {
    return this.http.get<MockUserDto[]>(`${API}/service/mock-users`, ctx({ silent: true }));
  }
}
