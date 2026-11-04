import { Controller, Get, Query } from '@nestjs/common';
import type { CreneauDto, PositionServiceDto, ProfilDto } from '@rni/shared';
import { Db } from '../../database/db.service.js';

@Controller('referentiel')
export class ReferentielController {
  constructor(private readonly db: Db) {}

  /** Positions de service ; `actif=true` restreint aux positions saisissables (dette §9.7). */
  @Get('positions')
  positions(@Query('actif') actif?: string): Promise<PositionServiceDto[]> {
    return this.db.select<PositionServiceDto>(
      `SELECT id_pos_service, libelle, color, is_actif FROM ref_pos_service
        ${actif === 'true' ? 'WHERE is_actif' : ''} ORDER BY id_pos_service`,
    );
  }

  @Get('creneaux')
  creneaux(): Promise<CreneauDto[]> {
    return this.db.select<CreneauDto>('SELECT id_creneau, libelle FROM ref_creneaux ORDER BY id_creneau');
  }

  @Get('profils')
  profils(): Promise<ProfilDto[]> {
    return this.db.select<ProfilDto>(
      `SELECT p.id_profil, p.code, p.libelle, COALESCE(c.classement, 99) AS classement
         FROM ref_profil p LEFT JOIN t_profil_classement c ON c.id_profil = p.id_profil
        ORDER BY classement`,
    );
  }

  @Get('grades')
  grades() {
    return this.db.select('SELECT id_grade_personnel, libelle, abreviation, poids FROM ref_grade_personnel ORDER BY poids DESC');
  }

  @Get('departements')
  departements() {
    return this.db.select(
      'SELECT id_departement, libelle_departement, id_region, dept_time_zone_database FROM lien_departement_region ORDER BY id_departement',
    );
  }
}
