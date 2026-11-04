import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  CreateUserDto,
  CurrentUserDto,
  ErrorCode,
  GIGN_ONLY_PROFILS,
  PLANNING_PROFILS,
  Profil,
  RpsiPersonnelDto,
  UpdateUserDto,
  UserDto,
  assignableProfils,
  geolocIndicatif,
  isAdminProfil,
  isNationalAdmin,
  isValidPhone,
  listableProfils,
  MAX_COUNTED_ROWS,
  normalizePage,
  type Page,
  type SortDir,
  type UserListQuery,
  type UserSort,
} from '@rni/shared';
import { AdminLogService } from '../../common/admin-log.service.js';
import { searchTerms, termParams, userSearchClauses, wordsClause } from '../../common/sql-search.js';
import type { RniUser } from '../../common/auth/current-user.js';
import { BusinessException } from '../../common/business.exception.js';
import { Db } from '../../database/db.service.js';
import { RefUser } from '../../database/models/index.js';
import { REMOP_CLIENT, type RemopClient } from '../external/external.types.js';

const USER_COLUMNS = `id_user, nigend, grade, abreviation_grade, nom, prenom, code_unite, libelle_unite, id_departement,
  tel_pro, tel_perso, tel_unite, numero_neo_1, numero_neo_2, id_profil, libelle_profil, id_region, libelle_region, commentaire`;

interface RpsiRow {
  nigend: string;
  nom: string;
  prenom: string;
  id_grade_personnel: number | null;
  grade: string | null;
  code_unite: string | null;
  libelle_unite: string | null;
  id_region: number | null;
  libelle_region: string | null;
  tel_pro: string | null;
  tel_perso: string | null;
  tel_unite: string | null;
  numero_neo_1: string | null;
  numero_neo_2: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly db: Db,
    private readonly adminLog: AdminLogService,
    @InjectModel(RefUser) private readonly users: typeof RefUser,
    @Inject(REMOP_CLIENT) private readonly remop: RemopClient,
  ) {}

  me(u: RniUser): CurrentUserDto {
    return {
      id_user: u.id_user,
      nigend: u.nigend,
      grade: u.grade,
      nom: u.nom,
      prenom: u.prenom,
      displayname: u.displayname,
      code_unite: u.code_unite,
      libelle_unite: u.libelle_unite,
      id_profil: u.id_profil,
      libelle_profil: u.libelle_profil,
      id_region: u.id_region,
      libelle_region: u.libelle_region,
      regions_visibles: u.perimetres.planning,
      perimetres: u.perimetres,
      is_admin: isAdminProfil(u.id_profil),
      is_super_admin: u.id_profil === Profil.SUPER_ADMIN,
      geoloc_id_geoloc: u.geoloc_id_geoloc,
      geoloc_indicatif: u.geoloc_indicatif,
      geoloc_bool_geoloc: u.geoloc_bool_geoloc,
      geoloc_bool_indispo: u.geoloc_bool_indispo,
    };
  }

  /**
   * BR-GPU-1 : comptes listés (profils 3, 4, 7 ; + 1 et 6 pour le GIGN), jamais les inactifs.
   * Les référents ne voient que leur région ; le GIGN peut filtrer par région.
   * **Pagination côté serveur** : recherche, filtres et tri sont exécutés en SQL (index trigrammes).
   */
  async list(current: RniUser, query: UserListQuery): Promise<Page<UserDto>> {
    const { page, size, offset } = normalizePage(query.page, query.size);
    const isGign = isNationalAdmin(current.id_profil);
    if (!isGign && query.region != null && query.region !== current.id_region) {
      throw new BusinessException(ErrorCode.HORS_PERIMETRE, 'Un référent ne consulte que le personnel de sa région.', 403);
    }
    const region = isGign ? (query.region ?? null) : current.id_region;
    if (!isGign && region == null) return { items: [], total: 0, page, size };

    const allowed = listableProfils(current.id_profil);
    if (query.profil != null && !allowed.includes(query.profil)) return { items: [], total: 0, page, size };
    const profils = query.profil != null ? [query.profil] : allowed;

    const where = ['NOT s.bool_user_inactif', 's.id_profil IN (:profils)'];
    const params: Record<string, unknown> = { profils, region, limit: size, offset, cap: MAX_COUNTED_ROWS + 1 };
    if (region != null) where.push('s.id_region = :region');
    const terms = searchTerms(query.q);
    where.push(...userSearchClauses('s', terms.length));
    Object.assign(params, termParams(terms));
    const clause = where.join(' AND ');
    const order = orderBy(query.sort, query.dir);

    // Comptage plafonné : coût borné quel que soit le volume.
    const count = await this.db.one<{ total: string }>(
      `SELECT count(*) AS total FROM (SELECT 1 FROM ${SORT_BASE} WHERE ${clause} LIMIT :cap) c`,
      params,
    );
    const counted = Number(count?.total ?? 0);
    const capped = counted > MAX_COUNTED_ROWS;
    const total = Math.min(counted, MAX_COUNTED_ROWS);
    if (offset >= total) return { items: [], total, page, size, capped };

    // « Deferred join » : tri / pagination sur les seuls identifiants, puis détail des lignes de la page.
    const items = await this.db.select<UserDto>(
      `SELECT ${USER_COLUMNS} FROM v_user_detail s
         JOIN (SELECT s.id_user FROM ${SORT_BASE} WHERE ${clause} ORDER BY ${order} LIMIT :limit OFFSET :offset) p USING (id_user)
        ORDER BY ${order}`,
      params,
    );
    return { items, total, page, size, capped };
  }

  /** Autocomplétion du personnel planifiable dans les droits d'écriture de l'utilisateur. */
  async planningCandidates(current: RniUser, q: string): Promise<UserDto[]> {
    const terms = searchTerms(q);
    if (!terms.length) return [];
    let scope = '';
    if (current.id_profil === Profil.NEGOCIATEUR) scope = 'AND id_user = :me';
    else if (!isNationalAdmin(current.id_profil)) scope = 'AND id_region = :region';
    return this.db.select<UserDto>(
      `SELECT ${USER_COLUMNS} FROM v_user_detail
        WHERE NOT bool_user_inactif AND id_profil IN (:profils) ${scope}
          ${wordsClause("nigend || ' ' || nom || ' ' || prenom || ' ' || coalesce(code_unite, '')", terms.length)}
        ORDER BY nom, prenom LIMIT 20`,
      { profils: PLANNING_PROFILS, me: current.id_user, region: current.id_region, ...termParams(terms) },
    );
  }

  /** BR-GPU-2 : recherche RPSI (nigend, nom, prénom) pour la création de compte. */
  async searchRpsi(current: RniUser, q: string): Promise<RpsiPersonnelDto[]> {
    if ((q ?? '').trim().length < 3) return [];
    const terms = searchTerms(q);
    const scope = isNationalAdmin(current.id_profil) ? '' : 'AND v.id_region = :region';
    return this.db.select<RpsiPersonnelDto>(
      `SELECT v.nigend, v.nom, v.prenom, v.grade, v.code_unite, v.libelle_unite, v.id_region, v.libelle_region,
              ru.id_user, ru.bool_user_inactif
         FROM v_personnel_to_ref_user v LEFT JOIN ref_user ru ON ru.nigend = v.nigend
        WHERE TRUE ${wordsClause("v.nigend || ' ' || v.nom || ' ' || v.prenom", terms.length)}
          ${scope}
        ORDER BY v.nom, v.prenom LIMIT 20`,
      { region: current.id_region, ...termParams(terms) },
    );
  }

  private async rpsi(nigend: string): Promise<RpsiRow | null> {
    return this.db.one<RpsiRow>(
      `SELECT nigend, nom, prenom, id_grade_personnel, grade, code_unite, libelle_unite, id_region, libelle_region,
              tel_pro, tel_perso, tel_unite, numero_neo_1, numero_neo_2
         FROM v_personnel_to_ref_user WHERE nigend = :nigend`,
      { nigend },
    );
  }

  private assertAssignable(current: RniUser, idProfil: number): void {
    if (!assignableProfils(current.id_profil).includes(idProfil)) {
      throw BusinessException.forbidden('Ce profil ne peut pas être attribué.');
    }
  }

  private assertManageable(current: RniUser, target: { id_region: number | null; id_profil: number }): void {
    // Seul un super administrateur gère les comptes super administrateur
    if (target.id_profil === Profil.SUPER_ADMIN && current.id_profil !== Profil.SUPER_ADMIN) {
      throw BusinessException.forbidden('Seul un super administrateur gère ce compte.');
    }
    if (isNationalAdmin(current.id_profil)) return;
    if (!isAdminProfil(current.id_profil)) throw BusinessException.forbidden();
    if (GIGN_ONLY_PROFILS.includes(target.id_profil)) throw BusinessException.forbidden('Seul le GIGN gère les comptes GIGN et OMS.');
    if (target.id_region == null || target.id_region !== current.id_region) {
      throw BusinessException.forbidden('Un référent ne gère que le personnel de sa région.');
    }
  }

  async getDetail(id: number): Promise<UserDto> {
    const u = await this.db.one<UserDto>(`SELECT ${USER_COLUMNS} FROM v_user_detail WHERE id_user = :id AND NOT bool_user_inactif`, { id });
    if (!u) throw new BusinessException(ErrorCode.UTILISATEUR_INCONNU);
    return u;
  }

  /** BR-GPU-2 : création à partir du RPSI, ou réactivation + changement de profil. */
  async create(current: RniUser, dto: CreateUserDto): Promise<UserDto> {
    this.assertAssignable(current, dto.id_profil);
    const rpsi = await this.rpsi(dto.nigend);
    const existing = await this.users.findOne({ where: { nigend: dto.nigend } });
    if (!rpsi && !existing) throw new BusinessException(ErrorCode.UTILISATEUR_INCONNU, `Nigend ${dto.nigend} inconnu du RPSI.`);

    const region = rpsi?.id_region ?? existing?.id_region ?? null;
    this.assertManageable(current, { id_region: region, id_profil: dto.id_profil });
    if (existing) this.assertManageable(current, { id_region: existing.id_region, id_profil: existing.id_profil });

    const fromRpsi = rpsi
      ? {
          id_grade_personnel: rpsi.id_grade_personnel,
          grade: rpsi.grade,
          nom: rpsi.nom,
          prenom: rpsi.prenom,
          code_unite: rpsi.code_unite,
          tel_pro: rpsi.tel_pro,
          tel_unite: rpsi.tel_unite,
          numero_neo_1: rpsi.numero_neo_1,
          numero_neo_2: rpsi.numero_neo_2,
          id_region: rpsi.id_region,
        }
      : {};

    let id: number;
    if (existing) {
      await existing.update({ ...fromRpsi, id_profil: dto.id_profil, bool_user_inactif: false });
      id = existing.id_user;
      this.adminLog.trace('user.reactivate', current.nigend, { nigend: dto.nigend, id_profil: dto.id_profil });
    } else {
      const created = await this.users.create({ ...fromRpsi, nigend: dto.nigend, tel_perso: rpsi!.tel_perso, id_profil: dto.id_profil });
      id = created.id_user;
      this.adminLog.trace('user.create', current.nigend, { nigend: dto.nigend, id_profil: dto.id_profil });
    }
    return this.getDetail(id);
  }

  /** §7.3 : seuls le profil, le téléphone personnel et le commentaire sont modifiables. */
  async update(current: RniUser, id: number, dto: UpdateUserDto): Promise<UserDto> {
    const target = await this.users.findOne({ where: { id_user: id, bool_user_inactif: false } });
    if (!target) throw new BusinessException(ErrorCode.UTILISATEUR_INCONNU);
    this.assertManageable(current, target);
    const patch: Partial<RefUser> = {};
    if (dto.id_profil != null && dto.id_profil !== target.id_profil) {
      this.assertAssignable(current, dto.id_profil);
      patch.id_profil = dto.id_profil;
    }
    if (dto.tel_perso !== undefined) {
      const tel = dto.tel_perso?.trim() || null;
      if (tel && !isValidPhone(tel)) throw BusinessException.invalid('Numéro de téléphone personnel invalide.');
      patch.tel_perso = tel;
    }
    if (dto.commentaire !== undefined) patch.commentaire = dto.commentaire?.trim() || null;
    await target.update(patch);
    this.adminLog.trace('user.update', current.nigend, { id_user: id, ...patch });
    return this.getDetail(id);
  }

  /** BR-GPU-4 / BR-REF-1 : suppression logique. */
  async remove(current: RniUser, id: number): Promise<void> {
    if (id === current.id_user) throw BusinessException.forbidden('Vous ne pouvez pas supprimer votre propre compte.');
    const target = await this.users.findOne({ where: { id_user: id, bool_user_inactif: false } });
    if (!target) throw new BusinessException(ErrorCode.UTILISATEUR_INCONNU);
    this.assertManageable(current, target);
    await target.update({ bool_user_inactif: true });
    this.adminLog.trace('user.delete', current.nigend, { id_user: id, nigend: target.nigend });
  }

  /** §7.4 : lignes NEO de l'agent (REMOP) — soi-même, ou un admin dans son périmètre. */
  async neoLines(current: RniUser, nigend: string) {
    if (nigend !== current.nigend) {
      if (!isAdminProfil(current.id_profil)) throw BusinessException.forbidden();
      const target = await this.users.findOne({ where: { nigend, bool_user_inactif: false } });
      if (!target) throw new BusinessException(ErrorCode.UTILISATEUR_INCONNU);
      if (!isNationalAdmin(current.id_profil) && target.id_region !== current.id_region) throw BusinessException.forbidden();
    }
    return this.remop.lines(nigend);
  }

  /** §7.4 : déclaration de l'appareil à géolocaliser (BR-REF-2). */
  async infoDevice(current: RniUser, geolocId: string | null): Promise<CurrentUserDto> {
    const user = await this.users.findOne({ where: { id_user: current.id_user } });
    if (!user) throw new BusinessException(ErrorCode.UTILISATEUR_INCONNU);
    if (geolocId) {
      const lines = await this.remop.lines(current.nigend);
      if (!lines.some((l) => l.id === geolocId)) throw BusinessException.invalid('Cette ligne NEO ne vous est pas attribuée.');
      await user.update({ geoloc_id_geoloc: geolocId, geoloc_indicatif: geolocIndicatif(user.id_user) });
    } else {
      await user.update({ geoloc_id_geoloc: null, geoloc_bool_geoloc: false, geoloc_bool_indispo: false });
    }
    return this.me({ ...current, ...pickGeoloc(user) });
  }

  /** §7.4 / BR-REF-3 : interrupteurs de géolocalisation. */
  async activateLocation(current: RniUser, isIndispo: boolean, value: boolean): Promise<CurrentUserDto> {
    const user = await this.users.findOne({ where: { id_user: current.id_user } });
    if (!user) throw new BusinessException(ErrorCode.UTILISATEUR_INCONNU);
    if (value && !user.geoloc_id_geoloc) throw BusinessException.invalid('Déclarez d’abord l’appareil à géolocaliser.');
    if (isIndispo) await user.update({ geoloc_bool_indispo: value });
    else await user.update({ geoloc_bool_geoloc: value, ...(value ? {} : { geoloc_bool_indispo: false }) });
    return this.me({ ...current, ...pickGeoloc(user) });
  }
}

function pickGeoloc(u: RefUser) {
  return {
    geoloc_id_geoloc: u.geoloc_id_geoloc,
    geoloc_indicatif: u.geoloc_indicatif,
    geoloc_bool_geoloc: u.geoloc_bool_geoloc,
    geoloc_bool_indispo: u.geoloc_bool_indispo,
  };
}

/** Table de tri étroite : uniquement les colonnes utiles au filtre et au tri (pas de jointures larges). */
const SORT_BASE = `(SELECT ru.id_user, ru.nigend, ru.nom, ru.prenom, ru.code_unite, ru.id_profil, ru.id_region, ru.bool_user_inactif,
         COALESCE(pc.classement, 99) AS classement, COALESCE(g.poids, 0) AS poids_grade, r.libelle AS libelle_region
    FROM ref_user ru
    LEFT JOIN t_profil_classement pc ON pc.id_profil = ru.id_profil
    LEFT JOIN ref_grade_personnel g ON g.id_grade_personnel = ru.id_grade_personnel
    LEFT JOIN ref_regions r ON r.id_region = ru.id_region) s`;

/** Tri sur liste blanche (jamais de nom de colonne issu de la requête) ; `id_user` garantit une pagination stable. */
export function orderBy(sort: UserSort | undefined, dir: SortDir | undefined): string {
  const d = dir === 'desc' ? 'DESC' : 'ASC';
  switch (sort) {
    case 'nom':
      return `s.nom ${d}, s.prenom ${d}, s.id_user ${d}`;
    case 'nigend':
      return `s.nigend ${d}, s.id_user`;
    case 'unite':
      return `s.code_unite ${d} NULLS LAST, s.nom, s.prenom, s.id_user`;
    case 'region':
      return `s.libelle_region ${d} NULLS LAST, s.nom, s.prenom, s.id_user`;
    case 'profil':
      return `s.classement ${d}, s.nom, s.prenom, s.id_user`;
    default:
      return 's.classement, s.poids_grade DESC, s.nom, s.prenom, s.id_user';
  }
}
