import { Injectable, Logger } from '@nestjs/common';
import {
  LOCKED_PERIMETRE_PROFILS,
  PERIMETRES,
  PERIMETRE_MODULES,
  Perimetre,
  PerimetreModule,
  PerimetreProfilDto,
  PerimetreUpdateDto,
  defaultPerimetre,
} from '@rni/shared';
import { Db } from '../../database/db.service.js';
import { BusinessException } from '../business.exception.js';
import { CacheService, CacheTag, CacheTtl } from '../cache/cache.service.js';
import type { RniUser } from './current-user.js';

export type Perimetres = Record<PerimetreModule, number[] | null>;

/**
 * BR-AUTH-6 : périmètre géographique **par profil et par module** (carte, planning), paramétré par
 * le super administrateur (`t_perimetre_profil`) ; repli sur les valeurs par défaut si absent.
 */
@Injectable()
export class PerimetreService {
  private readonly logger = new Logger(PerimetreService.name);
  /** Dernière configuration lue (repli si la base est momentanément illisible). */
  private lastConfig = new Map<string, Perimetre>();

  constructor(
    private readonly db: Db,
    private readonly cache: CacheService,
  ) {}

  private async loadConfig(): Promise<Map<string, Perimetre>> {
    try {
      return await this.cache.wrap(
        'perimetre:config',
        CacheTtl.PARAM,
        async () => {
          const rows = await this.db.select<{ id_profil: number; module: PerimetreModule; perimetre: Perimetre }>(
            'SELECT id_profil, module, perimetre FROM t_perimetre_profil',
          );
          this.logger.debug(`Périmètres chargés : ${rows.length} réglage(s) en base (défauts du cahier des charges pour les autres)`);
          return (this.lastConfig = new Map(rows.map((r) => [`${r.id_profil}:${r.module}`, r.perimetre])));
        },
        [CacheTag.PARAM],
      );
    } catch (e) {
      // Paramétrage illisible : valeurs par défaut (jamais d'élargissement involontaire).
      this.logger.error(`Périmètres indisponibles, valeurs par défaut : ${(e as Error).message}`);
      return this.lastConfig;
    }
  }

  /** Après modification des périmètres : effet immédiat (comptes et périmètres relus). */
  invalidate(): void {
    this.cache.invalidate(CacheTag.PARAM, CacheTag.USERS);
  }

  async perimetreOf(idProfil: number, module: PerimetreModule): Promise<Perimetre> {
    if (LOCKED_PERIMETRE_PROFILS.includes(idProfil)) return 'national';
    return (await this.loadConfig()).get(`${idProfil}:${module}`) ?? defaultPerimetre(idProfil, module);
  }

  async neighboursOf(idRegion: number): Promise<number[]> {
    const neighbours = await this.cache.wrap(
      'ref:voisins',
      CacheTtl.REFERENTIEL,
      async () => {
        const rows = await this.db.select<{ id_region: number; id_region_voisine: number }>(
          'SELECT id_region, id_region_voisine FROM ref_nrb_region_r22',
        );
        const map = new Map<number, number[]>();
        for (const r of rows) map.set(r.id_region, [...(map.get(r.id_region) ?? []), r.id_region_voisine]);
        return map;
      },
      [CacheTag.REFERENTIEL],
    );
    return neighbours.get(idRegion) ?? [];
  }

  private async regionsFor(p: Perimetre, idRegion: number | null): Promise<number[] | null> {
    if (p === 'national') return null;
    if (idRegion == null) return [];
    if (p === 'region') return [idRegion];
    return [idRegion, ...(await this.neighboursOf(idRegion))];
  }

  /** Régions visibles par module ; `null` = toutes les régions. */
  async visibleRegions(idProfil: number, idRegion: number | null): Promise<Perimetres> {
    const [carte, planning] = await Promise.all(PERIMETRE_MODULES.map(async (m) => this.regionsFor(await this.perimetreOf(idProfil, m), idRegion)));
    return { carte, planning };
  }

  /** La région est-elle visible par l'utilisateur dans ce module ? */
  isVisible(user: RniUser, module: PerimetreModule, idRegion: number | null | undefined): boolean {
    const regions = user.perimetres[module];
    return regions == null || (idRegion != null && regions.includes(idRegion));
  }

  /** Restreint une région demandée au périmètre du module (403 si hors périmètre). */
  restrict(user: RniUser, module: PerimetreModule, requested?: number | null): number[] | null {
    if (requested != null) {
      if (!this.isVisible(user, module, requested)) {
        this.logger.warn(`Région ${requested} hors du périmètre ${module} de ${user.nigend} (régions ${user.perimetres[module]?.join(',') ?? 'toutes'})`);
        throw new BusinessException('RNI-1009', undefined, 403);
      }
      return [requested];
    }
    return user.perimetres[module];
  }

  // --- Administration (super administrateur) ------------------------------------

  async matrix(): Promise<PerimetreProfilDto[]> {
    const config = await this.loadConfig();
    const meta = await this.db.select<{ id_profil: number; libelle: string; updated_at: string | null; updated_by: string | null }>(
      `SELECT p.id_profil, p.libelle,
              to_char(max(t.updated_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
              (array_agg(t.updated_by ORDER BY t.updated_at DESC))[1] AS updated_by
         FROM ref_profil p
         LEFT JOIN t_perimetre_profil t ON t.id_profil = p.id_profil
         LEFT JOIN t_profil_classement c ON c.id_profil = p.id_profil
        GROUP BY p.id_profil, p.libelle, c.classement
        ORDER BY COALESCE(c.classement, 99)`,
    );
    return meta.map((m) => {
      const locked = LOCKED_PERIMETRE_PROFILS.includes(m.id_profil);
      const get = (mod: PerimetreModule): Perimetre =>
        locked ? 'national' : (config.get(`${m.id_profil}:${mod}`) ?? defaultPerimetre(m.id_profil, mod));
      return { id_profil: m.id_profil, libelle_profil: m.libelle, carte: get('carte'), planning: get('planning'), locked, updated_at: m.updated_at, updated_by: m.updated_by };
    });
  }

  async update(dto: PerimetreUpdateDto, by: string): Promise<PerimetreProfilDto[]> {
    if (!Array.isArray(dto?.items) || !dto.items.length) throw BusinessException.missing('items');
    const profils = new Set((await this.db.select<{ id_profil: number }>('SELECT id_profil FROM ref_profil')).map((p) => p.id_profil));
    for (const i of dto.items) {
      if (!profils.has(i.id_profil)) throw BusinessException.invalid(`Profil inconnu : ${i.id_profil}.`);
      if (!PERIMETRE_MODULES.includes(i.module)) throw BusinessException.invalid(`Module inconnu : ${i.module}.`);
      if (!PERIMETRES.includes(i.perimetre)) throw BusinessException.invalid(`Périmètre inconnu : ${i.perimetre}.`);
      if (LOCKED_PERIMETRE_PROFILS.includes(i.id_profil) && i.perimetre !== 'national') {
        throw BusinessException.forbidden('Le périmètre du super administrateur est toujours national.');
      }
    }
    await this.db.transaction(async (t) => {
      for (const i of dto.items) {
        await this.db.sequelize.query(
          `INSERT INTO t_perimetre_profil (id_profil, module, perimetre, updated_at, updated_by)
           VALUES (:id_profil, :module, :perimetre, now(), :by)
           ON CONFLICT (id_profil, module) DO UPDATE SET perimetre = EXCLUDED.perimetre, updated_at = now(), updated_by = EXCLUDED.updated_by
           WHERE t_perimetre_profil.perimetre IS DISTINCT FROM EXCLUDED.perimetre`,
          { replacements: { ...i, by }, transaction: t },
        );
      }
    });
    this.invalidate();
    this.logger.log(`Périmètres modifiés par ${by} : ${dto.items.map((i) => `profil ${i.id_profil} ${i.module}=${i.perimetre}`).join(', ')}`);
    return this.matrix();
  }
}

