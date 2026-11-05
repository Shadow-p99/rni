import { Injectable, Logger } from '@nestjs/common';
import { DROIT_CODES, LOCKED_DROITS, PORTEES, Profil, type DroitCode, type DroitsMap, type Portee } from '@rni/shared';
import { ProfilDroit, ProfilGestion, RefProfil } from '../../database/models/index.js';
import { BusinessException } from '../business.exception.js';
import { CacheService, CacheTag, CacheTtl } from '../cache/cache.service.js';
import type { RniUser } from './current-user.js';

export interface DroitsConfig {
  droits: Map<number, DroitsMap>;
  visibles: Map<number, number[]>;
  gerables: Map<number, number[]>;
  /** Profils portant un planning (`ref_profil.has_planning`). */
  planningProfils: number[];
}

const EMPTY: DroitsConfig = { droits: new Map(), visibles: new Map(), gerables: new Map(), planningProfils: [] };

/**
 * Droits par profil (`t_profil_droit`), profils listés / gérés (`t_profil_gestion`) et profils
 * planifiables (`ref_profil.has_planning`), paramétrés dans Administration. Lus en cache
 * (invalidé à chaque modification, sur tous les processus) ; si la base est momentanément
 * illisible, la dernière configuration lue est conservée (jamais d'élargissement).
 */
@Injectable()
export class DroitsService {
  private readonly logger = new Logger(DroitsService.name);
  private last: DroitsConfig = EMPTY;

  constructor(private readonly cache: CacheService) {}

  async config(): Promise<DroitsConfig> {
    try {
      return await this.cache.wrap('droits:config', CacheTtl.PARAM, () => this.load(), [CacheTag.PARAM, CacheTag.REFERENTIEL]);
    } catch (e) {
      this.logger.error(`Droits illisibles, dernière configuration conservée : ${(e as Error).message}`);
      return this.last;
    }
  }

  private async load(): Promise<DroitsConfig> {
    const [droits, gestion, profils] = await Promise.all([
      ProfilDroit.findAll({ attributes: ['id_profil', 'code_droit', 'portee'], raw: true }),
      ProfilGestion.findAll({ attributes: ['id_profil', 'id_profil_cible', 'visible', 'gerable'], raw: true }),
      RefProfil.findAll({ attributes: ['id_profil', 'has_planning'], raw: true }),
    ]);
    const cfg: DroitsConfig = { droits: new Map(), visibles: new Map(), gerables: new Map(), planningProfils: [] };
    const known = new Set<string>(DROIT_CODES);
    for (const d of droits) {
      if (!known.has(d.code_droit) || !(PORTEES as readonly string[]).includes(d.portee)) continue;
      const map = cfg.droits.get(d.id_profil) ?? {};
      map[d.code_droit as DroitCode] = d.portee as Portee;
      cfg.droits.set(d.id_profil, map);
    }
    // Le super administrateur ne perd jamais l'administration (même si la base a été modifiée à la main)
    const sa = cfg.droits.get(Profil.SUPER_ADMIN) ?? {};
    for (const code of LOCKED_DROITS) sa[code] ??= 'oui';
    cfg.droits.set(Profil.SUPER_ADMIN, sa);
    for (const g of gestion) {
      if (g.visible) cfg.visibles.set(g.id_profil, [...(cfg.visibles.get(g.id_profil) ?? []), g.id_profil_cible]);
      if (g.visible && g.gerable) cfg.gerables.set(g.id_profil, [...(cfg.gerables.get(g.id_profil) ?? []), g.id_profil_cible]);
    }
    cfg.planningProfils = profils.filter((p) => p.has_planning).map((p) => p.id_profil);
    this.logger.debug(`Droits chargés : ${droits.length} attribution(s), ${gestion.length} règle(s) de gestion, ${cfg.planningProfils.length} profil(s) planifiable(s)`);
    return (this.last = cfg);
  }

  /** Droits et règles de gestion d'un profil (copie : l'appelant peut la conserver). */
  async forProfil(idProfil: number): Promise<Pick<RniUser, 'droits' | 'profils_visibles' | 'profils_gerables'>> {
    const cfg = await this.config();
    return {
      droits: { ...(cfg.droits.get(idProfil) ?? {}) },
      profils_visibles: [...(cfg.visibles.get(idProfil) ?? [])],
      profils_gerables: [...(cfg.gerables.get(idProfil) ?? [])],
    };
  }

  async planningProfils(): Promise<number[]> {
    return (await this.config()).planningProfils;
  }
}

/** Portée du droit pour l'utilisateur (`null` = refusé). */
export function porteeDe(user: Pick<RniUser, 'droits'>, code: DroitCode): Portee | null {
  return user.droits[code] ?? null;
}

export function peut(user: Pick<RniUser, 'droits'>, code: DroitCode): boolean {
  return !!user.droits[code];
}

/** 403 si l'utilisateur n'a pas le droit ; renvoie sa portée. */
export function exigeDroit(user: Pick<RniUser, 'droits' | 'nigend'>, code: DroitCode, message?: string): Portee {
  const p = user.droits[code];
  if (!p) throw BusinessException.forbidden(message);
  return p;
}
