import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  ErrorCode,
  InsertPlanningDto,
  NO_PLANNING_COLOR,
  POS_SERVICE_LIBELLES,
  PersonnelCollection,
  PlageBounds,
  PersonnelPointProperties,
  PlanningDetailDto,
  PlanningDto,
  PlanningInputDto,
  PosService,
  Profil,
  TimetableDto,
  TimetableRegionDto,
  checkPositionAllowed,
  clipPlage,
  computeInsertion,
  currentSlot,
  dateRange,
  monthBounds,
  plageSlots,
  toSlot,
  validatePlageBounds,
} from '@rni/shared';
import { AdminLogService } from '../../common/admin-log.service.js';
import type { RniUser } from '../../common/auth/current-user.js';
import { PerimetreService } from '../../common/auth/perimetre.service.js';
import { BusinessException } from '../../common/business.exception.js';
import { Db } from '../../database/db.service.js';
import { Planning } from '../../database/models/index.js';
import { GEOLOC_CLIENT, type GeolocClient, type GeolocPosition } from '../external/external.types.js';
import { PlanningRepository, PlanningRow, UserPlanningRow } from './planning.repository.js';

export type PlanningUpdateInput = Omit<PlanningInputDto, 'nigend'> & { nigend?: string };

interface PosRow {
  id_pos_service: number;
  libelle: string;
  color: string;
  is_actif: boolean;
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
  ) {}

  // ---------------------------------------------------------------------------
  // Lecture
  // ---------------------------------------------------------------------------

  async positions(): Promise<Map<number, PosRow>> {
    const rows = await this.db.select<PosRow>('SELECT id_pos_service, libelle, color, is_actif FROM ref_pos_service');
    return new Map(rows.map((r) => [r.id_pos_service, r]));
  }

  /** Calendrier mensuel par région (§5.1, BR-PLA-2). */
  async timetable(user: RniUser, month: string, region?: number): Promise<TimetableDto> {
    let bounds: { first: string; last: string };
    try {
      bounds = monthBounds(month);
    } catch {
      throw BusinessException.invalid('Mois invalide (AAAA-MM attendu).');
    }
    const regions = this.perimetre.restrict(user, region);
    const start = toSlot(bounds.first, 1);
    const end = toSlot(bounds.last, 2);
    const [users, plannings, regionRows] = await Promise.all([
      this.repo.planningUsers(regions),
      this.repo.planningsBetween(start, end, regions),
      this.db.select<{ id_region: number; libelle: string }>(
        `SELECT id_region, libelle FROM ref_regions ${regions ? 'WHERE id_region IN (:regions)' : ''} ORDER BY libelle`,
        { regions },
      ),
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
    return { month, ...bounds, regions: [...byRegion.values()] };
  }

  /** §5.5 : plannings couvrant une date (Jour ou Nuit), bornés aux profils 3/4/7. */
  async byDate(user: RniUser, date: string, filter: { region?: number; nigend?: string; id_pos_service?: number }): Promise<PlanningDetailDto[]> {
    validateDate(date);
    const regions = this.perimetre.restrict(user, filter.region);
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
    return users.map((u) => {
      const cur = slots.get(u.time_zone)!;
      const planning = plannings.find((p) => p.id_user === u.id_user && p.slot_debut <= cur && p.slot_fin >= cur) ?? null;
      return { user: u, planning };
    });
  }

  /** Carte : `GET /planning/geojson` (§4.2). */
  async geojson(user: RniUser, now = new Date()): Promise<PersonnelCollection> {
    const [current, positions, geoloc] = await Promise.all([
      this.currentPositions(user.regions_visibles, now),
      this.positions(),
      this.safeGeoloc(),
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
        libelle_pos_service: pos?.libelle ?? POS_SERVICE_LIBELLES[idPos as PosService] ?? 'Indisponible',
        // BR-CAR-3 : gris si aucun planning
        color: planning ? (pos?.color ?? NO_PLANNING_COLOR) : NO_PLANNING_COLOR,
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
    if (!target) throw new BusinessException(ErrorCode.UTILISATEUR_INCONNU, `Aucun personnel planifiable pour le nigend ${nigend}.`);
    this.assertCanWrite(current, target);
    return target;
  }

  assertCanWrite(current: RniUser, target: { id_user: number; id_region: number | null }): void {
    switch (current.id_profil) {
      case Profil.GIGN:
        return;
      case Profil.REFERENT:
      case Profil.REFERENT_ADJOINT:
        if (current.id_region != null && target.id_region === current.id_region) return;
        throw BusinessException.forbidden('Un référent ne gère que les plannings de sa région.');
      case Profil.NEGOCIATEUR:
        if (target.id_user === current.id_user) return;
        throw BusinessException.forbidden('Un négociateur ne gère que son propre planning.');
      default:
        throw BusinessException.forbidden();
    }
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
      throw new BusinessException(
        ErrorCode.CHEVAUCHEMENT,
        `Plage existante du ${o.date_debut} (${o.id_creneaux_debut === 1 ? 'Jour' : 'Nuit'}) au ${o.date_fin} (${o.id_creneaux_fin === 1 ? 'Jour' : 'Nuit'}).`,
      );
    }
  }

  async create(current: RniUser, dto: PlanningInputDto): Promise<PlanningDto> {
    const target = await this.target(current, dto.nigend);
    const v = validatePlageBounds(dto) ?? checkPositionAllowed(current.id_profil, dto.id_pos_service);
    if (v) throw BusinessException.from(v);
    await this.assertPosition(dto.id_pos_service);
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
    return this.get(created.id_planning);
  }

  async update(current: RniUser, id: number, dto: PlanningUpdateInput): Promise<PlanningDto> {
    const existing = await this.repo.findById(id);
    if (!existing) throw BusinessException.notFound('Planning introuvable.');
    // §5.2 : le personnel d'une plage n'est pas modifiable
    if (dto.nigend && dto.nigend !== existing.nigend) throw BusinessException.forbidden('Le personnel d’une plage ne peut pas être changé.');
    const target = await this.target(current, existing.nigend);
    const v = validatePlageBounds(dto) ?? checkPositionAllowed(current.id_profil, dto.id_pos_service, existing.id_pos_service);
    if (v) throw BusinessException.from(v);
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
    return this.get(id);
  }

  /** BR-PLA-8 : suppression physique. */
  async remove(current: RniUser, id: number): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw BusinessException.notFound('Planning introuvable.');
    await this.target(current, existing.nigend);
    const v = checkPositionAllowed(current.id_profil, null, existing.id_pos_service);
    if (v) throw BusinessException.from(v);
    await this.plannings.destroy({ where: { id_planning: id } });
    this.adminLog.trace('planning.delete', current.nigend, { id_planning: id, nigend: existing.nigend });
  }

  /**
   * BR-PLA-9/10 : insertion dans une plage existante, **atomique** (dette §9.2) : la plage
   * initiale est verrouillée, tous les contrôles sont faits avant toute écriture, puis la
   * suppression et les créations ont lieu dans la même transaction.
   */
  async insert(current: RniUser, dto: Omit<InsertPlanningDto, 'nigend'> & { nigend?: string }): Promise<PlanningDto[]> {
    if (dto.id_planning == null) throw BusinessException.missing('id_planning');
    return this.db.transaction(async (transaction) => {
      const outer = await this.repo.findById(dto.id_planning, transaction, true);
      if (!outer) throw BusinessException.notFound('Planning initial introuvable.');
      if (dto.nigend && dto.nigend !== outer.nigend) throw BusinessException.forbidden('Le personnel d’une plage ne peut pas être changé.');
      const target = await this.target(current, outer.nigend);
      const v = checkPositionAllowed(current.id_profil, dto.id_pos_service, outer.id_pos_service);
      if (v) throw BusinessException.from(v);
      await this.assertPosition(dto.id_pos_service);
      const result = computeInsertion(outer, dto);
      if (!result.ok) throw BusinessException.from(result.violation);

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

