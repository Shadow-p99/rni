import { Injectable, computed, inject, signal } from '@angular/core';
import { CreneauDto, FALLBACK_POS_COLOR, NO_PLANNING_COLOR, PARAM_COULEUR_SANS_PLANNING, PositionServiceDto, ProfilDto, RegionDto } from '@rni/shared';
import { firstValueFrom } from 'rxjs';
import { ServiceApi } from '../api/service.api';
import { ConfigService } from '../config/config.service';

/** Référentiels mis en cache (positions de service et couleurs, créneaux, profils, régions). */
@Injectable({ providedIn: 'root' })
export class ReferentielService {
  private readonly api = inject(ServiceApi);
  private readonly config = inject(ConfigService);
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
  /** BR-PLA-4 : positions restreintes (`is_restreinte`, Administration › Positions). */
  readonly restrictedPositions = computed(() => this.positions().filter((p) => p.is_restreinte).map((p) => p.id_pos_service));
  /** BR-CAR-4 : positions donnant leur couleur aux clusters, par priorité. */
  readonly clusterPriority = computed(() =>
    this.positions()
      .filter((p) => p.priorite_cluster != null)
      .sort((a, b) => a.priorite_cluster! - b.priorite_cluster!)
      .map((p) => p.id_pos_service),
  );
  /** BR-CAR-3 : couleur d'un personnel sans planning (`rni.carte.couleur_sans_planning`). */
  readonly noPlanningColor = computed(() => {
    const v = this.config.param(PARAM_COULEUR_SANS_PLANNING);
    return v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : NO_PLANNING_COLOR;
  });
  /** Identifiants de profils triés selon l'ordre d'affichage paramétré (Administration › Profils). */
  sortProfils(ids: readonly number[]): number[] {
    const rank = new Map(this.profils().map((p, i) => [p.id_profil, i]));
    return [...ids].sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999) || a - b);
  }

  /** Profils (libellés paramétrés en base), dans l'ordre d'affichage. */
  profilLibelle(id: number | null | undefined): string {
    return this.profils().find((p) => p.id_profil === id)?.libelle ?? (id != null ? `Profil ${id}` : '—');
  }

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
    if (id == null) return this.noPlanningColor();
    return this.positions().find((p) => p.id_pos_service === id)?.color ?? FALLBACK_POS_COLOR;
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
