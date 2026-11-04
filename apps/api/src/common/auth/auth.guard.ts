import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_PROFILS, Profil } from '@rni/shared';
import type { Request } from 'express';
import { Db } from '../../database/db.service.js';
import { BusinessException } from '../business.exception.js';
import type { RniRequest, RniUser } from './current-user.js';
import { ALLOW_UNKNOWN_KEY, PROFILES_KEY, PUBLIC_KEY } from './decorators.js';
import { PerimetreService } from './perimetre.service.js';
import { CacheService, CacheTag, CacheTtl } from '../cache/cache.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Profils autorisés par défaut en écriture (les profils 2, 5, 6 sont en consultation). */
const DEFAULT_WRITE_PROFILES: number[] = [...ADMIN_PROFILS, Profil.NEGOCIATEUR];

interface UserRow {
  id_user: number;
  nigend: string;
  grade: string | null;
  nom: string;
  prenom: string;
  id_profil: number;
  libelle_profil: string;
  id_region: number | null;
  libelle_region: string | null;
  code_unite: string | null;
  libelle_unite: string | null;
  geoloc_id_geoloc: string | null;
  geoloc_indicatif: string | null;
  geoloc_bool_geoloc: boolean;
  geoloc_bool_indispo: boolean;
}

/**
 * Authentification déléguée (BR-AUTH-1..3) : l'identité provient des en-têtes injectés par le
 * reverse-proxy SSO (`nigend`, `cn`, `title`…) ; l'habilitation provient de `ref_user`.
 * Matrice d'autorisation déclarative (`@Profiles`), contrôles fins dans les services.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly db: Db,
    private readonly perimetre: PerimetreService,
    private readonly cache: CacheService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request & RniRequest>();
    const allowUnknown = this.reflector.getAllAndOverride<boolean>(ALLOW_UNKNOWN_KEY, targets) ?? false;
    const nigend = headerValue(req, 'nigend');

    if (!nigend) {
      if (allowUnknown) return (req.rniUser = null), true;
      this.logger.warn(`Requête sans en-tête nigend : ${req.method} ${req.originalUrl.split('?')[0]} depuis ${req.ip}`);
      throw BusinessException.unauthorized('En-tête nigend absent.');
    }

    const user = await this.loadUser(nigend, req);
    req.rniUser = user;
    if (!user) {
      if (allowUnknown) return true;
      this.logger.warn(`Nigend ${nigend} non habilité à RNI (compte absent ou inactif) : ${req.method} ${req.originalUrl.split('?')[0]}`);
      throw BusinessException.unauthorized(`Nigend ${nigend} non habilité à RNI.`);
    }

    const profiles = this.reflector.getAllAndOverride<number[]>(PROFILES_KEY, targets);
    const allowed = profiles ?? (SAFE_METHODS.has(req.method) ? null : DEFAULT_WRITE_PROFILES);
    if (allowed && !allowed.includes(user.id_profil)) {
      this.logger.warn(`Accès refusé à ${user.nigend} (profil ${user.id_profil}) : ${req.method} ${req.originalUrl.split('?')[0]} réservé aux profils ${allowed.join(', ')}`);
      throw BusinessException.forbidden();
    }
    this.logger.verbose(`Authentifié : ${user.nigend} (profil ${user.id_profil}, région ${user.id_region ?? '-'})`);
    return true;
  }

  private async loadUser(nigend: string, req: Request): Promise<RniUser | null> {
    // Une requête SQL par appel évitée : compte mis en cache 30 s, invalidé à chaque écriture de ref_user.
    const row = await this.cache.wrap(
      `auth:${nigend}`,
      CacheTtl.USER,
      () =>
        this.db.one<UserRow>(
          `SELECT id_user, nigend, grade, nom, prenom, id_profil, libelle_profil, id_region, libelle_region,
                  code_unite, libelle_unite, geoloc_id_geoloc, geoloc_indicatif, geoloc_bool_geoloc, geoloc_bool_indispo
             FROM v_user_detail WHERE nigend = :nigend AND NOT bool_user_inactif`,
          { nigend },
        ),
      [CacheTag.USERS],
    );
    if (!row) return null;
    const cn = headerValue(req, 'cn');
    const title = headerValue(req, 'title');
    return {
      ...row,
      displayname: [title, cn].filter(Boolean).join(' ') || `${row.grade ?? ''} ${row.prenom} ${row.nom}`.trim(),
      perimetres: await this.perimetre.visibleRegions(row.id_profil, row.id_region),
    };
  }
}

export function headerValue(req: Request, name: string): string | undefined {
  const v = req.headers[name];
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return undefined;
  // Les en-têtes SSO peuvent être encodés (accents) : décodage best-effort.
  try {
    return decodeURIComponent(s).trim() || undefined;
  } catch {
    return s.trim() || undefined;
  }
}
