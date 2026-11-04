import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ErrorCode, FORMULAIRE_FIELDS, FormulaireDto, FormulaireFilter, Profil, hasNameOrFirstName, isIsoDate } from '@rni/shared';
import { AdminLogService } from '../../common/admin-log.service.js';
import type { RniUser } from '../../common/auth/current-user.js';
import { BusinessException } from '../../common/business.exception.js';
import { Db } from '../../database/db.service.js';
import { Formulaire } from '../../database/models/index.js';
import { sanitizeFormulaire } from './formulaire.sanitize.js';

const CONTENT_COLUMNS = [...FORMULAIRE_FIELDS.map((f) => `f.${f.key}`), 'f.terrain_x', 'f.terrain_y'].join(', ');

const SELECT = `
  SELECT f.id_formulaire, f.id_user, ${CONTENT_COLUMNS}, f.is_closed,
         to_char(f.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
         to_char(f.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
         ru.nigend AS auteur_nigend, trim(coalesce(ru.grade, '') || ' ' || ru.prenom || ' ' || ru.nom) AS auteur_nom,
         ru.id_region AS auteur_id_region
    FROM t_formulaire f JOIN ref_user ru ON ru.id_user = f.id_user`;

@Injectable()
export class FormulaireService {
  constructor(
    private readonly db: Db,
    private readonly adminLog: AdminLogService,
    @InjectModel(Formulaire) private readonly formulaires: typeof Formulaire,
  ) {}

  /**
   * BR-FOR-2, appliqué **côté API** (dette §9.4) : le GIGN voit tout (filtre région optionnel),
   * les autres uniquement les fiches dont l'auteur appartient à leur région.
   */
  async list(user: RniUser, filter: FormulaireFilter): Promise<FormulaireDto[]> {
    const region = user.id_profil === Profil.GIGN ? (filter.region ?? null) : user.id_region;
    if (user.id_profil !== Profil.GIGN && region == null) return [];
    if (filter.from && !isIsoDate(filter.from)) throw BusinessException.invalid('Date de début invalide.');
    if (filter.to && !isIsoDate(filter.to)) throw BusinessException.invalid('Date de fin invalide.');
    const where: string[] = [];
    if (region != null) where.push('ru.id_region = :region');
    if (filter.closed != null) where.push('f.is_closed = :closed');
    if (filter.from) where.push(`f.updated_at >= (:from::date)::timestamp AT TIME ZONE 'Europe/Paris'`);
    if (filter.to) where.push(`f.updated_at < ((:to::date) + 1)::timestamp AT TIME ZONE 'Europe/Paris'`);
    return this.db.select<FormulaireDto>(
      `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY f.updated_at DESC`,
      { region, closed: filter.closed, from: filter.from, to: filter.to },
    );
  }

  async get(user: RniUser, id: number): Promise<FormulaireDto> {
    const row = await this.db.one<FormulaireDto>(`${SELECT} WHERE f.id_formulaire = :id`, { id });
    if (!row) throw BusinessException.notFound('Fiche introuvable.');
    if (user.id_profil !== Profil.GIGN && row.auteur_id_region !== user.id_region) {
      throw new BusinessException(ErrorCode.HORS_PERIMETRE, undefined, 403);
    }
    return row;
  }

  /** BR-FOR-4 : créée au profit de l'utilisateur connecté. */
  async create(user: RniUser, body: unknown): Promise<FormulaireDto> {
    const content = sanitizeFormulaire(body, 'create');
    const created = await this.formulaires.create({ ...content, id_user: user.id_user, is_closed: false });
    return this.get(user, created.id_formulaire);
  }

  /** BR-FOR-5 : une fiche clôturée n'est plus modifiable. */
  async update(user: RniUser, id: number, body: unknown): Promise<FormulaireDto> {
    const current = await this.get(user, id);
    if (current.is_closed) throw new BusinessException(ErrorCode.FICHE_INALTERABLE, 'Fiche clôturée.');
    const content = sanitizeFormulaire(body, 'update');
    const nom = ('nom' in content ? content['nom'] : current['nom']) as string | null;
    const prenom = ('prenom' in content ? content['prenom'] : current['prenom']) as string | null;
    if (!hasNameOrFirstName(nom, prenom)) throw BusinessException.invalid('Le nom ou le prénom de l’individu est obligatoire.');
    await this.formulaires.update({ ...content }, { where: { id_formulaire: id, is_closed: false } });
    return this.get(user, id);
  }

  /** BR-FOR-5 / BR-FOR-6 : clôture irréversible, réservée à l'auteur. */
  async close(user: RniUser, id: number): Promise<FormulaireDto> {
    const current = await this.get(user, id);
    if (current.id_user !== user.id_user) throw new BusinessException(ErrorCode.ACTION_NON_AUTORISEE, 'Seul l’auteur peut clôturer la fiche.', 403);
    if (current.is_closed) throw new BusinessException(ErrorCode.FICHE_INALTERABLE, 'Fiche déjà clôturée.');
    await this.formulaires.update({ is_closed: true, closed_at: new Date() }, { where: { id_formulaire: id } });
    this.adminLog.trace('formulaire.close', user.nigend, { id_formulaire: id });
    return this.get(user, id);
  }

  /** BR-FOR-6 / BR-FOR-7 : suppression physique, réservée à l'auteur. */
  async remove(user: RniUser, id: number): Promise<void> {
    const current = await this.get(user, id);
    if (current.id_user !== user.id_user) throw new BusinessException(ErrorCode.FICHE_INALTERABLE, 'Seul l’auteur peut supprimer la fiche.', 403);
    await this.formulaires.destroy({ where: { id_formulaire: id } });
    this.adminLog.trace('formulaire.delete', user.nigend, { id_formulaire: id });
  }
}
