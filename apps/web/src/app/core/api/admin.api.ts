import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { AdminDashboardDto, AppLogPageDto, AppLogQuery, LogSettingsDto, LogSettingsUpdateDto } from '@rni/shared';
import { API, RequestOptions, ctx, toParams } from './api.config';

/** Supervision (super administrateur) : tableau de bord et journal applicatif. */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);

  dashboard(opts?: RequestOptions) {
    return this.http.get<AdminDashboardDto>(`${API}/admin/dashboard`, ctx(opts));
  }

  journal(q: AppLogQuery, opts?: RequestOptions) {
    return this.http.get<AppLogPageDto>(`${API}/admin/journal`, { params: toParams(q), ...ctx(opts) });
  }

  logSettings(opts?: RequestOptions) {
    return this.http.get<LogSettingsDto>(`${API}/admin/logs`, ctx(opts));
  }

  updateLogSettings(dto: LogSettingsUpdateDto, opts?: RequestOptions) {
    return this.http.put<LogSettingsDto>(`${API}/admin/logs`, dto, ctx(opts));
  }
}
