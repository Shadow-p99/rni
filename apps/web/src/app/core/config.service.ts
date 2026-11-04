import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import type { AppInfoDto } from '@rni/shared';
import { firstValueFrom } from 'rxjs';
import { API } from './api';
import { SILENT } from './http.interceptor';

/** Informations d'API et paramètres « front » de `t_param_app` (permanence GIGN, Matomo…). */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly http = inject(HttpClient);
  readonly info = signal<AppInfoDto | null>(null);
  readonly params = signal<Record<string, string | null>>({});

  async load(): Promise<void> {
    const ctx = { context: new HttpContext().set(SILENT, true) };
    const [info, params] = await Promise.all([
      firstValueFrom(this.http.get<AppInfoDto>(`${API}/service`, ctx)).catch(() => null),
      firstValueFrom(this.http.get<Record<string, string | null>>(`${API}/service/configuration`, ctx)).catch(() => ({})),
    ]);
    this.info.set(info);
    this.params.set(params);
  }

  param(key: string): string | null {
    return this.params()[key] ?? null;
  }
}
