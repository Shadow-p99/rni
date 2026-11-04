import { Injectable } from '@nestjs/common';
import { Perimetre, perimetreOf } from '@rni/shared';
import { Db } from '../../database/db.service.js';
import { BusinessException } from '../business.exception.js';
import type { RniUser } from './current-user.js';

/** BR-AUTH-6 : périmètre géographique (région, régions limitrophes, national). */
@Injectable()
export class PerimetreService {
  private neighbours: Map<number, number[]> | null = null;
  private loadedAt = 0;

  constructor(private readonly db: Db) {}

  async neighboursOf(idRegion: number): Promise<number[]> {
    if (!this.neighbours || Date.now() - this.loadedAt > 10 * 60_000) {
      const rows = await this.db.select<{ id_region: number; id_region_voisine: number }>(
        'SELECT id_region, id_region_voisine FROM ref_nrb_region_r22',
      );
      const map = new Map<number, number[]>();
      for (const r of rows) map.set(r.id_region, [...(map.get(r.id_region) ?? []), r.id_region_voisine]);
      this.neighbours = map;
      this.loadedAt = Date.now();
    }
    return this.neighbours.get(idRegion) ?? [];
  }

  async visibleRegions(idProfil: number, idRegion: number | null): Promise<number[] | null> {
    const p: Perimetre = perimetreOf(idProfil);
    if (p === 'national') return null;
    if (idRegion == null) return [];
    if (p === 'region') return [idRegion];
    return [idRegion, ...(await this.neighboursOf(idRegion))];
  }

  /** La région est-elle visible par l'utilisateur ? */
  isVisible(user: RniUser, idRegion: number | null | undefined): boolean {
    return user.regions_visibles == null || (idRegion != null && user.regions_visibles.includes(idRegion));
  }

  assertVisible(user: RniUser, idRegion: number | null | undefined): void {
    if (!this.isVisible(user, idRegion)) throw new BusinessException('RNI-1009', undefined, 403);
  }

  /** Restreint une liste de régions demandée au périmètre visible. */
  restrict(user: RniUser, requested?: number | null): number[] | null {
    if (requested != null) {
      if (!this.isVisible(user, requested)) throw new BusinessException('RNI-1009', undefined, 403);
      return [requested];
    }
    return user.regions_visibles;
  }
}
