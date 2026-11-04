import { Injectable } from '@nestjs/common';
import { perimetreOf } from '@rni/shared';
import { BusinessException } from '../business.exception.js';
import type { RniUser } from './current-user.js';

/** BR-AUTH-6 : périmètre géographique — toutes les régions pour le GIGN, sa région seule pour les autres profils. */
@Injectable()
export class PerimetreService {
  /** Régions visibles ; `null` = national. Un utilisateur non GIGN sans région ne voit rien. */
  async visibleRegions(idProfil: number, idRegion: number | null): Promise<number[] | null> {
    if (perimetreOf(idProfil) === 'national') return null;
    return idRegion == null ? [] : [idRegion];
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
