import { Injectable } from '@nestjs/common';
import { BaseLayerDto, ErrorCode, GeocodeCandidate, IsochroneCollection, NeoLineDto } from '@rni/shared';
import { BusinessException } from '../../common/business.exception.js';
import { Op } from 'sequelize';
import { PersonnelRpsi, RefUnite, RefUser, UserDetail } from '../../database/models/index.js';
import type { FacadeClient, GeolocClient, GeolocPosition, RemopClient } from './external.types.js';

/**
 * Simulations des services externes pour le développement (RNI_MOCK_EXTERNAL=true).
 * Elles s'appuient sur les données de la base (unités, personnel RPSI).
 */

@Injectable()
export class MockGeolocClient implements GeolocClient {
  async positions(): Promise<GeolocPosition[]> {
    const rows = (
      await UserDetail.findAll({
        attributes: ['id_user', 'geoloc_indicatif', 'x_unite', 'y_unite'],
        where: { geoloc_indicatif: { [Op.ne]: null }, geoloc_id_geoloc: { [Op.ne]: null }, x_unite: { [Op.ne]: null } },
        raw: true,
      })
    ).map((r) => ({ id_user: r.id_user, geoloc_indicatif: r.geoloc_indicatif!, x: r.x_unite!, y: r.y_unite! }));
    const t = Date.now() / 600_000; // dérive lente (10 min)
    return rows.map((r) => {
      const a = r.id_user * 2.399 + t * 0.05;
      const d = 0.03 + (r.id_user % 7) * 0.012;
      return {
        indicatif: r.geoloc_indicatif,
        lng: r.x + Math.cos(a) * d * 1.4,
        lat: r.y + Math.sin(a) * d,
        horodatage: new Date(Date.now() - (r.id_user % 45) * 60_000).toISOString(),
      };
    });
  }

  async ping(): Promise<void> {}
}

@Injectable()
export class MockRemopClient implements RemopClient {
  async lines(nigend: string): Promise<NeoLineDto[]> {
    const [ru, rp] = await Promise.all([
      RefUser.findOne({ attributes: ['numero_neo_1', 'numero_neo_2'], where: { nigend }, raw: true }),
      PersonnelRpsi.findByPk(nigend, { attributes: ['numero_neo_1', 'numero_neo_2'], raw: true }),
    ]);
    const p = { numero_neo_1: ru?.numero_neo_1 ?? rp?.numero_neo_1 ?? null, numero_neo_2: ru?.numero_neo_2 ?? rp?.numero_neo_2 ?? null };
    const nums = [p?.numero_neo_1, ...(p?.numero_neo_2 ?? '').split(',')]
      .map((s) => s?.trim())
      .filter((s): s is string => !!s);
    const unique = [...new Set(nums)];
    if (!unique.length) throw new BusinessException(ErrorCode.AUCUNE_LIGNE_NEO);
    return unique.map((numero, i) => ({ id: `NEO-${numero.replaceAll(' ', '')}`, numero, libelle: `Terminal NEO ${i + 1}` }));
  }

  async ping(): Promise<void> {}
}

/** Quelques communes de référence pour le géocodeur simulé. */
const CITIES: [string, string, number, number][] = [
  ['Paris', '75000', 2.3522, 48.8566], ['Versailles', '78000', 2.1204, 48.8049], ['Lyon', '69000', 4.8357, 45.764],
  ['Marseille', '13000', 5.3698, 43.2965], ['Toulouse', '31000', 1.4442, 43.6047], ['Nice', '06000', 7.262, 43.7102],
  ['Nantes', '44000', -1.5536, 47.2184], ['Strasbourg', '67000', 7.7521, 48.5734], ['Montpellier', '34000', 3.8767, 43.6108],
  ['Bordeaux', '33000', -0.5792, 44.8378], ['Lille', '59000', 3.0573, 50.6292], ['Rennes', '35000', -1.6778, 48.1173],
  ['Reims', '51100', 4.0317, 49.2583], ['Dijon', '21000', 5.0415, 47.322], ['Grenoble', '38000', 5.7245, 45.1885],
  ['Angers', '49000', -0.5632, 47.4784], ['Orléans', '45000', 1.9093, 47.9029], ['Tours', '37000', 0.6848, 47.3941],
  ['Caen', '14000', -0.3707, 49.1829], ['Rouen', '76000', 1.0999, 49.4432], ['Amiens', '80000', 2.2958, 49.8941],
  ['Nancy', '54000', 6.1844, 48.6921], ['Metz', '57000', 6.1757, 49.1193], ['Besançon', '25000', 6.0241, 47.2378],
  ['Limoges', '87000', 1.2611, 45.8336], ['Poitiers', '86000', 0.3404, 46.5802], ['Clermont-Ferrand', '63000', 3.087, 45.7772],
  ['Brest', '29200', -4.4861, 48.3904], ['Ajaccio', '20000', 8.7386, 41.9192], ['Bastia', '20200', 9.4509, 42.697],
  ['Perpignan', '66000', 2.8948, 42.6887], ['Pau', '64000', -0.3708, 43.2951], ['Avignon', '84000', 4.8055, 43.9493],
  ['Le Mans', '72000', 0.1996, 48.0061], ['Chartres', '28000', 1.4891, 48.4439], ['Troyes', '10000', 4.0744, 48.2973],
  ['Évry-Courcouronnes', '91000', 2.429, 48.6239], ['Cayenne', '97300', -52.3135, 4.9224], ['Saint-Denis', '97400', 55.4504, -20.8823],
  ['Fort-de-France', '97200', -61.0588, 14.6161], ['Basse-Terre', '97100', -61.7255, 15.9985], ['Mamoudzou', '97600', 45.2279, -12.7806],
];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

@Injectable()
export class MockFacadeClient implements FacadeClient {
  async baseLayers(): Promise<BaseLayerDto[]> {
    const geopf = 'https://data.geopf.fr/wmts';
    return [
      { id: 'osm', label: 'OpenStreetMap', type: 'xyz', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© contributeurs OpenStreetMap', maxZoom: 19, visible: true },
      { id: 'plan_ign', label: 'Plan IGN', type: 'wmts', url: geopf, layer: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', matrixSet: 'PM', format: 'image/png', style: 'normal', attribution: '© IGN', maxZoom: 19 },
      { id: 'ortho_ign', label: 'Photographies aériennes', type: 'wmts', url: geopf, layer: 'ORTHOIMAGERY.ORTHOPHOTOS', matrixSet: 'PM', format: 'image/jpeg', style: 'normal', attribution: '© IGN', maxZoom: 19 },
    ];
  }

  async geocode(address: string): Promise<GeocodeCandidate[]> {
    const q = norm(address.trim());
    if (!q) throw new BusinessException(ErrorCode.AUCUNE_ADRESSE);
    const out: GeocodeCandidate[] = [];
    const units = await RefUnite.findAll({ attributes: ['adresse', 'x', 'y'], where: { adresse: { [Op.ne]: null }, x: { [Op.ne]: null } }, raw: true });
    for (const u of units) if (u.adresse && u.x != null && u.y != null && norm(u.adresse).includes(q)) out.push({ address: u.adresse, x: u.x, y: u.y, score: 100 });
    for (const [name, cp, x, y] of CITIES) {
      const n = norm(name);
      if (n.startsWith(q) || q.includes(n) || cp.startsWith(q)) {
        const exact = q.includes(n);
        const label = exact && q !== n ? `${address.trim()}, ${cp} ${name}` : `${cp} ${name}`;
        out.push({ address: label, x, y, score: exact ? 95 : 90 });
      }
    }
    if (!out.length) throw new BusinessException(ErrorCode.AUCUNE_ADRESSE);
    return out.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  async isochrones(lng: number, lat: number, timebreaks: number[]): Promise<IsochroneCollection> {
    // Approximation : vitesse moyenne 70 km/h, contour déformé pour figurer le réseau routier.
    const kmPerDegLat = 111.32;
    const kmPerDegLng = 111.32 * Math.cos((lat * Math.PI) / 180);
    const seed = (lng * 13 + lat * 7) % (2 * Math.PI);
    const features = [...timebreaks]
      .sort((a, b) => b - a)
      .map((tb) => {
        const r = (tb / 60) * 70 * 0.8;
        const ring: number[][] = [];
        for (let i = 0; i <= 72; i++) {
          const th = (i / 72) * 2 * Math.PI;
          const k = 1 + 0.18 * Math.sin(5 * th + seed) + 0.08 * Math.cos(3 * th - seed);
          ring.push([lng + (Math.cos(th) * r * k) / kmPerDegLng, lat + (Math.sin(th) * r * k) / kmPerDegLat]);
        }
        ring[ring.length - 1] = ring[0];
        return { type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [ring] }, properties: { timebreak: tb } };
      });
    return { type: 'FeatureCollection', features };
  }

  async ping(): Promise<void> {}
}
