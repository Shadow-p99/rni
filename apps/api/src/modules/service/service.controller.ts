import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import {
  AliveCheckDto,
  AppInfoDto,
  BaseLayerDto,
  ErrorCode,
  GeocodeCandidate,
  IsochroneCollection,
  MockUserDto,
  Droit,
} from '@rni/shared';
import { readFileSync } from 'node:fs';
import { CurrentUser, type RniUser } from '../../common/auth/current-user.js';
import { NoAudit, Public, RequireDroit } from '../../common/auth/decorators.js';
import { BusinessException } from '../../common/business.exception.js';
import { CacheService } from '../../common/cache/cache.service.js';
import { APP_CONFIG, type AppConfig } from '../../config/configuration.js';
import { Op } from 'sequelize';
import { Db } from '../../database/db.service.js';
import { RefUser, UserDetail } from '../../database/models/index.js';
import { FACADE_CLIENT, type FacadeClient, GEOLOC_CLIENT, type GeolocClient, REMOP_CLIENT, type RemopClient } from '../external/external.types.js';
import { ParamService } from '../external/param.service.js';
import { UsersService } from '../users/users.service.js';

const VERSION = (() => {
  try {
    return (JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as { version: string }).version;
  } catch {
    return '0.0.0';
  }
})();

const FALLBACK_LAYER: BaseLayerDto = {
  id: 'osm',
  label: 'OpenStreetMap',
  type: 'xyz',
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© contributeurs OpenStreetMap',
  maxZoom: 19,
  visible: true,
};

@Controller('service')
export class ServiceController {
  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly db: Db,
    private readonly params: ParamService,
    private readonly users: UsersService,
    @Inject(GEOLOC_CLIENT) private readonly geoloc: GeolocClient,
    @Inject(REMOP_CLIENT) private readonly remop: RemopClient,
    @Inject(FACADE_CLIENT) private readonly facade: FacadeClient,
    private readonly cache: CacheService,
  ) {}

  /** Informations API + base (santé). */
  @Get()
  @Public()
  @NoAudit()
  async info(): Promise<AppInfoDto> {
    let database: AppInfoDto['database'] = { ok: false };
    let permanence: string | null = null;
    try {
      const version = await this.db.sequelize.databaseVersion();
      // Version du serveur PostgreSQL : information utile en recette, masquée en production.
      database = { ok: true, name: this.cfg.db.database, ...(this.cfg.isProduction ? {} : { version: `PostgreSQL ${version.split(' ')[0]}` }) };
      permanence = await this.params.get('rni.permanence.gign');
    } catch {
      /* base indisponible : renseigné par ok=false */
    }
    return {
      name: 'RNI API',
      version: VERSION,
      environment: this.cfg.env,
      mockAuth: this.cfg.mockAuth,
      mockExternal: this.cfg.mockExternal,
      permanenceGign: permanence,
      database,
    };
  }

  /** Sonde de vie : connexion à la base vérifiée (sans journalisation Splunk). */
  @Get('alive')
  @Public()
  @NoAudit()
  async alive(): Promise<{ status: string }> {
    try {
      await this.db.sequelize.authenticate({ logging: false });
      return { status: 'Base RNI OK' };
    } catch {
      throw new BusinessException(ErrorCode.BASE_INDISPONIBLE, undefined, 503);
    }
  }

  /** Paramètres applicatifs exposables au client (`is_front`), jamais les jetons. */
  @Get('configuration')
  @Public()
  @NoAudit()
  configuration(@Query('idConfig') idConfig?: string) {
    return this.params.front(idConfig);
  }

  /** Page /testvie : état de chaque dépendance. */
  @Get('testvie')
  @Public()
  @NoAudit()
  testvie(): Promise<AliveCheckDto[]> {
    // Route publique qui appelle les services externes : résultat mutualisé 10 s (pas d'amplification).
    return this.cache.wrap('testvie', 10_000, () => this.runTestvie());
  }

  private async runTestvie(): Promise<AliveCheckDto[]> {
    const check = async (service: string, fn: () => Promise<unknown>): Promise<AliveCheckDto> => {
      const t = Date.now();
      try {
        await fn();
        return { service, ok: true, durationMs: Date.now() - t };
      } catch (e) {
        const err = e as BusinessException & Error;
        return { service, ok: false, durationMs: Date.now() - t, message: err.code ?? err.message };
      }
    };
    const suffix = this.cfg.mockExternal ? ' (simulé)' : '';
    return Promise.all([
      check('API', async () => undefined),
      check('Base de données', () => this.alive()),
      check(`Facade SIG${suffix}`, () => this.facade.ping()),
      check(`GEOLOC${suffix}`, () => this.geoloc.ping()),
      check(`REMOP${suffix}`, () => this.remop.ping()),
    ]);
  }

  /** BR-CAR-1 : fonds cartographiques fournis par la Facade, repli OSM si indisponible. */
  @Get('carto')
  async carto(): Promise<BaseLayerDto[]> {
    try {
      const layers = await this.facade.baseLayers();
      if (!layers.length) return [FALLBACK_LAYER];
      // OSM visible par défaut s'il est proposé, sinon le premier fond.
      const osm = layers.find((l) => l.type === 'xyz' && /openstreetmap/i.test(l.url));
      return osm ? layers.map((l) => ({ ...l, visible: l === osm })) : [FALLBACK_LAYER, ...layers.map((l) => ({ ...l, visible: false }))];
    } catch {
      return [FALLBACK_LAYER];
    }
  }

  /** Géolocalisation brute des terminaux NEO du périmètre (référents / GIGN). */
  @Get('geoloc')
  @RequireDroit(Droit.CARTE_GEOLOC)
  async geolocPositions(@CurrentUser() user: RniUser) {
    const positions = await this.geoloc.positions();
    const regions = user.perimetres.carte;
    if (regions == null) return positions;
    const allowed = regions.length
      ? await RefUser.findAll({
          attributes: ['geoloc_indicatif'],
          where: { geoloc_indicatif: { [Op.ne]: null }, bool_user_inactif: false, id_region: { [Op.in]: regions } },
          raw: true,
        })
      : [];
    const set = new Set(allowed.map((a) => a.geoloc_indicatif));
    return positions.filter((p) => set.has(p.indicatif));
  }

  /** Géocodeur d'adresses (Facade). */
  @Get('coordinates')
  async coordinates(@Query('address') address: string): Promise<GeocodeCandidate[]> {
    if (!address?.trim()) throw BusinessException.missing('address');
    return this.facade.geocode(address.trim().slice(0, 256));
  }

  /** BR-CAR-6 : isochrones (timebreaks paramétrés, 30/60/90 min par défaut). */
  @Get('isochrone')
  @RequireDroit(Droit.CARTE_ISOCHRONE)
  async isochrone(@Query('x') x: string, @Query('y') y: string): Promise<IsochroneCollection> {
    const lng = Number(x);
    const lat = Number(y);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw BusinessException.invalid('Coordonnées invalides.');
    }
    return this.facade.isochrones(lng, lat, await this.params.timebreaks());
  }

  /** Lignes NEO d'un agent (REMOP). */
  @Get('listTelUser/:nigend')
  listTelUser(@CurrentUser() user: RniUser, @Param('nigend') nigend: string) {
    return this.users.neoLines(user, nigend);
  }

  /** Développement : comptes simulables (sélecteur de profil du client). */
  @Get('mock-users')
  @Public()
  @NoAudit()
  async mockUsers(): Promise<MockUserDto[]> {
    if (!this.cfg.mockAuth) throw BusinessException.notFound();
    const users = await UserDetail.findAll({
      attributes: ['nigend', 'nom', 'prenom', 'id_profil', 'libelle_profil', 'libelle_region', 'id_region', 'classement'],
      where: { bool_user_inactif: false },
      raw: true,
    });
    // 3 comptes par profil, Île-de-France (11) d'abord
    const key = (u: (typeof users)[number]) => [u.id_region === 11 ? 0 : 1, u.id_region ?? 9999, u.nigend] as const;
    const byProfil = new Map<number, typeof users>();
    for (const u of [...users].sort((a, b) => {
      const ka = key(a), kb = key(b);
      return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2]);
    })) {
      const list = byProfil.get(u.id_profil) ?? [];
      if (list.length < 3) byProfil.set(u.id_profil, [...list, u]);
    }
    return [...byProfil.values()]
      .sort((a, b) => a[0].classement - b[0].classement)
      .flat()
      .map((r) => ({
        nigend: r.nigend,
        nom: r.nom,
        prenom: r.prenom,
        id_profil: r.id_profil,
        libelle_profil: r.libelle_profil ?? `Profil ${r.id_profil}`,
        libelle_region: r.libelle_region,
      }));
  }
}
