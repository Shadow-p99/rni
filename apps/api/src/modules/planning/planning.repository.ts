import { Injectable } from '@nestjs/common';
import { PlanningDto } from '@rni/shared';
import { DroitsService } from '../../common/auth/droits.service.js';
import { Op, type Transaction, type WhereOptions } from 'sequelize';
import { personnelSearchWhere } from '../../common/sql-search.js';
import { Planning, RefUser, UserDetail } from '../../database/models/index.js';

export interface UserPlanningRow {
  id_user: number;
  nigend: string;
  grade: string | null;
  abreviation_grade: string | null;
  nom: string;
  prenom: string;
  id_profil: number;
  libelle_profil: string;
  classement: number;
  poids_grade: number;
  code_unite: string | null;
  libelle_unite: string | null;
  adresse_unite: string | null;
  x_unite: number | null;
  y_unite: number | null;
  id_departement: string | null;
  libelle_departement: string | null;
  time_zone: string;
  id_region: number | null;
  libelle_region: string | null;
  tel_pro: string | null;
  tel_perso: string | null;
  tel_unite: string | null;
  numero_neo_1: string | null;
  numero_neo_2: string | null;
  commentaire: string | null;
  geoloc_indicatif: string | null;
  geoloc_id_geoloc: string | null;
  geoloc_bool_geoloc: boolean;
  geoloc_bool_indispo: boolean;
}

export interface PlanningRow extends PlanningDto {
  slot_debut: number;
  slot_fin: number;
}

const USER_PLANNING_ATTRIBUTES = [
  'id_user', 'nigend', 'grade', 'abreviation_grade', 'nom', 'prenom', 'id_profil', 'libelle_profil', 'classement', 'poids_grade',
  'code_unite', 'libelle_unite', 'adresse_unite', 'x_unite', 'y_unite', 'id_departement', 'libelle_departement', 'time_zone',
  'id_region', 'libelle_region', 'tel_pro', 'tel_perso', 'tel_unite', 'numero_neo_1', 'numero_neo_2', 'commentaire',
  'geoloc_indicatif', 'geoloc_id_geoloc', 'geoloc_bool_geoloc', 'geoloc_bool_indispo',
] as const;

const PLANNING_ATTRIBUTES = [
  'id_planning', 'id_user', 'date_debut', 'id_creneaux_debut', 'date_fin', 'id_creneaux_fin', 'id_pos_service',
  'adresse_temp', 'x_adresse_temp', 'y_adresse_temp', 'slot_debut', 'slot_fin',
] as const;

/** Position par défaut d'une plage sans position (BR-PLA : Indisponible). */
const DEFAULT_POSITION = 2;

type PlanningWithUser = Omit<Planning, 'user'> & { user?: { nigend: string; id_region: number | null } };

function toRow(p: PlanningWithUser): PlanningRow & { id_region: number | null } {
  return {
    id_planning: p.id_planning,
    id_user: p.id_user,
    nigend: p.user?.nigend ?? '',
    date_debut: p.date_debut,
    id_creneaux_debut: p.id_creneaux_debut,
    date_fin: p.date_fin,
    id_creneaux_fin: p.id_creneaux_fin,
    id_pos_service: p.id_pos_service ?? DEFAULT_POSITION,
    adresse_temp: p.adresse_temp,
    x_adresse_temp: p.x_adresse_temp,
    y_adresse_temp: p.y_adresse_temp,
    slot_debut: p.slot_debut,
    slot_fin: p.slot_fin,
    id_region: p.user?.id_region ?? null,
  };
}

/** Lectures planning partagées par les modules planning / région / carte (modèles Sequelize). */
@Injectable()
export class PlanningRepository {
  constructor(private readonly droits: DroitsService) {}

  /** Personnels portant un planning (profils `has_planning`, comptes actifs), dans un périmètre de régions. */
  async planningUsers(regions: number[] | null, extra: { id_user?: number; nigend?: string; terms?: string[] } = {}): Promise<UserPlanningRow[]> {
    if (regions && !regions.length) return [];
    const { terms = [], ...ids } = extra;
    const where: WhereOptions = {
      bool_user_inactif: false,
      id_profil: { [Op.in]: await this.droits.planningProfils() },
      ...(regions ? { id_region: { [Op.in]: regions } } : {}),
      ...(ids.id_user != null ? { id_user: ids.id_user } : {}),
      ...(ids.nigend != null ? { nigend: ids.nigend } : {}),
    };
    const search = terms.length ? await personnelSearchWhere(terms) : [];
    return (await UserDetail.findAll({
      attributes: [...USER_PLANNING_ATTRIBUTES],
      where: search.length ? { [Op.and]: [where, ...search] } : where,
      order: [
        ['id_departement', 'ASC NULLS LAST'],
        ['classement', 'ASC'],
        ['poids_grade', 'DESC'],
        ['nom', 'ASC'],
        ['prenom', 'ASC'],
      ],
      raw: true,
    })) as unknown as UserPlanningRow[];
  }

  /** Plages qui **touchent** la fenêtre de créneaux [start, end] (BR-PLA-2). */
  async planningsBetween(
    start: number,
    end: number,
    regions: number[] | null,
    filter: { id_pos_service?: number; nigend?: string; id_users?: number[] } = {},
  ): Promise<(PlanningRow & { id_region: number | null })[]> {
    if (regions && !regions.length) return [];
    if (filter.id_users && !filter.id_users.length) return [];
    const where: WhereOptions[] = [{ slot_fin: { [Op.gte]: start } }, { slot_debut: { [Op.lte]: end } }];
    if (filter.id_users) where.push({ id_user: { [Op.in]: filter.id_users } });
    if (filter.id_pos_service != null) {
      // Une plage sans position vaut « Indisponible »
      where.push(
        filter.id_pos_service === DEFAULT_POSITION
          ? { [Op.or]: [{ id_pos_service: DEFAULT_POSITION }, { id_pos_service: null }] }
          : { id_pos_service: filter.id_pos_service },
      );
    }
    const rows = await Planning.findAll({
      attributes: [...PLANNING_ATTRIBUTES],
      where: { [Op.and]: where },
      include: [
        {
          model: RefUser,
          as: 'user',
          attributes: ['nigend', 'id_region'],
          required: true,
          where: {
            bool_user_inactif: false,
            id_profil: { [Op.in]: await this.droits.planningProfils() },
            ...(regions ? { id_region: { [Op.in]: regions } } : {}),
            ...(filter.nigend != null ? { nigend: filter.nigend } : {}),
          },
        },
      ],
      order: [['slot_debut', 'ASC']],
      // Objets simples (sans instances Sequelize) : lecture de dizaines de milliers de plages
      raw: true,
      nest: true,
    });
    return rows.map((r) => toRow(r as unknown as PlanningWithUser));
  }

  async findById(id: number, transaction?: Transaction, lock = false): Promise<PlanningRow | null> {
    const row = await Planning.findByPk(id, {
      attributes: [...PLANNING_ATTRIBUTES],
      include: [{ model: RefUser, as: 'user', attributes: ['nigend', 'id_region'], required: true }],
      transaction,
      ...(lock && transaction ? { lock: { level: transaction.LOCK.UPDATE, of: Planning } } : {}),
      raw: true,
      nest: true,
    });
    return row ? toRow(row as unknown as PlanningWithUser) : null;
  }

  /** BR-PLA-5 : plages du même agent qui recouvrent [start, end] (hors plage exclue). */
  async overlapping(idUser: number, start: number, end: number, excludeIds: number[] = [], transaction?: Transaction, lock = false): Promise<PlanningRow[]> {
    const rows = await Planning.findAll({
      attributes: [...PLANNING_ATTRIBUTES],
      where: {
        id_user: idUser,
        slot_debut: { [Op.lte]: end },
        slot_fin: { [Op.gte]: start },
        ...(excludeIds.length ? { id_planning: { [Op.notIn]: excludeIds } } : {}),
      },
      include: [{ model: RefUser, as: 'user', attributes: ['nigend', 'id_region'], required: true }],
      order: [['slot_debut', 'ASC']],
      transaction,
      ...(lock && transaction ? { lock: { level: transaction.LOCK.UPDATE, of: Planning } } : {}),
      raw: true,
      nest: true,
    });
    return rows.map((r) => toRow(r as unknown as PlanningWithUser));
  }
}
