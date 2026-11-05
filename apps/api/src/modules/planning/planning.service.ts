import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  ErrorCode,
  InsertPlanningDto,
  Droit,
  PersonnelCollection,
  PlageBounds,
  PersonnelPointProperties,
  PlanningDetailDto,
  PlanningDto,
  PlanningInputDto,
  PosService,
  TimetableDto,
  TimetableFilter,
  MAX_PLANNING_MATCHES,
  TimetableRegionDto,
  checkPositionAllowed,
  clipPlage,
  computeInsertion,
  splitAround,
  currentSlot,
  dateRange,
  monthBounds,
  plageSlots,
  toSlot,
  frozenMessage,
  minPlanningDate,
  validatePlageBounds,
} from '@rni/shared';
import type { Transaction } from 'sequelize';
import { AdminLogService } from '../../common/admin-log.service.js';
import { CacheService, CacheTag, CacheTtl, JsonPayload, regionsKey } from '../../common/cache/cache.service.js';
import { searchTerms } from '../../common/sql-search.js';
import type { RniUser } from '../../common/auth/current-user.js';
import { porteeDe, peut } from '../../common/auth/droits.service.js';
import { PerimetreService } from '../../common/auth/perimetre.service.js';
import { BusinessException } from '../../common/business.exception.js';
import { Db } from '../../database/db.service.js';
import { LienDepartementRegion, Planning, RefPosService, RefRegion } from '../../database/models/index.js';
import { Op } from 'sequelize';
import { ParamService } from '../external/param.service.js';
import { GEOLOC_CLIENT, type GeolocClient, type GeolocPosition } from '../external/external.types.js';
import { PlanningRepository, PlanningRow, UserPlanningRow } from './planning.repository.js';

export type PlanningUpdateInput = Omit<PlanningInputDto, 'nigend'> & { nigend?: string };

/** Valeur de filtre « sans planning » (aucune plage au créneau courant). */
const SANS_PLANNING = 0;

interface PosRow {
  id_pos_service: number;
  libelle: string;
  color: string;
  is_actif: boolean;
  is_restreinte: boolean;
  priorite_cluster: number | null;
}

@Injectable()
export class PlanningService {
  private readonly logger = new Logger(PlanningService.name);

  constructor(
    private readonly db: Db,
    private readonly repo: PlanningRepository,
    private readonly perimetre: PerimetreService,
    private readonly adminLog: AdminLogService,
    @InjectModel(Planning) private readonly plannings: typeof Planning,
    @Inject(GEOLOC_CLIENT) private readonly geoloc: GeolocClient,
    private readonly params: ParamService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Créneau courant de chaque fuseau horaire des départements (métropole, outre-mer) : composante
   * des clés de cache dépendant de l'heure, qui changent donc d'elles-mêmes à 08h / 18h locales.
   */
  async slotsKey(now = new Date()): Promise<string> {
    const zones = await this.cache.wrap(
      'ref:fuseaux',
      CacheTtl.REFERENTIEL,
      async () =>
        [
          ...new Set(
            (await LienDepartementRegion.findAll({ attributes: ['dept_time_zone_database'], raw: true }))
              .map((r) => r.dept_time_zone_database)
              .filter(Boolean)
              .concat('Europe/Paris'),
          ),
        ].sort(),
      [CacheTag.REFERENTIEL],
    );
    return [...new Set(zones.map((z) => currentSlot(now, z)))].join('.');
  }

  /** BR-PLA-3 : contrôle des bornes avec la fenêtre glissante paramétrée (`t_param_app`). */
  private async bounds(p: Partial<PlageBounds>) {
    return validatePlageBounds(p, new Date(), await this.params.joursGlissants());
  }

  /** Refus si une plage existante commence dans la partie figée du planning. */
  private async assertNotFrozen(existing: PlageBounds, action: string): Promise<void> {
    const jours = await this.params.joursGlissants();
    const min = minPlanningDate(new Date(), jours);
    if (existing.date_debut < min) {
      this.logger.debug(`Plage commençant le ${existing.date_debut} non ${action} : planning figé avant le ${min}`);
      throw new BusinessException(
        ErrorCode.INSERTION_INTERDITE,
        `${frozenMessage(min, jours)} Cette plage ne peut pas être ${action} en entier : modifiez ou supprimez seulement les créneaux à partir du ${min.split('-').reverse().join('/')}.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Lecture
  // ---------------------------------------------------------------------------

  positions(): Promise<Map<number, PosRow>> {
    return this.cache.wrap(
      'ref:positions:map',
      CacheTtl.REFERENTIEL,
      async () => new Map((await RefPosService.findAll({ raw: true })).map((r) => [r.id_pos_service, r as PosRow])),
      [CacheTag.REFERENTIEL],
    );
  }

  /**
   * Calendrier mensuel par région (§5.1, BR-PLA-2).
   * Avec `filter` (recherche / position au créneau courant), la recherche porte sur **tout le
   * périmètre** : seuls les agents correspondants et leurs régions sont renvoyés (au plus
   * MAX_PLANNING_MATCHES agents).
   */
  async timetable(user: RniUser, month: string, region?: number, filter: TimetableFilter = {}): Promise<JsonPayload> {
    let bounds: { first: string; last: string };
    try {
      bounds = monthBounds(month);
    } catch {
      throw BusinessException.invalid('Mois invalide (AAAA-MM attendu).');
    }
    const regions = this.perimetre.restrict(user, 'planning', region);
    const terms = searchTerms(filter.q);
    const positions = filter.positions?.length ? [...new Set(filter.positions)].sort((a, b) => a - b) : null;
    // Partagé par les utilisateurs de même périmètre ; le filtre « Maintenant » dépend du créneau courant.
    const key = `tt:${month}:${regionsKey(regions)}:${terms.join(' ')}:${positions?.join(',') ?? ''}:${positions ? await this.slotsKey() : ''}`;
    return this.cache.wrapJson(key, CacheTtl.PLANNING, () => this.loadTimetable(month, bounds, regions, terms, positions), [CacheTag.PLANNING, CacheTag.USERS]);
  }

  private async loadTimetable(
    month: string,
    bounds: { first: string; last: string },
    regions: number[] | null,
    terms: string[],
    positionList: number[] | null,
  ): Promise<TimetableDto> {
    const start = toSlot(bounds.first, 1);
    const end = toSlot(bounds.last, 2);
    const positions = positionList ? new Set(positionList) : null;
    const filtered = terms.length > 0 || positions != null;
    const t0 = Date.now();

    let users = await this.repo.planningUsers(regions, { terms });
    if (positions) {
      const current = await this.currentPlannings(users, regions);
      users = users.filter((u) => positions.has(current.get(u.id_user)?.id_pos_service ?? SANS_PLANNING));
    }
    const matches = users.length;
    if (filtered) users = users.slice(0, MAX_PLANNING_MATCHES);

    const [plannings, regionRows] = await Promise.all([
      this.repo.planningsBetween(start, end, regions, filtered ? { id_users: users.map((u) => u.id_user) } : {}),
      RefRegion.findAll({ where: regions ? { id_region: { [Op.in]: regions } } : {}, order: [['libelle', 'ASC']], raw: true }),
    ]);

    const byUser = new Map<number, PlanningRow[]>();
    for (const p of plannings) byUser.set(p.id_user, [...(byUser.get(p.id_user) ?? []), p]);

    const byRegion = new Map<number, TimetableRegionDto>(regionRows.map((r) => [r.id_region, { ...r, users: [] }]));
    for (const u of users) {
      if (u.id_region == null) continue;
      byRegion.get(u.id_region)?.users.push({
        id_user: u.id_user,
        nigend: u.nigend,
        grade: u.grade,
        abreviation_grade: u.abreviation_grade,
        nom: u.nom,
        prenom: u.prenom,
        id_profil: u.id_profil,
        libelle_profil: u.libelle_profil,
        code_unite: u.code_unite,
        libelle_unite: u.libelle_unite,
        id_departement: u.id_departement,
        libelle_departement: u.libelle_departement,
        plannings: (byUser.get(u.id_user) ?? []).map((p) => ({ ...strip(p), affiche: clipPlage(p, start, end)! })),
      });
    }
    const out = [...byRegion.values()];
    this.logger.debug(
      `Calendrier ${month} calculé : régions ${regions?.join(',') ?? 'toutes'}${filtered ? `, filtre (${terms.length} mot(s), positions ${positionList?.join(',') ?? '-'}) → ${matches} agent(s)` : ''}, ${users.length} agent(s), ${plannings.length} plage(s) en ${Date.now() - t0} ms`,
    );
    return filtered
      ? { month, ...bounds, regions: out.filter((r) => r.users.length), filter: { matches, truncated: matches > users.length } }
      : { month, ...bounds, regions: out };
  }

  /** Plage en cours de chaque agent, le créneau courant étant calculé dans le fuseau de son département. */
  private async currentPlannings(users: UserPlanningRow[], regions: number[] | null, now = new Date()): Promise<Map<number, PlanningRow>> {
    const out = new Map<number, PlanningRow>();
    if (!users.length) return out;
    const slots = new Map<string, number>();
    for (const u of users) if (!slots.has(u.time_zone)) slots.set(u.time_zone, currentSlot(now, u.time_zone));
    const values = [...slots.values()];
    const plannings = await this.repo.planningsBetween(Math.min(...values), Math.max(...values), regions);
    const byUser = new Map(users.map((u) => [u.id_user, slots.get(u.time_zone)!]));
    for (const p of plannings) {
      const cur = byUser.get(p.id_user);
      if (cur != null && p.slot_debut <= cur && p.slot_fin >= cur) out.set(p.id_user, p);
    }
    return out;
  }

  /** §5.5 : plannings couvrant une date (Jour ou Nuit), bornés aux profils 3/4/7. */
  async byDate(user: RniUser, date: string, filter: { region?: number; nigend?: string; id_pos_service?: number }): Promise<JsonPayload> {
    validateDate(date);
    const regions = this.perimetre.restrict(user, 'planning', filter.region);
    const key = `bydate:${date}:${regionsKey(regions)}:${filter.nigend ?? ''}:${filter.id_pos_service ?? ''}`;
    return this.cache.wrapJson(key, CacheTtl.PLANNING, () => this.loadByDate(date, regions, filter), [CacheTag.PLANNING, CacheTag.USERS]);
  }

  private async loadByDate(date: string, regions: number[] | null, filter: { nigend?: string; id_pos_service?: number }): Promise<PlanningDetailDto[]> {
    const start = toSlot(date, 1);
    const [plannings, users] = await Promise.all([
      this.repo.planningsBetween(start, start + 1, regions, { nigend: filter.nigend, id_pos_service: filter.id_pos_service }),
      this.repo.planningUsers(regions, filter.nigend ? { nigend: filter.nigend } : {}),
    ]);
    const usersById = new Map(users.map((u) => [u.id_user, u]));
    return plannings
      .filter((p) => usersById.has(p.id_user))
      .map((p) => {
        const u = usersById.get(p.id_user)!;
        return {
          ...strip(p),
          grade: u.grade,
          nom: u.nom,
          prenom: u.prenom,
          id_profil: u.id_profil,
          id_region: u.id_region,
          code_unite: u.code_unite,
          libelle_unite: u.libelle_unite,
        };
      });
  }

  /**
   * Position courante de chaque personnel visible (BR-CAR-2, BR-CAR-3), le créneau courant étant
   * calculé dans le fuseau du département de l'agent.
   */
  async currentPositions(regions: number[] | null, now = new Date()) {
    const users = await this.repo.planningUsers(regions);
    if (!users.length) return [];
    const slots = new Map<string, number>();
    for (const u of users) if (!slots.has(u.time_zone)) slots.set(u.time_zone, currentSlot(now, u.time_zone));
    const values = [...slots.values()];
    const plannings = await this.repo.planningsBetween(Math.min(...values), Math.max(...values), regions);
    // Index par agent : coût linéaire (et non agents × plannings)
    const byUser = new Map<number, PlanningRow[]>();
    for (const p of plannings) byUser.set(p.id_user, [...(byUser.get(p.id_user) ?? []), p]);
    return users.map((u) => {
      const cur = slots.get(u.time_zone)!;
      const planning = byUser.get(u.id_user)?.find((p) => p.slot_debut <= cur && p.slot_fin >= cur) ?? null;
      return { user: u, planning };
    });
  }

  /** Carte : `GET /planning/geojson` (§4.2). */
  async geojson(user: RniUser, now = new Date()): Promise<JsonPayload> {
    // Rafraîchi par chaque carte ouverte : un seul calcul par périmètre toutes les 15 s au plus.
    const key = `geo:${regionsKey(user.perimetres.carte)}:${await this.slotsKey(now)}`;
    return this.cache.wrapJson(key, CacheTtl.LIVE, () => this.loadGeojson(user, now), [CacheTag.PLANNING, CacheTag.USERS]);
  }

  private async loadGeojson(user: RniUser, now: Date): Promise<PersonnelCollection> {
    const t0 = Date.now();
    const [current, positions, geoloc, sansPlanning] = await Promise.all([
      // La carte a son propre périmètre (BR-AUTH-6 paramétrable)
      this.currentPositions(user.perimetres.carte, now),
      this.positions(),
      this.safeGeoloc(),
      this.params.couleurSansPlanning(),
    ]);
    const geolocByIndicatif = new Map(geoloc.map((g) => [g.indicatif, g]));
    const features: PersonnelCollection['features'] = [];
    for (const { user: u, planning } of current) {
      const point = resolvePoint(u, planning, geolocByIndicatif);
      if (!point) continue;
      const pos = planning ? positions.get(planning.id_pos_service) : undefined;
      const idPos = planning?.id_pos_service ?? PosService.INDISPONIBLE;
      const props: PersonnelPointProperties = {
        id_user: u.id_user,
        nigend: u.nigend,
        grade: u.grade,
        nom: u.nom,
        prenom: u.prenom,
        id_profil: u.id_profil,
        code_unite: u.code_unite,
        libelle_unite: u.libelle_unite,
        id_region: u.id_region,
        id_planning: planning?.id_planning ?? null,
        id_pos_service: idPos,
        libelle_pos_service: pos?.libelle ?? positions.get(idPos)?.libelle ?? 'Indisponible',
        // BR-CAR-3 : couleur « sans planning » (paramétrable) si aucun planning
        color: planning ? (pos?.color ?? sansPlanning) : sansPlanning,
        adresse: point.adresse,
        adresse_type: point.type,
        horodatage: point.horodatage,
        numero_neo_1: u.numero_neo_1,
        numero_neo_2: u.numero_neo_2,
        tel_perso: u.tel_perso,
        tel_unite: u.tel_unite,
        tel_pro: u.tel_pro,
        commentaire: u.commentaire,
      };
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [point.x, point.y] }, properties: props });
    }
    this.logger.debug(
      `Carte calculée : régions ${user.perimetres.carte?.join(',') ?? 'toutes'}, ${current.length} agent(s), ${features.length} point(s) dont ${features.filter((f) => f.properties.adresse_type === 'localisation').length} géolocalisé(s), ${geoloc.length} position(s) GEOLOC, en ${Date.now() - t0} ms`,
    );
    if (features.length < current.length) this.logger.verbose(`Carte : ${current.length - features.length} agent(s) sans coordonnées (unité non géocodée)`);
    return { type: 'FeatureCollection', features };
  }

  private async safeGeoloc(): Promise<GeolocPosition[]> {
    try {
      return await this.geoloc.positions();
    } catch (e) {
      // La carte reste utilisable sans GEOLOC (positions planning / unité).
      this.logger.warn(`GEOLOC indisponible : ${(e as Error).message}`);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Écriture
  // ---------------------------------------------------------------------------

  /** Agent cible d'une écriture + contrôle des droits (BR-PLA-7). */
  private async target(current: RniUser, nigend: string | undefined): Promise<UserPlanningRow> {
    if (!nigend) throw BusinessException.missing('nigend');
    const [target] = await this.repo.planningUsers(null, { nigend });
    if (!target) {
      this.logger.warn(`Écriture refusée (${current.nigend}) : aucun personnel planifiable pour le nigend ${nigend}.`);
      throw new BusinessException(ErrorCode.UTILISATEUR_INCONNU, `Aucun personnel planifiable pour le nigend ${nigend}.`);
    }
    this.assertCanWrite(current, target);
    return target;
  }

  /** BR-PLA-7 : portée du droit `planning.ecrire` (toutes les régions, sa région, soi-même). */
  assertCanWrite(current: RniUser, target: { id_user: number; id_region: number | null }): void {
    switch (porteeDe(current, Droit.PLANNING_ECRIRE)) {
      case 'national':
        return;
      case 'region':
        if (current.id_region != null && target.id_region === current.id_region) return;
        throw BusinessException.forbidden('Votre profil ne gère que les plannings de sa région.');
      case 'soi':
        if (target.id_user === current.id_user) return;
        throw BusinessException.forbidden('Votre profil ne gère que son propre planning.');
      default:
        throw BusinessException.forbidden('Votre profil ne peut pas modifier le planning.');
    }
  }

  /** BR-PLA-4 : positions restreintes (`ref_pos_service.is_restreinte`) sans le droit correspondant. */
  private async positionViolation(current: RniUser, newPosition: number | null | undefined, previous?: number | null) {
    const restricted = [...(await this.positions()).values()].filter((p) => p.is_restreinte).map((p) => p.id_pos_service);
    return checkPositionAllowed(peut(current, Droit.PLANNING_POSITIONS_RESTREINTES), restricted, newPosition, previous);
  }

  private async assertPosition(id: number | undefined): Promise<void> {
    if (id == null) throw BusinessException.missing('id_pos_service');
    const pos = (await this.positions()).get(id);
    if (!pos || !pos.is_actif) throw BusinessException.invalid('Position de service inconnue ou inactive.');
  }

  /** BR-PLA-6 : adresse temporaire saisie, sinon adresse et coordonnées de l'unité. */
  private address(dto: Partial<PlanningInputDto>, target: UserPlanningRow) {
    const hasCoords = dto.x_adresse_temp != null && dto.y_adresse_temp != null && dto.adresse_temp?.trim();
    return hasCoords
      ? { adresse_temp: dto.adresse_temp!.trim(), x_adresse_temp: Number(dto.x_adresse_temp), y_adresse_temp: Number(dto.y_adresse_temp) }
      : { adresse_temp: target.adresse_unite, x_adresse_temp: target.x_unite, y_adresse_temp: target.y_unite };
  }

  private async assertNoOverlap(idUser: number, bounds: PlageBounds, exclude: number[] = []): Promise<void> {
    const { start, end } = plageSlots(bounds);
    const overlaps = await this.repo.overlapping(idUser, start, end, exclude);
    if (overlaps.length) {
      const o = overlaps[0];
      this.logger.debug(`Chevauchement refusé pour l'agent ${idUser} : ${periode(bounds)} recoupe la plage ${o.id_planning} (${periode(o)})`);
      throw new BusinessException(
        ErrorCode.CHEVAUCHEMENT,
        `Plage existante du ${o.date_debut} (${o.id_creneaux_debut === 1 ? 'Jour' : 'Nuit'}) au ${o.date_fin} (${o.id_creneaux_fin === 1 ? 'Jour' : 'Nuit'}).`,
      );
    }
  }

  async create(current: RniUser, dto: PlanningInputDto): Promise<PlanningDto> {
    const target = await this.target(current, dto.nigend);
    const v = (await this.bounds(dto)) ?? (await this.positionViolation(current, dto.id_pos_service));
    if (v) {
      this.logger.debug(`Création refusée (${current.nigend} → ${target.nigend}, ${periode(dto)}) : ${v.code} ${v.message}`);
      throw BusinessException.from(v);
    }
    await this.assertPosition(dto.id_pos_service);
    if (dto.ecraser) return this.createOverwriting(current, target, dto);
    await this.assertNoOverlap(target.id_user, dto);
    const created = await this.plannings.create({
      id_user: target.id_user,
      date_debut: dto.date_debut,
      id_creneaux_debut: dto.id_creneaux_debut,
      date_fin: dto.date_fin,
      id_creneaux_fin: dto.id_creneaux_fin,
      id_pos_service: dto.id_pos_service,
      ...this.address(dto, target),
      created_by: current.nigend,
      updated_by: current.nigend,
    });
    this.logger.log(`Planning ${created.id_planning} créé par ${current.nigend} pour ${target.nigend} : ${periode(dto)}, position ${dto.id_pos_service}`);
    return this.get(created.id_planning);
  }

  /**
   * Plannings existants qui seraient écrasés par une saisie (aperçu avant confirmation).
   * Réservé aux utilisateurs pouvant écrire le planning de l'agent.
   */
  async overlaps(current: RniUser, dto: PlanningInputDto): Promise<PlanningDto[]> {
    const target = await this.target(current, dto.nigend);
    const v = validatePlageBounds(dto, new Date(2000, 0, 1));
    if (v) throw BusinessException.from(v);
    const { start, end } = plageSlots(dto);
    return (await this.repo.overlapping(target.id_user, start, end)).map(strip);
  }

  /**
   * Création avec écrasement, **atomique** : les plages chevauchées sont verrouillées, contrôlées
   * (BR-PLA-4 : un négociateur n'écrase pas une plage Alerte / Formateur), puis remplacées par
   * leurs parties hors période et la nouvelle plage.
   */
  private async createOverwriting(current: RniUser, target: UserPlanningRow, dto: PlanningInputDto): Promise<PlanningDto> {
    const { start, end } = plageSlots(dto);
    const id = await this.db.transaction(async (transaction) => {
      const { removed, kept } = await this.clearPeriodTx(current, target, start, end, transaction, 'écrasée');
      const created = await this.plannings.create(
        {
          id_user: target.id_user,
          date_debut: dto.date_debut,
          id_creneaux_debut: dto.id_creneaux_debut,
          date_fin: dto.date_fin,
          id_creneaux_fin: dto.id_creneaux_fin,
          id_pos_service: dto.id_pos_service,
          ...this.address(dto, target),
          created_by: current.nigend,
          updated_by: current.nigend,
        },
        { transaction },
      );
      if (removed.length) this.adminLog.trace('planning.overwrite', current.nigend, { nigend: target.nigend, ecrasees: removed, conservees: kept });
      this.logger.log(
        `Planning ${created.id_planning} créé par ${current.nigend} pour ${target.nigend} avec écrasement : ${periode(dto)}, position ${dto.id_pos_service} (${removed.length} plage(s) écrasée(s), ${kept} partie(s) conservée(s))`,
      );
      return created.id_planning;
    });
    return this.get(id);
  }

  /**
   * Suppression d'un créneau ou d'une période (sélection) : les plannings de l'agent sont retirés
   * sur [date_debut @ créneau, date_fin @ créneau], les parties hors période sont conservées.
   * Atomique ; BR-PLA-4 (un négociateur ne retire pas une plage Alerte / Formateur).
   */
  async clearPeriod(current: RniUser, dto: PlageBounds & { nigend: string }): Promise<{ supprimees: number; conservees: number }> {
    const target = await this.target(current, dto.nigend);
    const v = await this.bounds(dto);
    if (v) throw BusinessException.from(v);
    const { start, end } = plageSlots(dto);
    return this.db.transaction(async (transaction) => {
      const { removed, kept } = await this.clearPeriodTx(current, target, start, end, transaction, 'supprimée');
      if (removed.length) this.adminLog.trace('planning.clear', current.nigend, { nigend: target.nigend, periode: dto, supprimees: removed, conservees: kept });
      else this.logger.debug(`Suppression de période sans effet (${current.nigend} → ${target.nigend}, ${periode(dto)}) : aucun planning`);
      return { supprimees: removed.length, conservees: kept };
    });
  }

  /**
   * Vide la période [start, end] du planning d'un agent dans une transaction : plages chevauchées
   * verrouillées, contrôlées (BR-PLA-4), supprimées puis recréées pour leurs parties hors période.
   */
  private async clearPeriodTx(
    current: RniUser,
    target: UserPlanningRow,
    start: number,
    end: number,
    transaction: Transaction,
    verbe: 'écrasée' | 'supprimée',
  ): Promise<{ removed: number[]; kept: number }> {
    const overlaps = await this.repo.overlapping(target.id_user, start, end, [], transaction, true);
    for (const o of overlaps) {
      const v = await this.positionViolation(current, null, o.id_pos_service);
      if (v) {
        this.logger.warn(`Plage ${o.id_planning} (position ${o.id_pos_service}) non ${verbe} : position restreinte (${current.nigend}, profil ${current.id_profil}).`);
        throw BusinessException.from({ ...v, message: `${v.message} Une plage existante ne peut pas être ${verbe}.` });
      }
    }
    const pieces = overlaps.flatMap((o) =>
      splitAround(o, start, end).map((p) => ({ ...p, adresse_temp: o.adresse_temp, x_adresse_temp: o.x_adresse_temp, y_adresse_temp: o.y_adresse_temp })),
    );
    if (overlaps.length) await this.plannings.destroy({ where: { id_planning: overlaps.map((o) => o.id_planning) }, transaction });
    for (const p of pieces) {
      await this.plannings.create(
        {
          id_user: target.id_user,
          date_debut: p.date_debut,
          id_creneaux_debut: p.id_creneaux_debut,
          date_fin: p.date_fin,
          id_creneaux_fin: p.id_creneaux_fin,
          id_pos_service: p.id_pos_service,
          adresse_temp: p.adresse_temp,
          x_adresse_temp: p.x_adresse_temp,
          y_adresse_temp: p.y_adresse_temp,
          created_by: current.nigend,
          updated_by: current.nigend,
        },
        { transaction },
      );
    }
    return { removed: overlaps.map((o) => o.id_planning), kept: pieces.length };
  }

  async update(current: RniUser, id: number, dto: PlanningUpdateInput): Promise<PlanningDto> {
    const existing = await this.repo.findById(id);
    if (!existing) throw BusinessException.notFound('Planning introuvable.');
    // §5.2 : le personnel d'une plage n'est pas modifiable
    if (dto.nigend && dto.nigend !== existing.nigend) throw BusinessException.forbidden('Le personnel d’une plage ne peut pas être changé.');
    const target = await this.target(current, existing.nigend);
    await this.assertNotFrozen(existing, 'modifiée');
    const v = (await this.bounds(dto)) ?? (await this.positionViolation(current, dto.id_pos_service, existing.id_pos_service));
    if (v) {
      this.logger.debug(`Modification du planning ${id} refusée (${current.nigend}) : ${v.code} ${v.message}`);
      throw BusinessException.from(v);
    }
    await this.assertPosition(dto.id_pos_service);
    await this.assertNoOverlap(target.id_user, dto, [id]);
    await this.plannings.update(
      {
        date_debut: dto.date_debut,
        id_creneaux_debut: dto.id_creneaux_debut,
        date_fin: dto.date_fin,
        id_creneaux_fin: dto.id_creneaux_fin,
        id_pos_service: dto.id_pos_service,
        ...this.address(dto, target),
        updated_by: current.nigend,
      },
      { where: { id_planning: id } },
    );
    this.logger.log(
      `Planning ${id} modifié par ${current.nigend} pour ${existing.nigend} : ${periode(existing)} position ${existing.id_pos_service} → ${periode(dto)} position ${dto.id_pos_service}`,
    );
    return this.get(id);
  }

  /** BR-PLA-8 : suppression physique. */
  async remove(current: RniUser, id: number): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw BusinessException.notFound('Planning introuvable.');
    await this.target(current, existing.nigend);
    const v = await this.positionViolation(current, null, existing.id_pos_service);
    if (v) throw BusinessException.from(v);
    await this.assertNotFrozen(existing, 'supprimée');
    await this.plannings.destroy({ where: { id_planning: id } });
    this.adminLog.trace('planning.delete', current.nigend, { id_planning: id, nigend: existing.nigend, periode: periode(existing), position: existing.id_pos_service });
  }

  /**
   * BR-PLA-9/10 : insertion dans une plage existante, **atomique** (dette §9.2) : la plage
   * initiale est verrouillée, tous les contrôles sont faits avant toute écriture, puis la
   * suppression et les créations ont lieu dans la même transaction.
   */
  async insert(current: RniUser, dto: Omit<InsertPlanningDto, 'nigend'> & { nigend?: string }): Promise<PlanningDto[]> {
    if (dto.id_planning == null) throw BusinessException.missing('id_planning');
    const jours = await this.params.joursGlissants();
    return this.db.transaction(async (transaction) => {
      const outer = await this.repo.findById(dto.id_planning, transaction, true);
      if (!outer) throw BusinessException.notFound('Planning initial introuvable.');
      if (dto.nigend && dto.nigend !== outer.nigend) throw BusinessException.forbidden('Le personnel d’une plage ne peut pas être changé.');
      const target = await this.target(current, outer.nigend);
      const v = await this.positionViolation(current, dto.id_pos_service, outer.id_pos_service);
      if (v) throw BusinessException.from(v);
      await this.assertPosition(dto.id_pos_service);
      const result = computeInsertion(outer, dto, new Date(), jours);
      if (!result.ok) {
        this.logger.debug(`Insertion refusée dans le planning ${outer.id_planning} (${current.nigend}, ${periode(dto)}) : ${result.violation.code} ${result.violation.message}`);
        throw BusinessException.from(result.violation);
      }

      const keep = { adresse_temp: outer.adresse_temp, x_adresse_temp: outer.x_adresse_temp, y_adresse_temp: outer.y_adresse_temp };
      const inserted = dto.x_adresse_temp != null && dto.y_adresse_temp != null && dto.adresse_temp ? this.address(dto, target) : keep;

      await this.plannings.destroy({ where: { id_planning: outer.id_planning }, transaction });
      const ids: number[] = [];
      for (const piece of result.pieces) {
        const created = await this.plannings.create(
          {
            id_user: outer.id_user,
            date_debut: piece.date_debut,
            id_creneaux_debut: piece.id_creneaux_debut,
            date_fin: piece.date_fin,
            id_creneaux_fin: piece.id_creneaux_fin,
            id_pos_service: piece.id_pos_service,
            ...(piece.role === 'insertion' ? inserted : keep),
            created_by: current.nigend,
            updated_by: current.nigend,
          },
          { transaction },
        );
        ids.push(created.id_planning);
      }
      const rows = await Promise.all(ids.map((i) => this.repo.findById(i, transaction)));
      this.logger.log(
        `Insertion dans le planning ${outer.id_planning} par ${current.nigend} pour ${outer.nigend} : ${periode(dto)} position ${dto.id_pos_service} → plages ${ids.join(', ')} (${result.pieces.map((p) => p.role).join(' / ')})`,
      );
      return rows.map((r) => strip(r!));
    });
  }

  async get(id: number): Promise<PlanningDto> {
    const row = await this.repo.findById(id);
    if (!row) throw BusinessException.notFound('Planning introuvable.');
    return strip(row);
  }

  /** Comptes de personnels par position, par jour et par créneau (§5.4). */
  async dailyCounts(regions: number[] | null, from: string, to: string) {
    const days = dateRange(from, to);
    if (days.length > 62) throw BusinessException.invalid('Période limitée à 62 jours.');
    const start = toSlot(from, 1);
    const end = toSlot(to, 2);
    const plannings = await this.repo.planningsBetween(start, end, regions);
    this.logger.debug(`Compteurs journaliers ${from} → ${to} : régions ${regions?.join(',') ?? 'toutes'}, ${plannings.length} plage(s)`);
    return days.map((date) => {
      const creneaux: Record<number, { total: Record<number, number>; byRegion: Record<number, Record<number, number>> }> = {};
      for (const cr of [1, 2]) {
        const slot = toSlot(date, cr);
        const total: Record<number, number> = {};
        const byRegion: Record<number, Record<number, number>> = {};
        for (const p of plannings) {
          if (p.slot_debut > slot || p.slot_fin < slot || p.id_region == null) continue;
          total[p.id_pos_service] = (total[p.id_pos_service] ?? 0) + 1;
          const r = (byRegion[p.id_region] ??= {});
          r[p.id_pos_service] = (r[p.id_pos_service] ?? 0) + 1;
        }
        creneaux[cr] = { total, byRegion };
      }
      return { date, creneaux };
    });
  }
}

/** Période lisible pour les journaux : `2026-11-04 J → 2026-11-06 N`. */
function periode(p: Partial<PlageBounds>): string {
  const c = (v?: number) => (v === 1 ? 'J' : v === 2 ? 'N' : '?');
  return `${p.date_debut} ${c(p.id_creneaux_debut)} → ${p.date_fin} ${c(p.id_creneaux_fin)}`;
}

function strip(p: PlanningRow & { id_region?: number | null }): PlanningDto {
  const { slot_debut: _s, slot_fin: _e, id_region: _r, ...rest } = p;
  return rest;
}

function validateDate(date: string): void {
  const v = validatePlageBounds({ date_debut: date, id_creneaux_debut: 1, date_fin: date, id_creneaux_fin: 1 }, new Date(2000, 0, 1));
  if (v) throw BusinessException.invalid('Date invalide (AAAA-MM-JJ attendu).');
}

/**
 * BR-CAR-2 : priorité d'affichage de la position — unité (sans planning) < adresse du planning
 * < géolocalisation du téléphone (si appareil déclaré, géoloc active et, en position
 * Indisponible, maintien explicitement accepté par l'agent — BR-REF-3).
 */
export function resolvePoint(
  u: UserPlanningRow,
  planning: PlanningRow | null,
  geoloc: Map<string, GeolocPosition>,
): { x: number; y: number; adresse: string | null; type: 'unite' | 'temporaire' | 'localisation'; horodatage: string | null } | null {
  let point: ReturnType<typeof resolvePoint> = null;
  if (u.x_unite != null && u.y_unite != null) {
    point = { x: u.x_unite, y: u.y_unite, adresse: u.adresse_unite, type: 'unite', horodatage: null };
  }
  if (planning && planning.x_adresse_temp != null && planning.y_adresse_temp != null) {
    const isUnitAddress = planning.x_adresse_temp === u.x_unite && planning.y_adresse_temp === u.y_unite;
    point = {
      x: planning.x_adresse_temp,
      y: planning.y_adresse_temp,
      adresse: planning.adresse_temp,
      type: isUnitAddress ? 'unite' : 'temporaire',
      horodatage: null,
    };
  }
  const position = planning?.id_pos_service ?? PosService.INDISPONIBLE;
  const g = u.geoloc_indicatif ? geoloc.get(u.geoloc_indicatif) : undefined;
  if (g && u.geoloc_id_geoloc && u.geoloc_bool_geoloc && (position !== PosService.INDISPONIBLE || u.geoloc_bool_indispo)) {
    point = { x: g.lng, y: g.lat, adresse: point?.adresse ?? null, type: 'localisation', horodatage: g.horodatage };
  }
  return point;
}

