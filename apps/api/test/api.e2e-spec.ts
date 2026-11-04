import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';

/** Identités du jeu de données fictif (db/dev/90-seed-dev.sql). */
const GIGN = '100001';
const LECTURE = '100002';
const OMS = '100003';
const FICHE_CRISE = '100004';
const REFERENT_IDF = '200073';
const NEGO_IDF = '200086';
const NEGO_IDF_2 = '200087';
const REFERENT_MARTINIQUE = '200091';
const SUPER_ADMIN = '100005';

describe('API RNI (e2e)', () => {
  let app: INestApplication<App>;
  const as = (nigend: string | null) => {
    const agent = request(app.getHttpServer());
    const h = nigend ? { nigend } : {};
    return {
      get: (url: string) => agent.get(`/rni/api${url}`).set(h),
      post: (url: string, body: object = {}) => agent.post(`/rni/api${url}`).set(h).send(body),
      put: (url: string, body: object = {}) => agent.put(`/rni/api${url}`).set(h).send(body),
      del: (url: string) => agent.delete(`/rni/api${url}`).set(h),
    };
  };
  const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('rni/api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('authentification (BR-AUTH-1/2/5)', () => {
    it('401 sans en-tête nigend (simulation désactivée par cookie)', async () => {
      const r = await request(app.getHttpServer()).get('/rni/api/users/me').set('Cookie', 'rni_mock_nigend=none');
      expect(r.status).toBe(401);
      expect(r.body.code).toBe('RNI-0401');
    });
    it('isUser renvoie false (et non 401) pour un nigend inconnu', async () => {
      const r = await as('999999').get('/users/isUser');
      expect(r.status).toBe(200);
      expect(r.body).toBe(false);
      expect((await as('999999').get('/users/me')).status).toBe(401);
    });
    it('isAdmin = profils 1, 3, 7', async () => {
      expect((await as(GIGN).get('/users/isAdmin')).body).toBe(true);
      expect((await as(REFERENT_IDF).get('/users/isAdmin')).body).toBe(true);
      expect((await as(NEGO_IDF).get('/users/isAdmin')).body).toBe(false);
      expect((await as(OMS).get('/users/isAdmin')).body).toBe(false);
    });
    it('profil lecture seule : GET uniquement', async () => {
      expect((await as(LECTURE).get('/planning/geojson')).status).toBe(200);
      expect((await as(LECTURE).post('/planning', {})).status).toBe(403);
    });
  });

  describe('périmètre géographique (BR-AUTH-6)', () => {
    it('périmètres par défaut : carte selon le cahier des charges, planning restreint au GIGN', async () => {
      const me = async (n: string) => (await as(n).get('/users/me')).body.perimetres as { carte: number[] | null; planning: number[] | null };
      expect(await me(GIGN)).toEqual({ carte: null, planning: null });
      expect(await me(SUPER_ADMIN)).toEqual({ carte: null, planning: null });
      const ref = await me(REFERENT_IDF);
      expect(ref.carte).toEqual(expect.arrayContaining([11, 24, 27, 28, 32, 44]));
      expect(ref.planning).toEqual([11]);
      expect((await me(NEGO_IDF)).planning).toEqual([11]);
      expect(await me(LECTURE)).toEqual({ carte: null, planning: [11] });
      expect(await me(OMS)).toEqual({ carte: [84], planning: [84] });
      // Régions par module
      const ids = async (n: string, module: string) => ((await as(n).get(`/region?module=${module}`)).body as { id_region: number }[]).map((r) => r.id_region).sort();
      expect(await ids(REFERENT_IDF, 'planning')).toEqual([11]);
      expect((await ids(REFERENT_IDF, 'carte')).length).toBe(6);
      expect((await as(REFERENT_IDF).get('/region?module=x')).body.code).toBe('RNI-1002');
    });
    it('carte : régions limitrophes visibles ; planning : sa région seule', async () => {
      const month = new Date().toISOString().slice(0, 7);
      const fc = (await as(REFERENT_IDF).get('/planning/geojson')).body;
      const carteRegions = new Set(fc.features.map((f: { properties: { id_region: number } }) => f.properties.id_region));
      expect(carteRegions.has(11)).toBe(true);
      expect(carteRegions.has(44)).toBe(true);
      expect((await as(REFERENT_IDF).get('/region/getNbPositionServiceByRegion')).body.map((r: { id_region: number }) => r.id_region)).toEqual([11]);
      expect((await as(REFERENT_IDF).get(`/planning/timetable?month=${month}&region=24`)).status).toBe(403);
    });
    it('la carte ne renvoie que les personnels du périmètre', async () => {
      const fc = (await as(OMS).get('/planning/geojson')).body;
      expect(fc.features.length).toBeGreaterThan(0);
      expect(fc.features.every((f: { properties: { id_region: number } }) => f.properties.id_region === 84)).toBe(true);
    });
    it('un filtre région hors périmètre est refusé', async () => {
      expect((await as(OMS).get('/planning/timetable?month=2026-01&region=11')).status).toBe(403);
    });
  });

  describe('planning (BR-PLA-3..10)', () => {
    let id: number;
    const base = { nigend: NEGO_IDF, id_creneaux_debut: 1, id_creneaux_fin: 2, id_pos_service: 1 };

    it('crée une plage avec adresse de l’unité par défaut (BR-PLA-6)', async () => {
      const r = await as(REFERENT_IDF).post('/planning', { ...base, date_debut: future(400), date_fin: future(406) });
      expect(r.status).toBe(201);
      expect(r.body.adresse_temp).toBeTruthy();
      expect(r.body.x_adresse_temp).toBeTypeOf('number');
      id = r.body.id_planning;
    });
    it('refuse un chevauchement, y compris aux bornes (BR-PLA-5)', async () => {
      const r = await as(REFERENT_IDF).post('/planning', { ...base, date_debut: future(406), id_creneaux_debut: 2, date_fin: future(408) });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('RNI-1005');
    });
    it('refuse une date antérieure à M-1 (BR-PLA-3)', async () => {
      const r = await as(REFERENT_IDF).post('/planning', { ...base, date_debut: '2020-01-01', date_fin: '2020-01-02' });
      expect(r.body.code).toBe('RNI-1007');
    });
    it('négociateur : Alerte / Formateur interdits (BR-PLA-4) et uniquement pour lui-même (BR-PLA-7)', async () => {
      const alerte = await as(NEGO_IDF).post('/planning', { ...base, date_debut: future(420), date_fin: future(421), id_pos_service: 4 });
      expect(alerte.body.code).toBe('RNI-1008');
      const other = await as(NEGO_IDF).post('/planning', { ...base, nigend: NEGO_IDF_2, date_debut: future(420), date_fin: future(421) });
      expect(other.status).toBe(403);
      const self = await as(NEGO_IDF).post('/planning', { ...base, date_debut: future(420), date_fin: future(421) });
      expect(self.status).toBe(201);
    });
    it('référent : uniquement sa région', async () => {
      const r = await as(REFERENT_MARTINIQUE).post('/planning', { ...base, date_debut: future(430), date_fin: future(431) });
      expect(r.status).toBe(403);
    });
    it('OMS : aucune écriture', async () => {
      expect((await as(OMS).post('/planning', { ...base, date_debut: future(430), date_fin: future(431) })).status).toBe(403);
    });
    it('insertion : scission atomique en 3 plages (BR-PLA-9/10)', async () => {
      const r = await as(REFERENT_IDF).post('/planning/insert', {
        id_planning: id, date_debut: future(402), id_creneaux_debut: 2, date_fin: future(403), id_creneaux_fin: 2, id_pos_service: 3,
      });
      expect(r.status).toBe(201);
      expect(r.body.map((p: { id_pos_service: number }) => p.id_pos_service)).toEqual([1, 3, 1]);
      expect(r.body[0]).toMatchObject({ date_debut: future(400), id_creneaux_debut: 1, date_fin: future(402), id_creneaux_fin: 1 });
      expect(r.body[2]).toMatchObject({ date_debut: future(404), id_creneaux_debut: 1, date_fin: future(406), id_creneaux_fin: 2 });
      expect((await as(GIGN).get(`/planning/${id}`)).status).toBe(404);
      id = r.body[1].id_planning;
    });
    it('insertion hors bornes refusée sans rien modifier (RNI-1006)', async () => {
      const r = await as(REFERENT_IDF).post('/planning/insert', {
        id_planning: id, date_debut: future(402), id_creneaux_debut: 2, date_fin: future(405), id_creneaux_fin: 1, id_pos_service: 1,
      });
      expect(r.body.code).toBe('RNI-1006');
      expect((await as(GIGN).get(`/planning/${id}`)).status).toBe(200);
    });
    it('suppression physique (BR-PLA-8)', async () => {
      expect((await as(REFERENT_IDF).del(`/planning/${id}`)).status).toBe(204);
      expect((await as(GIGN).get(`/planning/${id}`)).status).toBe(404);
    });
    it('recherche serveur dans tout le périmètre : seuls les agents et régions correspondants', async () => {
      const month = new Date().toISOString().slice(0, 7);
      // Agent de Grand Est : trouvé par le GIGN (national)…
      const target = (await as(GIGN).get('/users?region=44&profil=4&size=1')).body.items[0] as { nom: string; prenom: string; nigend: string };
      const r = await as(GIGN).get(`/planning/timetable?month=${month}&q=${encodeURIComponent(target.nigend)}`);
      expect(r.status).toBe(200);
      expect(r.body.filter).toEqual({ matches: 1, truncated: false });
      expect(r.body.regions).toHaveLength(1);
      expect(r.body.regions[0].id_region).toBe(44);
      expect(r.body.regions[0].users.map((u: { nigend: string }) => u.nigend)).toEqual([target.nigend]);
      // Plusieurs mots, dans le désordre
      const byName = await as(GIGN).get(`/planning/timetable?month=${month}&q=${encodeURIComponent(target.prenom + ' ' + target.nom)}`);
      expect(byName.body.regions.flatMap((x: { users: { nigend: string }[] }) => x.users.map((u) => u.nigend))).toContain(target.nigend);
      // …mais pas par un référent d'une autre région (même voisine)
      const ref = await as(REFERENT_IDF).get(`/planning/timetable?month=${month}&q=${encodeURIComponent(target.nigend)}`);
      expect(ref.body.regions).toEqual([]);
      expect(ref.body.filter.matches).toBe(0);
      // Recherche dans sa propre région
      const own = await as(REFERENT_IDF).get(`/planning/timetable?month=${month}&q=${NEGO_IDF}`);
      expect(own.body.regions.map((x: { id_region: number }) => x.id_region)).toEqual([11]);
    });
    it('filtre par position au créneau courant (0 = sans planning)', async () => {
      const month = new Date().toISOString().slice(0, 7);
      const counts = (await as(GIGN).get('/region/getNbPositionServiceByRegion')).body as { counts: Record<string, number>; sans_planning: number }[];
      const dispo = counts.reduce((s, c) => s + (c.counts['1'] ?? 0), 0);
      const sans = counts.reduce((s, c) => s + c.sans_planning, 0);
      const r = await as(GIGN).get(`/planning/timetable?month=${month}&positions=1`);
      expect(r.body.filter.matches).toBe(dispo);
      const r0 = await as(GIGN).get(`/planning/timetable?month=${month}&positions=0`);
      expect(r0.body.filter.matches).toBe(sans);
      const both = await as(GIGN).get(`/planning/timetable?month=${month}&positions=1,0`);
      expect(both.body.filter.matches).toBe(dispo + sans);
      expect((await as(GIGN).get(`/planning/timetable?month=${month}&positions=x`)).body.code).toBe('RNI-1002');
    });
    it('sans filtre : régions du périmètre, pas de bloc filter', async () => {
      const month = new Date().toISOString().slice(0, 7);
      const r = await as(REFERENT_IDF).get(`/planning/timetable?month=${month}`);
      expect(r.body.filter).toBeUndefined();
      expect(r.body.regions.map((x: { id_region: number }) => x.id_region)).toEqual([11]);
      expect((await as(GIGN).get(`/planning/timetable?month=${month}`)).body.regions.length).toBe(18);
    });
    it('calendrier mensuel tronqué aux bornes du mois (BR-PLA-2)', async () => {
      const month = new Date().toISOString().slice(0, 7);
      const r = await as(GIGN).get(`/planning/timetable?month=${month}&region=11`);
      expect(r.status).toBe(200);
      for (const u of r.body.regions[0].users)
        for (const p of u.plannings) {
          expect(p.affiche.date_debut >= r.body.first).toBe(true);
          expect(p.affiche.date_fin <= r.body.last).toBe(true);
        }
    });
  });

  describe('gestion du personnel (BR-GPU-1..4)', () => {
    it('liste : référent limité à sa région et aux profils 3/4/7', async () => {
      const r = await as(REFERENT_IDF).get('/users?size=100');
      expect(r.body.items.length).toBe(r.body.total);
      expect(r.body.items.every((u: { id_region: number; id_profil: number }) => u.id_region === 11 && [3, 4, 7].includes(u.id_profil))).toBe(true);
      expect((await as(NEGO_IDF).get('/users')).status).toBe(403);
      expect((await as(REFERENT_IDF).get('/users?region=84')).status).toBe(403);
    });
    it('pagination côté serveur : pages disjointes, total, bornes', async () => {
      const p1 = (await as(GIGN).get('/users?size=10')).body;
      const p2 = (await as(GIGN).get('/users?size=10&page=2')).body;
      expect(p1).toMatchObject({ page: 1, size: 10, capped: false });
      expect(p1.items).toHaveLength(10);
      expect(p1.total).toBeGreaterThan(20);
      const ids = new Set(p1.items.map((u: { id_user: number }) => u.id_user));
      expect(p2.items.some((u: { id_user: number }) => ids.has(u.id_user))).toBe(false);
      const last = Math.ceil(p1.total / 10);
      expect((await as(GIGN).get(`/users?size=10&page=${last + 5}`)).body.items).toEqual([]);
      expect((await as(GIGN).get('/users?size=1000')).body.code).toBe('RNI-1002');
      expect((await as(GIGN).get('/users?sort=nom;drop')).body.code).toBe('RNI-1002');
    });
    it('recherche multi-mots, filtres et tri en SQL', async () => {
      const byName = (await as(GIGN).get('/users?q=FOURNIER%20C%C3%A9line')).body;
      expect(byName.items.map((u: { nigend: string }) => u.nigend)).toEqual([REFERENT_IDF]);
      const joker = (await as(GIGN).get('/users?q=_')).body;
      expect(joker.total).toBe(0);
      const byUnit = (await as(GIGN).get('/users?q=Gironde')).body;
      expect(byUnit.total).toBeGreaterThan(0);
      const oms = (await as(GIGN).get('/users?profil=6')).body;
      expect(oms.items.every((u: { id_profil: number }) => u.id_profil === 6)).toBe(true);
      const sorted = (await as(GIGN).get('/users?sort=nigend&dir=desc&size=5')).body.items.map((u: { nigend: string }) => u.nigend);
      expect([...sorted].sort().reverse()).toEqual(sorted);
    });
    it('création depuis le RPSI, réactivation, inconnu', async () => {
      const candidates = (await as(GIGN).get('/users/rpsi?q=2000')).body as { nigend: string; id_user: number | null }[];
      const free = candidates.find((c) => !c.id_user);
      expect(free).toBeDefined();
      expect((await as(GIGN).post('/users', { nigend: free!.nigend, id_profil: 4 })).status).toBe(201);
      const unknown = await as(GIGN).post('/users', { nigend: '999999', id_profil: 4 });
      expect(unknown.body.code).toBe('RNI-1003');
      const react = await as(GIGN).post('/users', { nigend: '200005', id_profil: 4 });
      expect(react.status).toBe(201);
    });
    it('profils GIGN / OMS réservés au GIGN (BR-GPU-3)', async () => {
      expect((await as(REFERENT_IDF).post('/users', { nigend: '200016', id_profil: 1 })).status).toBe(403);
    });
    it('suppression logique (BR-GPU-4)', async () => {
      const list = (await as(REFERENT_IDF).get(`/users?q=${NEGO_IDF_2}`)).body.items as { id_user: number; nigend: string }[];
      const target = list.find((u) => u.nigend === NEGO_IDF_2)!;
      expect((await as(REFERENT_IDF).del(`/users/${target.id_user}`)).status).toBe(204);
      expect((await as(NEGO_IDF_2).get('/users/isUser')).body).toBe(false);
      expect((await as(REFERENT_IDF).post('/users', { nigend: NEGO_IDF_2, id_profil: 4 })).status).toBe(201);
    });
    it('téléphone personnel validé', async () => {
      const list = (await as(REFERENT_IDF).get(`/users?q=${NEGO_IDF}`)).body.items as { id_user: number; nigend: string }[];
      const target = list.find((u) => u.nigend === NEGO_IDF)!;
      expect((await as(REFERENT_IDF).put(`/users/${target.id_user}`, { tel_perso: '123' })).body.code).toBe('RNI-1002');
      expect((await as(REFERENT_IDF).put(`/users/${target.id_user}`, { tel_perso: '0612345678', commentaire: 'ok' })).status).toBe(200);
    });
  });

  describe('géolocalisation (§7.4, BR-REF-2)', () => {
    it('déclare un appareil NEO et calcule l’indicatif', async () => {
      const lines = (await as(NEGO_IDF).get(`/service/listTelUser/${NEGO_IDF}`)).body as { id: string }[];
      expect(lines.length).toBeGreaterThan(0);
      const me = (await as(NEGO_IDF).put('/users/infoDeviceUser', { geoloc_id_geoloc: lines[0].id })).body;
      expect(me.geoloc_indicatif).toMatch(/^RNI\d{6}$/);
      expect((await as(NEGO_IDF).put('/users/activateLocation', { isIndispo: false, value: true })).body.geoloc_bool_geoloc).toBe(true);
    });
    it('les lignes NEO d’un autre agent sont refusées à un négociateur', async () => {
      expect((await as(NEGO_IDF).get(`/service/listTelUser/${NEGO_IDF_2}`)).status).toBe(403);
    });
    it('le profil OMS peut gérer sa géolocalisation', async () => {
      expect((await as(OMS).put('/users/activateLocation', { isIndispo: true, value: false })).status).toBe(200);
    });
  });

  describe('fiches de crise (BR-FOR-1..7)', () => {
    let id: number;
    it('profils 2, 5, 6 exclus côté serveur (dette §9.3)', async () => {
      for (const n of [LECTURE, FICHE_CRISE, OMS]) expect((await as(n).get('/formulaire')).status).toBe(403);
      expect((await as(FICHE_CRISE).post('/formulaire', { nom: 'X' })).status).toBe(403);
    });
    it('création au profit de l’auteur, notes à 0', async () => {
      const r = await as(NEGO_IDF).post('/formulaire', { nom: 'TEST', crise: 'Forcené' });
      expect(r.status).toBe(201);
      expect(r.body.auteur_nigend).toBe(NEGO_IDF);
      expect(r.body.note_dangerosite).toBe(0);
      id = r.body.id_formulaire;
    });
    it('filtrage régional côté API (dette §9.4)', async () => {
      const idf = (await as(REFERENT_IDF).get('/formulaire')).body as { auteur_id_region: number }[];
      expect(idf.every((f) => f.auteur_id_region === 11)).toBe(true);
      expect((await as(REFERENT_MARTINIQUE).get(`/formulaire/${id}`)).status).toBe(403);
    });
    it('clôture réservée à l’auteur puis fiche inaltérable', async () => {
      expect((await as(REFERENT_IDF).put(`/formulaire/${id}/close`)).body.code).toBe('RNI-1008');
      expect((await as(REFERENT_IDF).put(`/formulaire/${id}`, { situation_description: 'maj' })).status).toBe(200);
      expect((await as(NEGO_IDF).put(`/formulaire/${id}/close`)).body.is_closed).toBe(true);
      expect((await as(NEGO_IDF).put(`/formulaire/${id}`, { situation_description: 'x' })).body.code).toBe('RNI-1010');
    });
    it('suppression réservée à l’auteur (RNI-1010), physique', async () => {
      expect((await as(REFERENT_IDF).del(`/formulaire/${id}`)).body.code).toBe('RNI-1010');
      expect((await as(NEGO_IDF).del(`/formulaire/${id}`)).status).toBe(204);
      expect((await as(NEGO_IDF).get(`/formulaire/${id}`)).status).toBe(404);
    });
  });

  describe('administration des périmètres (super administrateur)', () => {
    it('réservée au super administrateur', async () => {
      expect((await as(GIGN).get('/admin/perimetres')).status).toBe(403);
      expect((await as(REFERENT_IDF).put('/admin/perimetres', { items: [] })).status).toBe(403);
      const m = (await as(SUPER_ADMIN).get('/admin/perimetres')).body as { id_profil: number; carte: string; planning: string; locked: boolean }[];
      expect(m.find((r) => r.id_profil === 3)).toMatchObject({ carte: 'region_voisines', planning: 'region', locked: false });
      expect(m.find((r) => r.id_profil === 8)).toMatchObject({ carte: 'national', planning: 'national', locked: true });
    });
    it('modification appliquée immédiatement, puis rétablie', async () => {
      const month = new Date().toISOString().slice(0, 7);
      const put = (perimetre: string) => as(SUPER_ADMIN).put('/admin/perimetres', { items: [{ id_profil: 3, module: 'planning', perimetre }] });
      const r = await put('region_voisines');
      expect(r.status).toBe(200);
      expect(r.body.find((x: { id_profil: number }) => x.id_profil === 3)).toMatchObject({ planning: 'region_voisines', updated_by: SUPER_ADMIN });
      expect((await as(REFERENT_IDF).get(`/planning/timetable?month=${month}&region=24`)).status).toBe(200);
      expect((await as(REFERENT_IDF).get(`/planning/timetable?month=${month}`)).body.regions.length).toBe(6);
      await put('region');
      expect((await as(REFERENT_IDF).get(`/planning/timetable?month=${month}&region=24`)).status).toBe(403);
    });
    it('valeurs contrôlées ; super administrateur toujours national', async () => {
      expect((await as(SUPER_ADMIN).put('/admin/perimetres', { items: [{ id_profil: 3, module: 'planning', perimetre: 'monde' }] })).body.code).toBe('RNI-1002');
      expect((await as(SUPER_ADMIN).put('/admin/perimetres', { items: [{ id_profil: 3, module: 'agenda', perimetre: 'region' }] })).body.code).toBe('RNI-1002');
      expect((await as(SUPER_ADMIN).put('/admin/perimetres', { items: [{ id_profil: 99, module: 'carte', perimetre: 'region' }] })).body.code).toBe('RNI-1002');
      expect((await as(SUPER_ADMIN).put('/admin/perimetres', { items: [{ id_profil: 8, module: 'carte', perimetre: 'region' }] })).status).toBe(403);
    });
    it('droits du super administrateur : ceux du GIGN, profil attribuable par lui seul', async () => {
      expect((await as(SUPER_ADMIN).get('/users/isAdmin')).body).toBe(true);
      expect((await as(SUPER_ADMIN).get('/formulaire')).status).toBe(200);
      expect((await as(GIGN).post('/users', { nigend: '200016', id_profil: 8 })).status).toBe(403);
      const sa = (await as(GIGN).get(`/users?q=${SUPER_ADMIN}`)).body.items[0] as { id_user: number };
      expect((await as(GIGN).put(`/users/${sa.id_user}`, { commentaire: 'x' })).status).toBe(403);
    });
  });

  describe('services techniques', () => {
    it('alive, configuration publique sans jetons, testvie', async () => {
      expect((await as(null).get('/service/alive')).body.status).toBe('Base RNI OK');
      const conf = (await as(null).get('/service/configuration')).body as Record<string, string>;
      expect(conf['rni.permanence.gign']).toBeTruthy();
      expect(Object.keys(conf).some((k) => k.includes('token'))).toBe(false);
      expect(((await as(null).get('/service/testvie')).body as { ok: boolean }[]).every((c) => c.ok)).toBe(true);
    });
    it('géocodeur et isochrones 30/60/90', async () => {
      expect((await as(GIGN).get('/service/coordinates?address=Lyon')).body.length).toBeGreaterThan(0);
      expect((await as(GIGN).get('/service/coordinates?address=zzzzzz')).body.code).toBe('RNI-3001');
      const iso = (await as(GIGN).get('/service/isochrone?x=4.83&y=45.76')).body;
      expect(iso.features.map((f: { properties: { timebreak: number } }) => f.properties.timebreak).sort()).toEqual([30, 60, 90]);
      expect((await as(NEGO_IDF).get('/service/isochrone?x=4.83&y=45.76')).status).toBe(403);
    });
  });
});
