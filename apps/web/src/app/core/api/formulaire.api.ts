import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { FormulaireConfigDto, FormulaireDto, FormulaireFilter } from '@rni/shared';
import { API, RequestOptions, ctx, toParams } from './api.config';

@Injectable({ providedIn: 'root' })
export class FormulaireApi {
  private readonly http = inject(HttpClient);

  list(filter: FormulaireFilter, opts?: RequestOptions) {
    return this.http.get<FormulaireDto[]>(`${API}/formulaire`, { params: toParams(filter), ...ctx(opts) });
  }
  /** Structure paramétrée de la fiche (types de crise, libellés, champs obligatoires). */
  config(opts?: RequestOptions) {
    return this.http.get<FormulaireConfigDto>(`${API}/formulaire/config`, ctx(opts));
  }
  get(id: number, opts?: RequestOptions) {
    return this.http.get<FormulaireDto>(`${API}/formulaire/${id}`, ctx(opts));
  }
  create(body: Record<string, unknown>, opts?: RequestOptions) {
    return this.http.post<FormulaireDto>(`${API}/formulaire`, body, ctx(opts));
  }
  update(id: number, body: Record<string, unknown>, opts?: RequestOptions) {
    return this.http.put<FormulaireDto>(`${API}/formulaire/${id}`, body, ctx(opts));
  }
  close(id: number, opts?: RequestOptions) {
    return this.http.put<FormulaireDto>(`${API}/formulaire/${id}/close`, {}, ctx(opts));
  }
  remove(id: number, opts?: RequestOptions) {
    return this.http.delete<void>(`${API}/formulaire/${id}`, ctx(opts));
  }
}
