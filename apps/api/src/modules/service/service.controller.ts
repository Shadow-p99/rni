import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import {
  ADMIN_PROFILS,
  AliveCheckDto,
  AppInfoDto,
  BaseLayerDto,
  ErrorCode,
  GeocodeCandidate,
  IsochroneCollection,
  MockUserDto,
  PROFIL_LIBELLES,
  Profil,
} from '@rni/shared';
import { readFileSync } from 'node:fs';
import { CurrentUser, type RniUser } from '../../common/auth/current-user.js';
import { NoAudit, Profiles, Public } from '../../common/auth/decorators.js';
import { BusinessException } from '../../common/business.exception.js';
import { APP_CONFIG, type AppConfig } from '../../config/configuration.js';
import { Db } from '../../database/db.service.js';
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
  ) {}

  /** Informations API + base (santé). */
  @Get()
  @Public()
  @NoAudit()
  async info(): Promise<AppInfoDto> {
    let database: AppInfoDto['database'] = { ok: false };
    let permanence: string | null = null;
    try {
      const r = await this.db.one<{ name: string; version: string }>('SELECT current_database() AS name, version() AS version');
      database = { ok: true, name: r?.name, version: r?.version?.split(' ').slice(0, 2).join(' ') };
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

  /** Sonde de vie : `SELECT 'Base RNI OK'` (sans journalisation Splunk). */
  @Get('alive')
  @Public()
  @NoAudit()
  async alive(): Promise<{ status: string }> {
    try {
      const r = await this.db.one<{ status: string }>(`SELECT 'Base RNI OK' AS status`);
      return { status: r!.status };
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
  async testvie(): Promise<AliveCheckDto[]> {
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
  @Profiles(...ADMIN_PROFILS)
  async geolocPositions(@CurrentUser() user: RniUser) {
    const positions = await this.geoloc.positions();
    const regions = user.perimetres.carte;
    if (regions == null) return positions;
    const allowed = await this.db.select<{ geoloc_indicatif: string }>(
      `SELECT geoloc_indicatif FROM ref_user WHERE geoloc_indicatif IS NOT NULL AND NOT bool_user_inactif AND id_region IN (:regions)`,
      { regions: regions.length ? regions : [-1] },
    );
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
  @Profiles(...ADMIN_PROFILS)
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
    const rows = await this.db.select<MockUserDto & { rn: number }>(
      `SELECT nigend, nom, prenom, id_profil, libelle_profil, libelle_region, rn FROM (
         SELECT u.*, row_number() OVER (PARTITION BY id_profil ORDER BY (id_region = 11) DESC NULLS LAST, id_region, nigend) AS rn
           FROM v_user_detail u WHERE NOT bool_user_inactif) s
        WHERE rn <= 3 ORDER BY classement, rn`,
    );
    return rows.map(({ rn: _rn, ...r }) => ({ ...r, libelle_profil: r.libelle_profil ?? PROFIL_LIBELLES[r.id_profil as Profil] }));
  }
}
