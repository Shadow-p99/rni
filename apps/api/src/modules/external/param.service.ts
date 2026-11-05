import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ErrorCode, NO_PLANNING_COLOR, PARAM_COULEUR_SANS_PLANNING, PARAM_JOURS_GLISSANTS, parseJoursGlissants } from '@rni/shared';
import { BusinessException } from '../../common/business.exception.js';
import { CacheService, CacheTag, CacheTtl } from '../../common/cache/cache.service.js';
import { ParamApp } from '../../database/models/index.js';

/** Configuration applicative en base (`t_param_app`), mise en cache 60 s (étiquette `param`). */
@Injectable()
export class ParamService {
  private readonly logger = new Logger(ParamService.name);

  constructor(
    @InjectModel(ParamApp) private readonly params: typeof ParamApp,
    private readonly cache: CacheService,
  ) {}

  private all(): Promise<Map<string, ParamApp>> {
    return this.cache.wrap(
      'param:all',
      CacheTtl.PARAM,
      async () => {
        const rows = await this.params.findAll({ raw: true });
        this.logger.debug(`Paramètres t_param_app chargés : ${rows.length} clé(s)`);
        return new Map(rows.map((r) => [r.cle_param_app, r]));
      },
      [CacheTag.PARAM],
    );
  }

  /** Après une modification directe en base : effet immédiat. */
  invalidate(): void {
    this.cache.invalidate(CacheTag.PARAM);
  }

  async get(key: string): Promise<string | null> {
    const v = (await this.all()).get(key)?.valeur;
    return v == null || v === '' ? null : v;
  }

  /** Valeur obligatoire : erreur métier dédiée si la clé est absente (RNI-2002..2005). */
  async require(key: string, code: ErrorCode): Promise<string> {
    const v = await this.get(key);
    if (v == null) {
      this.logger.error(`Paramètre obligatoire ${key} absent ou vide dans t_param_app (${code}).`);
      throw new BusinessException(code, `Clé ${key} absente de t_param_app.`);
    }
    return v;
  }

  /** Paramètres exposables au client (jamais les jetons ni les URLs back). */
  async front(idConfig?: string): Promise<Record<string, string | null>> {
    const out: Record<string, string | null> = {};
    for (const [k, p] of await this.all()) {
      if (p.is_front && (!idConfig || k === idConfig || k.startsWith(`${idConfig}.`))) out[k] = p.valeur ?? null;
    }
    return out;
  }

  async timebreaks(): Promise<number[]> {
    const raw = (await this.get('rni.facade.param.isochrone.timebreaks')) ?? '30,60,90';
    return raw
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  /** Nombre de jours glissants du planning (`null` : règle M-1). */
  /** BR-CAR-3 : couleur d'un personnel sans planning (`rni.carte.couleur_sans_planning`). */
  async couleurSansPlanning(): Promise<string> {
    const v = (await this.get(PARAM_COULEUR_SANS_PLANNING))?.trim();
    return v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : NO_PLANNING_COLOR;
  }

  async joursGlissants(): Promise<number | null> {
    return parseJoursGlissants(await this.get(PARAM_JOURS_GLISSANTS));
  }
}
