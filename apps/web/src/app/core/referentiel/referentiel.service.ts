import { Injectable, computed, inject, signal } from '@angular/core';
import { CreneauDto, DEFAULT_POS_COLORS, NO_PLANNING_COLOR, PositionServiceDto, PosService, ProfilDto, RegionDto } from '@rni/shared';
import { firstValueFrom } from 'rxjs';
import { ServiceApi } from '../api/service.api';

/** Référentiels mis en cache (positions de service et couleurs, créneaux, profils, régions). */
@Injectable({ providedIn: 'root' })
export class ReferentielService {
  private readonly api = inject(ServiceApi);
  readonly positions = signal<PositionServiceDto[]>([]);
  readonly creneaux = signal<CreneauDto[]>([]);
  readonly profils = signal<ProfilDto[]>([]);
  /** Régions visibles sur le planning (BR-AUTH-6, paramétrable par profil). */
  readonly regions = signal<RegionDto[]>([]);
  /** Régions visibles sur la carte (périmètre propre à la carte). */
  readonly carteRegions = signal<RegionDto[]>([]);
  readonly allRegions = signal<RegionDto[]>([]);
  readonly loaded = signal(false);
  private loading: Promise<boolean> | null = null;

  readonly activePositions = computed(() => this.positions().filter((p) => p.is_actif));

  /** Charge les référentiels (une fois) ; `false` si l'API ne répond pas — un nouvel appel réessaie. */
  load(): Promise<boolean> {
    if (this.loaded()) return Promise.resolve(true);
    this.loading ??= (async () => {
      try {
        const o = { silent: true };
        const [positions, creneaux, profils, regions, carte, all] = await Promise.all([
          firstValueFrom(this.api.positions(o)),
          firstValueFrom(this.api.creneaux(o)),
          firstValueFrom(this.api.profils(o)),
          firstValueFrom(this.api.visibleRegions('planning', o)),
          firstValueFrom(this.api.visibleRegions('carte', o)),
          firstValueFrom(this.api.allRegions(o)),
        ]);
        this.positions.set(positions);
        this.creneaux.set(creneaux);
        this.profils.set(profils);
        this.regions.set(regions);
        this.carteRegions.set(carte);
        this.allRegions.set(all);
        this.loaded.set(true);
        return true;
      } catch {
        return false;
      } finally {
        this.loading = null;
      }
    })();
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

  /** Centre d'une région (cadrage de la carte). */
  regionCenter(id: number | null | undefined) {
    return (this.carteRegions().find((r) => r.id_region === id) ?? this.allRegions().find((r) => r.id_region === id))?.center ?? null;
  }
}
