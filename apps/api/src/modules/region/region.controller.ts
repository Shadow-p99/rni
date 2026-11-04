import { Controller, Get, Query } from '@nestjs/common';
import { PerimetreModule, RegionCountsDto, RegionDto, compactToIso, isIsoDate } from '@rni/shared';
import { CurrentUser, type RniUser } from '../../common/auth/current-user.js';
import { PerimetreService } from '../../common/auth/perimetre.service.js';
import { BusinessException } from '../../common/business.exception.js';
import { Db } from '../../database/db.service.js';
import { PlanningService } from '../planning/planning.service.js';

interface RegionRow {
  id_region: number;
  libelle: string;
  x: number | null;
  y: number | null;
  zoom: number | null;
}

function toModule(v?: string): PerimetreModule {
  if (v == null || v === '' || v === 'planning') return 'planning';
  if (v === 'carte') return 'carte';
  throw BusinessException.invalid('Module inconnu (carte ou planning).');
}

@Controller('region')
export class RegionController {
  constructor(
    private readonly db: Db,
    private readonly perimetre: PerimetreService,
    private readonly planning: PlanningService,
  ) {}

  private async regions(ids: number[] | null): Promise<RegionDto[]> {
    if (ids && !ids.length) return [];
    const rows = await this.db.select<RegionRow>(
      `SELECT r.id_region, r.libelle, c.x, c.y, c.zoom
         FROM ref_regions r LEFT JOIN t_region_center c ON c.id_region = r.id_region
        ${ids ? 'WHERE r.id_region IN (:ids)' : ''} ORDER BY r.libelle`,
      { ids },
    );
    return rows.map((r) => ({
      id_region: r.id_region,
      libelle: r.libelle,
      center: r.x != null && r.y != null ? { lat: r.y, lng: r.x, zoom: r.zoom ?? 7 } : null,
    }));
  }

  /**
   * Régions visibles par l'utilisateur (BR-AUTH-6) dans un module (`carte` ou `planning`, défaut :
   * planning), avec leur centre (t_region_center).
   */
  @Get()
  visible(@CurrentUser() user: RniUser, @Query('module') module?: string): Promise<RegionDto[]> {
    return this.regions(user.perimetres[toModule(module)]);
  }

  /** Toutes les régions (libellés), utile aux listes de filtres. */
  @Get('all')
  all(): Promise<RegionDto[]> {
    return this.regions(null);
  }

  /** Compteurs par région × position de service au créneau courant (ex-v_sum_services). */
  @Get('getNbPositionServiceByRegion')
  async counts(@CurrentUser() user: RniUser): Promise<RegionCountsDto[]> {
    const [regions, current] = await Promise.all([
      this.regions(user.perimetres.planning),
      this.planning.currentPositions(user.perimetres.planning),
    ]);
    const out = new Map<number, RegionCountsDto>(
      regions.map((r) => [r.id_region, { id_region: r.id_region, libelle: r.libelle, counts: {}, sans_planning: 0 }]),
    );
    for (const { user: u, planning } of current) {
      const r = u.id_region != null ? out.get(u.id_region) : undefined;
      if (!r) continue;
      if (!planning) r.sans_planning++;
      else r.counts[planning.id_pos_service] = (r.counts[planning.id_pos_service] ?? 0) + 1;
    }
    return [...out.values()];
  }

  /** Mobile : compteurs nationaux / région par jour, créneau et position (plage YYYYMMDD). */
  @Get('getNbPositionServiceAllRegionMobile')
  mobile(@CurrentUser() user: RniUser, @Query('from') from: string, @Query('to') to: string, @Query('region') region?: string) {
    if (!from || !to) throw BusinessException.missing('from / to');
    const iso = (v: string) => (/^\d{8}$/.test(v) ? compactToIso(v) : v);
    const f = iso(from);
    const t = iso(to);
    if (!isIsoDate(f) || !isIsoDate(t) || f > t) throw BusinessException.invalid('Période invalide.');
    const regions = this.perimetre.restrict(user, 'planning', region ? Number(region) : undefined);
    return this.planning.dailyCounts(regions, f, t);
  }
}
