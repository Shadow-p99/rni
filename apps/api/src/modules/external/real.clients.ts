import { Injectable, Logger } from '@nestjs/common';
import { BaseLayerDto, ErrorCode, GeocodeCandidate, IsochroneCollection, NeoLineDto } from '@rni/shared';
import { BusinessException } from '../../common/business.exception.js';
import type { AnyFeatureCollection, FacadeClient, GeolocClient, GeolocPosition, RemopClient } from './external.types.js';
import { getJson, joinUrl } from './http.js';
import { ParamService } from './param.service.js';

/** GEOLOC : géolocalisation des terminaux NEO (GeoJSON), jeton en en-tête `Token`. */
@Injectable()
export class HttpGeolocClient implements GeolocClient {
  private readonly logger = new Logger('Geoloc');

  constructor(private readonly params: ParamService) {}

  private async url(): Promise<{ url: string; token: string }> {
    const host = await this.params.require('rni.geoloc.hostname', ErrorCode.CONFIG_GEOLOC);
    const path = (await this.params.get('rni.geoloc.path')) ?? 'localisation';
    const token = await this.params.require('rni.geoloc.token', ErrorCode.CONFIG_GEOLOC);
    return { url: joinUrl(host, path), token };
  }

  async positions(): Promise<GeolocPosition[]> {
    const { url, token } = await this.url();
    const fc = await getJson<AnyFeatureCollection>(url, { headers: { Token: token } });
    const out: GeolocPosition[] = [];
    let ignored = 0;
    for (const f of fc?.features ?? []) {
      const c = f.geometry?.coordinates as number[] | undefined;
      const p = f.properties ?? {};
      const indicatif = (p['indicatif'] ?? p['name'] ?? p['id']) as string | undefined;
      if (!indicatif || !Array.isArray(c) || c.length < 2) {
        ignored++;
        continue;
      }
      out.push({
        indicatif: String(indicatif),
        lng: Number(c[0]),
        lat: Number(c[1]),
        horodatage: (p['horodatage'] ?? p['date'] ?? p['timestamp'] ?? null) as string | null,
      });
    }
    this.logger.debug(`GEOLOC : ${out.length} position(s)${ignored ? `, ${ignored} entrée(s) inexploitable(s) ignorée(s)` : ''}`);
    return out;
  }

  async ping(): Promise<void> {
    await this.positions();
  }
}

/** REMOP : lignes NEO d'un agent, jeton en en-tête `Token`. */
@Injectable()
export class HttpRemopClient implements RemopClient {
  private readonly logger = new Logger('Remop');

  constructor(private readonly params: ParamService) {}

  async lines(nigend: string): Promise<NeoLineDto[]> {
    const host = await this.params.require('rni.remop.hostname', ErrorCode.CONFIG_REMOP);
    const path = (await this.params.get('rni.remop.path')) ?? '/neo';
    const token = await this.params.require('rni.remop.token', ErrorCode.CONFIG_REMOP);
    const body = await getJson<{ neo?: unknown }>(joinUrl(host, `${path}/${encodeURIComponent(nigend)}`), {
      headers: { Token: token },
    });
    if (!Array.isArray(body?.neo)) {
      this.logger.debug(`REMOP : aucune ligne NEO pour ${nigend}`);
      throw new BusinessException(ErrorCode.AUCUNE_LIGNE_NEO);
    }
    this.logger.debug(`REMOP : ${body.neo.length} ligne(s) NEO pour ${nigend}`);
    return body.neo.map((l: Record<string, unknown>) => ({
      id: String(l['id'] ?? l['idGeoloc'] ?? l['numero']),
      numero: String(l['numero'] ?? l['msisdn'] ?? l['id']),
      libelle: (l['libelle'] ?? l['modele']) as string | undefined,
    }));
  }

  async ping(): Promise<void> {
    await this.params.require('rni.remop.hostname', ErrorCode.CONFIG_REMOP);
  }
}

/** Facade SIG : fonds cartographiques, géocodeur et isochrones ; jeton passé dans l'URL. */
@Injectable()
export class HttpFacadeClient implements FacadeClient {
  private readonly logger = new Logger('Facade');

  constructor(private readonly params: ParamService) {}

  private async base(pathKey: string, code: ErrorCode) {
    const host = await this.params.require('rni.facade.hostname.back', code);
    const path = await this.params.require(pathKey, code);
    const token = await this.params.require('rni.facade.token', code);
    const proxy = await this.params.get('rni.facade.proxy');
    return { url: new URL(joinUrl(host, path)), token, proxy };
  }

  async baseLayers(): Promise<BaseLayerDto[]> {
    const { url, token, proxy } = await this.base('rni.facade.path.carto', ErrorCode.CONFIG_GEOCODEUR);
    url.searchParams.set('token', token);
    const front = (await this.params.get('rni.facade.hostname.front')) ?? url.origin;
    const body = await getJson<{ baseLayers?: Partial<BaseLayerDto>[] }>(url.toString(), { proxy });
    this.logger.debug(`Facade : ${body.baseLayers?.length ?? 0} fond(s) cartographique(s)`);
    return (body.baseLayers ?? []).map((l, i) => {
      const abs = l.url && /^https?:/.test(l.url) ? l.url : joinUrl(front, l.url ?? '');
      const withToken = new URL(abs);
      if (!withToken.searchParams.has('token')) withToken.searchParams.set('token', token);
      return {
        id: l.id ?? `fond-${i}`,
        label: l.label ?? l.id ?? `Fond ${i + 1}`,
        type: l.type ?? 'wmts',
        url: decodeURI(withToken.toString()),
        layer: l.layer,
        // BR-CAR-1 : les fonds _NEO2 utilisent le matrixSet default028mm
        matrixSet: l.matrixSet ?? (l.id?.endsWith('_NEO2') ? 'default028mm' : 'PM'),
        format: l.format ?? 'image/png',
        style: l.style ?? 'normal',
        attribution: l.attribution,
        maxZoom: l.maxZoom ?? 18,
        visible: false,
      };
    });
  }

  async geocode(address: string): Promise<GeocodeCandidate[]> {
    const { url, token, proxy } = await this.base('rni.facade.path.geocodeur', ErrorCode.CONFIG_GEOCODEUR);
    url.searchParams.set('token', token);
    url.searchParams.set('SingleLine', address);
    url.searchParams.set('f', 'json');
    url.searchParams.set('outSR', '4326');
    url.searchParams.set('maxLocations', '10');
    const body = await getJson<{ candidates?: { address: string; location: { x: number; y: number }; score: number }[] }>(url.toString(), { proxy });
    if (!Array.isArray(body?.candidates)) throw new BusinessException(ErrorCode.AUCUNE_ADRESSE);
    // L'adresse saisie n'est pas journalisée (elle peut désigner une personne)
    this.logger.debug(`Géocodeur : ${body.candidates.length} candidat(s) pour une adresse de ${address.length} caractère(s)`);
    return body.candidates.map((c) => ({ address: c.address, x: c.location.x, y: c.location.y, score: c.score }));
  }

  async isochrones(lng: number, lat: number, timebreaks: number[]): Promise<IsochroneCollection> {
    const { url, token, proxy } = await this.base('rni.facade.path.isochrone', ErrorCode.CONFIG_ISOCHRONE);
    url.searchParams.set('token', token);
    url.searchParams.set('x', String(lng));
    url.searchParams.set('y', String(lat));
    url.searchParams.set('timebreaks', timebreaks.join(','));
    url.searchParams.set('f', 'geojson');
    const fc = await getJson<AnyFeatureCollection>(url.toString(), { proxy, timeoutMs: 30_000 });
    this.logger.debug(`Isochrones (${lng.toFixed(4)}, ${lat.toFixed(4)}) : ${fc.features?.length ?? 0} zone(s), paliers ${timebreaks.join('/')} min`);
    return {
      type: 'FeatureCollection',
      features: (fc.features ?? []).map((f) => ({
        type: 'Feature',
        geometry: f.geometry as IsochroneCollection['features'][number]['geometry'],
        properties: { timebreak: Number(f.properties?.['timebreak'] ?? f.properties?.['ToBreak'] ?? 0) },
      })),
    };
  }

  async ping(): Promise<void> {
    await this.baseLayers();
  }
}
