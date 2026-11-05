import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  DroitsMatrixDto,
  DroitsUpdateDto,
  FormulaireConfigDto,
  FormulaireConfigUpdateDto,
  MessageDto,
  ParamAppDto,
  ParamAppUpdateDto,
  PositionInputDto,
  PositionServiceDto,
  ProfilAdminDto,
  ProfilCreateDto,
  ProfilGestionUpdateDto,
  ProfilInputDto,
} from '@rni/shared';
import { API, RequestOptions, ctx } from './api.config';

/** Paramétrage de l'application (droit `admin.acces`). */
@Injectable({ providedIn: 'root' })
export class ParametrageApi {
  private readonly http = inject(HttpClient);

  droits(opts?: RequestOptions) {
    return this.http.get<DroitsMatrixDto>(`${API}/admin/droits`, ctx(opts));
  }
  updateDroits(dto: DroitsUpdateDto, opts?: RequestOptions) {
    return this.http.put<DroitsMatrixDto>(`${API}/admin/droits`, dto, ctx(opts));
  }

  profils(opts?: RequestOptions) {
    return this.http.get<ProfilAdminDto[]>(`${API}/admin/profils`, ctx(opts));
  }
  createProfil(dto: ProfilCreateDto, opts?: RequestOptions) {
    return this.http.post<ProfilAdminDto[]>(`${API}/admin/profils`, dto, ctx(opts));
  }
  updateProfil(id: number, dto: ProfilInputDto, opts?: RequestOptions) {
    return this.http.put<ProfilAdminDto[]>(`${API}/admin/profils/${id}`, dto, ctx(opts));
  }
  deleteProfil(id: number, opts?: RequestOptions) {
    return this.http.delete<ProfilAdminDto[]>(`${API}/admin/profils/${id}`, ctx(opts));
  }
  updateGestion(dto: ProfilGestionUpdateDto, opts?: RequestOptions) {
    return this.http.put<ProfilAdminDto[]>(`${API}/admin/profils/gestion`, dto, ctx(opts));
  }

  positions(opts?: RequestOptions) {
    return this.http.get<PositionServiceDto[]>(`${API}/admin/positions`, ctx(opts));
  }
  createPosition(dto: PositionInputDto, opts?: RequestOptions) {
    return this.http.post<PositionServiceDto[]>(`${API}/admin/positions`, dto, ctx(opts));
  }
  updatePosition(id: number, dto: PositionInputDto, opts?: RequestOptions) {
    return this.http.put<PositionServiceDto[]>(`${API}/admin/positions/${id}`, dto, ctx(opts));
  }

  formulaire(opts?: RequestOptions) {
    return this.http.get<FormulaireConfigDto>(`${API}/admin/formulaire`, ctx(opts));
  }
  updateFormulaire(dto: FormulaireConfigUpdateDto, opts?: RequestOptions) {
    return this.http.put<FormulaireConfigDto>(`${API}/admin/formulaire`, dto, ctx(opts));
  }

  params(opts?: RequestOptions) {
    return this.http.get<ParamAppDto[]>(`${API}/admin/parametres`, ctx(opts));
  }
  updateParam(dto: ParamAppUpdateDto, opts?: RequestOptions) {
    return this.http.put<ParamAppDto[]>(`${API}/admin/parametres`, dto, ctx(opts));
  }

  messages(opts?: RequestOptions) {
    return this.http.get<MessageDto[]>(`${API}/admin/messages`, ctx(opts));
  }
  updateMessage(dto: MessageDto, opts?: RequestOptions) {
    return this.http.put<MessageDto[]>(`${API}/admin/messages`, dto, ctx(opts));
  }
}
