import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ErrorCode, PARAM_JOURS_GLISSANTS, parseJoursGlissants } from '@rni/shared';
import { BusinessException } from '../../common/business.exception.js';
import { ParamApp } from '../../database/models/index.js';

/** Configuration applicative en base (`t_param_app`), mise en cache 60 s. */
@Injectable()
export class ParamService {
  private cache: Map<string, ParamApp> | null = null;
  private loadedAt = 0;

  constructor(@InjectModel(ParamApp) private readonly params: typeof ParamApp) {}

  private async all(): Promise<Map<string, ParamApp>> {
    if (!this.cache || Date.now() - this.loadedAt > 60_000) {
      const rows = await this.params.findAll({ raw: true });
      this.cache = new Map(rows.map((r) => [r.cle_param_app, r]));
      this.loadedAt = Date.now();
    }
    return this.cache;
  }

  invalidate(): void {
    this.cache = null;
  }

  async get(key: string): Promise<string | null> {
    const v = (await this.all()).get(key)?.valeur;
    return v == null || v === '' ? null : v;
  }

  /** Valeur obligatoire : erreur métier dédiée si la clé est absente (RNI-2002..2005). */
  async require(key: string, code: ErrorCode): Promise<string> {
    const v = await this.get(key);
    if (v == null) throw new BusinessException(code, `Clé ${key} absente de t_param_app.`);
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
  async joursGlissants(): Promise<number | null> {
    return parseJoursGlissants(await this.get(PARAM_JOURS_GLISSANTS));
  }
}
