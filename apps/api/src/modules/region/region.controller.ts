import { Controller, Get, Query } from '@nestjs/common';
import { PerimetreModule, RegionCountsDto, RegionDto, compactToIso, isIsoDate } from '@rni/shared';
import { CurrentUser, type RniUser } from '../../common/auth/current-user.js';
import { PerimetreService } from '../../common/auth/perimetre.service.js';
import { BusinessException } from '../../common/business.exception.js';
import { CacheService, CacheTag, CacheTtl, JsonPayload, regionsKey } from '../../common/cache/cache.service.js';
import { Op } from 'sequelize';
import { RefRegion, RegionCenter } from '../../database/models/index.js';
import { PlanningService } from '../planning/planning.service.js';


function toModule(v?: string): PerimetreModule {
  if (v == null || v === '' || v === 'planning') return 'planning';
  if (v === 'carte') return 'carte';
  throw BusinessException.invalid('Module inconnu (carte ou planning).');
}

@Controller('region')
export class RegionController {
  constructor(
    private readonly perimetre: PerimetreService,
    private readonly planning: PlanningService,
    private readonly cache: CacheService,
  ) {}

  private async regions(ids: number[] | null): Promise<RegionDto[]> {
    if (ids && !ids.length) return [];
    return this.cache.wrap(`ref:regions:${regionsKey(ids)}`, CacheTtl.REFERENTIEL, () => this.loadRegions(ids), [CacheTag.REFERENTIEL]);
  }

  private async loadRegions(ids: number[] | null): Promise<RegionDto[]> {
    const where = ids ? { id_region: { [Op.in]: ids } } : {};
    const [regions, centers] = await Promise.all([
      RefRegion.findAll({ where, order: [['libelle', 'ASC']], raw: true }),
      RegionCenter.findAll({ where, raw: true }),
    ]);
    const byId = new Map(centers.map((c) => [c.id_region, c]));
    return regions.map((r) => {
      const c = byId.get(r.id_region);
      return { id_region: r.id_region, libelle: r.libelle, center: c ? { lat: c.y, lng: c.x, zoom: c.zoom ?? 7 } : null };
    });
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
  async counts(@CurrentUser() user: RniUser): Promise<JsonPayload> {
    // Partagé par tous les utilisateurs de même périmètre ; la clé change à chaque créneau (08h / 18h).
    const regionsVisible = user.perimetres.planning;
    const key = `counts:${regionsKey(regionsVisible)}:${await this.planning.slotsKey()}`;
    return this.cache.wrapJson(key, CacheTtl.PLANNING, () => this.loadCounts(user), [CacheTag.PLANNING, CacheTag.USERS]);
  }

  private async loadCounts(user: RniUser): Promise<RegionCountsDto[]> {
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
    return this.cache.wrapJson(`daily:${regionsKey(regions)}:${f}:${t}`, CacheTtl.PLANNING, () => this.planning.dailyCounts(regions, f, t), [CacheTag.PLANNING, CacheTag.USERS]);
  }
}
