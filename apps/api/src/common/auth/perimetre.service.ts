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
import { PerimetreProfil, ProfilClassement, RefProfil, RegionVoisine } from '../../database/models/index.js';
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
          const rows = await PerimetreProfil.findAll({ attributes: ['id_profil', 'module', 'perimetre'], raw: true });
          this.logger.debug(`Périmètres chargés : ${rows.length} réglage(s) en base (défauts du cahier des charges pour les autres)`);
          return (this.lastConfig = new Map(rows.map((r) => [`${r.id_profil}:${r.module}`, r.perimetre as Perimetre])));
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
        const rows = await RegionVoisine.findAll({ raw: true });
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
    const [profils, classements, reglages] = await Promise.all([
      RefProfil.findAll({ attributes: ['id_profil', 'libelle'], raw: true }),
      ProfilClassement.findAll({ raw: true }),
      PerimetreProfil.findAll({ attributes: ['id_profil', 'updated_at', 'updated_by'], raw: true }),
    ]);
    const rank = new Map(classements.map((c) => [c.id_profil, c.classement]));
    // Dernière modification par profil (tous modules confondus)
    const last = new Map<number, { at: Date; by: string | null }>();
    for (const r of reglages) {
      const cur = last.get(r.id_profil);
      if (!cur || new Date(r.updated_at) > cur.at) last.set(r.id_profil, { at: new Date(r.updated_at), by: r.updated_by });
    }
    const meta = profils
      .map((p) => ({ id_profil: p.id_profil, libelle: p.libelle, rank: rank.get(p.id_profil) ?? 99, last: last.get(p.id_profil) }))
      .sort((a, b) => a.rank - b.rank)
      .map((p) => ({ ...p, updated_at: p.last ? p.last.at.toISOString().replace(/\.\d{3}Z$/, 'Z') : null, updated_by: p.last?.by ?? null }));
    return meta.map((m) => {
      const locked = LOCKED_PERIMETRE_PROFILS.includes(m.id_profil);
      const get = (mod: PerimetreModule): Perimetre =>
        locked ? 'national' : (config.get(`${m.id_profil}:${mod}`) ?? defaultPerimetre(m.id_profil, mod));
      return { id_profil: m.id_profil, libelle_profil: m.libelle, carte: get('carte'), planning: get('planning'), locked, updated_at: m.updated_at, updated_by: m.updated_by };
    });
  }

  async update(dto: PerimetreUpdateDto, by: string): Promise<PerimetreProfilDto[]> {
    if (!Array.isArray(dto?.items) || !dto.items.length) throw BusinessException.missing('items');
    const profils = new Set((await RefProfil.findAll({ attributes: ['id_profil'], raw: true })).map((p) => p.id_profil));
    for (const i of dto.items) {
      if (!profils.has(i.id_profil)) throw BusinessException.invalid(`Profil inconnu : ${i.id_profil}.`);
      if (!PERIMETRE_MODULES.includes(i.module)) throw BusinessException.invalid(`Module inconnu : ${i.module}.`);
      if (!PERIMETRES.includes(i.perimetre)) throw BusinessException.invalid(`Périmètre inconnu : ${i.perimetre}.`);
      if (LOCKED_PERIMETRE_PROFILS.includes(i.id_profil) && i.perimetre !== 'national') {
        throw BusinessException.forbidden('Le périmètre du super administrateur est toujours national.');
      }
    }
    await this.db.transaction(async (transaction) => {
      const current = await PerimetreProfil.findAll({ transaction, lock: transaction.LOCK.UPDATE });
      const byKey = new Map(current.map((c) => [`${c.id_profil}:${c.module}`, c]));
      for (const i of dto.items) {
        const existing = byKey.get(`${i.id_profil}:${i.module}`);
        // Seules les valeurs réellement modifiées changent (date et auteur de modification)
        if (existing?.perimetre === i.perimetre) continue;
        await PerimetreProfil.upsert({ id_profil: i.id_profil, module: i.module, perimetre: i.perimetre, updated_at: new Date(), updated_by: by }, { transaction });
      }
    });
    this.invalidate();
    this.logger.log(`Périmètres modifiés par ${by} : ${dto.items.map((i) => `profil ${i.id_profil} ${i.module}=${i.perimetre}`).join(', ')}`);
    return this.matrix();
  }
}

