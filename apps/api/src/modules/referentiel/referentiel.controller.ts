import { Controller, Get, Query } from '@nestjs/common';
import type { CreneauDto, PositionServiceDto, ProfilDto } from '@rni/shared';
import { CacheService, CacheTag, CacheTtl } from '../../common/cache/cache.service.js';
import { LienDepartementRegion, ProfilClassement, RefCreneau, RefGrade, RefPosService, RefProfil } from '../../database/models/index.js';

@Controller('referentiel')
export class ReferentielController {
  constructor(private readonly cache: CacheService) {}

  /** Référentiels quasi statiques : cache d'une heure. */
  private ref<T>(key: string, load: () => Promise<T>): Promise<T> {
    return this.cache.wrap(`ref:${key}`, CacheTtl.REFERENTIEL, load, [CacheTag.REFERENTIEL]);
  }

  /** Positions de service ; `actif=true` restreint aux positions saisissables (dette §9.7). */
  @Get('positions')
  positions(@Query('actif') actif?: string): Promise<PositionServiceDto[]> {
    const active = actif === 'true';
    return this.ref(`positions:${active}`, () =>
      RefPosService.findAll({
        attributes: ['id_pos_service', 'libelle', 'color', 'is_actif'],
        where: active ? { is_actif: true } : {},
        order: [['id_pos_service', 'ASC']],
        raw: true,
      }),
    );
  }

  @Get('creneaux')
  creneaux(): Promise<CreneauDto[]> {
    return this.ref('creneaux', () => RefCreneau.findAll({ attributes: ['id_creneau', 'libelle'], order: [['id_creneau', 'ASC']], raw: true }));
  }

  @Get('profils')
  profils(): Promise<ProfilDto[]> {
    return this.ref('profils', async () => {
      const [profils, classements] = await Promise.all([
        RefProfil.findAll({ attributes: ['id_profil', 'code', 'libelle'], raw: true }),
        ProfilClassement.findAll({ raw: true }),
      ]);
      const rank = new Map(classements.map((c) => [c.id_profil, c.classement]));
      return profils.map((p) => ({ ...p, classement: rank.get(p.id_profil) ?? 99 })).sort((a, b) => a.classement - b.classement);
    });
  }

  @Get('grades')
  grades() {
    return this.ref('grades', () =>
      RefGrade.findAll({ attributes: ['id_grade_personnel', 'libelle', 'abreviation', 'poids'], order: [['poids', 'DESC']], raw: true }),
    );
  }

  @Get('departements')
  departements() {
    return this.ref('departements', () =>
      LienDepartementRegion.findAll({
        attributes: ['id_departement', 'libelle_departement', 'id_region', 'dept_time_zone_database'],
        order: [['id_departement', 'ASC']],
        raw: true,
      }),
    );
  }
}
