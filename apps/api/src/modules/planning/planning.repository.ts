import { Injectable } from '@nestjs/common';
import { PLANNING_PROFILS, PlanningDto } from '@rni/shared';
import type { Transaction } from 'sequelize';
import { termParams, userSearchClauses } from '../../common/sql-search.js';
import { Db } from '../../database/db.service.js';

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

export const PLANNING_COLUMNS = `
  p.id_planning, p.id_user, ru.nigend,
  to_char(p.date_debut, 'YYYY-MM-DD') AS date_debut, p.id_creneaux_debut,
  to_char(p.date_fin, 'YYYY-MM-DD') AS date_fin, p.id_creneaux_fin,
  COALESCE(p.id_pos_service, 2) AS id_pos_service,
  p.adresse_temp, p.x_adresse_temp, p.y_adresse_temp, p.slot_debut, p.slot_fin`;

const regionClause = (alias: string, regions: number[] | null) => (regions == null ? '' : ` AND ${alias}.id_region IN (:regions)`);

/** Requêtes de lecture planning (paramétrées) partagées par les modules planning / région / carte. */
@Injectable()
export class PlanningRepository {
  constructor(private readonly db: Db) {}

  /** Personnels portant un planning (profils 3, 4, 7 actifs), dans un périmètre de régions. */
  async planningUsers(regions: number[] | null, extra: { id_user?: number; nigend?: string; terms?: string[] } = {}): Promise<UserPlanningRow[]> {
    if (regions && !regions.length) return [];
    const { terms = [], ...ids } = extra;
    const search = userSearchClauses('u', terms.length).map((c) => `AND ${c}`).join(' ');
    return this.db.select<UserPlanningRow>(
      `SELECT id_user, nigend, grade, abreviation_grade, nom, prenom, id_profil, libelle_profil, classement, poids_grade,
              code_unite, libelle_unite, adresse_unite, x_unite, y_unite, id_departement, libelle_departement, time_zone,
              id_region, libelle_region, tel_pro, tel_perso, tel_unite, numero_neo_1, numero_neo_2, commentaire,
              geoloc_indicatif, geoloc_id_geoloc, geoloc_bool_geoloc, geoloc_bool_indispo
         FROM v_user_detail u
        WHERE NOT bool_user_inactif AND id_profil IN (:profils)${regionClause('u', regions)}
          ${ids.id_user != null ? 'AND id_user = :id_user' : ''}
          ${ids.nigend != null ? 'AND nigend = :nigend' : ''}
          ${search}
        ORDER BY id_departement NULLS LAST, classement, poids_grade DESC, nom, prenom`,
      { profils: PLANNING_PROFILS, regions, ...ids, ...termParams(terms) },
    );
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
    return this.db.select(
      `SELECT ${PLANNING_COLUMNS}, ru.id_region
         FROM planning p JOIN ref_user ru ON ru.id_user = p.id_user
        WHERE p.slot_fin >= :start AND p.slot_debut <= :end
          AND NOT ru.bool_user_inactif AND ru.id_profil IN (:profils)${regionClause('ru', regions)}
          ${filter.id_pos_service != null ? 'AND COALESCE(p.id_pos_service, 2) = :id_pos_service' : ''}
          ${filter.nigend != null ? 'AND ru.nigend = :nigend' : ''}
          ${filter.id_users ? 'AND p.id_user IN (:id_users)' : ''}
        ORDER BY p.slot_debut`,
      { start, end, regions, profils: PLANNING_PROFILS, ...filter },
    );
  }

  async findById(id: number, t?: Transaction, lock = false): Promise<PlanningRow | null> {
    return this.db.one<PlanningRow>(
      `SELECT ${PLANNING_COLUMNS} FROM planning p JOIN ref_user ru ON ru.id_user = p.id_user
        WHERE p.id_planning = :id ${lock ? 'FOR UPDATE OF p' : ''}`,
      { id },
      t,
    );
  }

  /** BR-PLA-5 : plages du même agent qui recouvrent [start, end] (hors plage exclue). */
  async overlapping(idUser: number, start: number, end: number, excludeIds: number[] = [], t?: Transaction): Promise<PlanningRow[]> {
    return this.db.select<PlanningRow>(
      `SELECT ${PLANNING_COLUMNS} FROM planning p JOIN ref_user ru ON ru.id_user = p.id_user
        WHERE p.id_user = :idUser AND p.slot_debut <= :end AND p.slot_fin >= :start
          ${excludeIds.length ? 'AND p.id_planning NOT IN (:excludeIds)' : ''}`,
      { idUser, start, end, excludeIds },
      t,
    );
  }
}
