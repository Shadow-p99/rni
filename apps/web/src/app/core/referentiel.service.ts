import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CreneauDto, DEFAULT_POS_COLORS, NO_PLANNING_COLOR, PositionServiceDto, PosService, ProfilDto, RegionDto } from '@rni/shared';
import { firstValueFrom } from 'rxjs';
import { API } from './api';

/** Référentiels mis en cache (positions de service et couleurs, créneaux, profils, régions). */
@Injectable({ providedIn: 'root' })
export class ReferentielService {
  private readonly http = inject(HttpClient);
  readonly positions = signal<PositionServiceDto[]>([]);
  readonly creneaux = signal<CreneauDto[]>([]);
  readonly profils = signal<ProfilDto[]>([]);
  /** Régions visibles par l'utilisateur (BR-AUTH-6). */
  readonly regions = signal<RegionDto[]>([]);
  readonly allRegions = signal<RegionDto[]>([]);
  private loading: Promise<void> | null = null;

  readonly activePositions = computed(() => this.positions().filter((p) => p.is_actif));

  load(): Promise<void> {
    this.loading ??= (async () => {
      const [positions, creneaux, profils, regions, all] = await Promise.all([
        firstValueFrom(this.http.get<PositionServiceDto[]>(`${API}/referentiel/positions`)),
        firstValueFrom(this.http.get<CreneauDto[]>(`${API}/referentiel/creneaux`)),
        firstValueFrom(this.http.get<ProfilDto[]>(`${API}/referentiel/profils`)),
        firstValueFrom(this.http.get<RegionDto[]>(`${API}/region`)),
        firstValueFrom(this.http.get<RegionDto[]>(`${API}/region/all`)),
      ]);
      this.positions.set(positions);
      this.creneaux.set(creneaux);
      this.profils.set(profils);
      this.regions.set(regions);
      this.allRegions.set(all);
    })().catch((e) => {
      this.loading = null;
      throw e;
    });
    return this.loading;
  }

  color(id: number | null | undefined): string {
    if (id == null) return NO_PLANNING_COLOR;
    return this.positions().find((p) => p.id_pos_service === id)?.color ?? DEFAULT_POS_COLORS[id as PosService] ?? NO_PLANNING_COLOR;
  }

  libelle(id: number | null | undefined): string {
    return this.positions().find((p) => p.id_pos_service === id)?.libelle ?? '—';
  }

  regionLibelle(id: number | null | undefined): string {
    return this.allRegions().find((r) => r.id_region === id)?.libelle ?? '—';
  }
}
