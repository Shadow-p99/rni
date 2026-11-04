import { Controller, Get, Query } from '@nestjs/common';
import type { CreneauDto, PositionServiceDto, ProfilDto } from '@rni/shared';
import { CacheService, CacheTag, CacheTtl } from '../../common/cache/cache.service.js';
import { Db } from '../../database/db.service.js';

@Controller('referentiel')
export class ReferentielController {
  constructor(
    private readonly db: Db,
    private readonly cache: CacheService,
  ) {}

  /** Référentiels quasi statiques : cache d'une heure. */
  private ref<T extends object>(key: string, sql: string): Promise<T[]> {
    return this.cache.wrap(`ref:${key}`, CacheTtl.REFERENTIEL, () => this.db.select<T>(sql), [CacheTag.REFERENTIEL]);
  }

  /** Positions de service ; `actif=true` restreint aux positions saisissables (dette §9.7). */
  @Get('positions')
  positions(@Query('actif') actif?: string): Promise<PositionServiceDto[]> {
    const active = actif === 'true';
    return this.ref<PositionServiceDto>(
      `positions:${active}`,
      `SELECT id_pos_service, libelle, color, is_actif FROM ref_pos_service
        ${active ? 'WHERE is_actif' : ''} ORDER BY id_pos_service`,
    );
  }

  @Get('creneaux')
  creneaux(): Promise<CreneauDto[]> {
    return this.ref<CreneauDto>('creneaux', 'SELECT id_creneau, libelle FROM ref_creneaux ORDER BY id_creneau');
  }

  @Get('profils')
  profils(): Promise<ProfilDto[]> {
    return this.ref<ProfilDto>(
      'profils',
      `SELECT p.id_profil, p.code, p.libelle, COALESCE(c.classement, 99) AS classement
         FROM ref_profil p LEFT JOIN t_profil_classement c ON c.id_profil = p.id_profil
        ORDER BY classement`,
    );
  }

  @Get('grades')
  grades() {
    return this.ref('grades', 'SELECT id_grade_personnel, libelle, abreviation, poids FROM ref_grade_personnel ORDER BY poids DESC');
  }

  @Get('departements')
  departements() {
    return this.ref(
      'departements',
      'SELECT id_departement, libelle_departement, id_region, dept_time_zone_database FROM lien_departement_region ORDER BY id_departement',
    );
  }
}
