import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ErrorCode, FORMULAIRE_FIELDS, FormulaireDto, FormulaireFilter, addDays, hasNameOrFirstName, isIsoDate, isNationalAdmin, zonedMidnight } from '@rni/shared';
import { Op, type WhereOptions } from 'sequelize';
import { AdminLogService } from '../../common/admin-log.service.js';
import type { RniUser } from '../../common/auth/current-user.js';
import { BusinessException } from '../../common/business.exception.js';
import { Formulaire, RefUser } from '../../database/models/index.js';
import { sanitizeFormulaire } from './formulaire.sanitize.js';

const CONTENT_ATTRIBUTES = [...FORMULAIRE_FIELDS.map((f) => f.key), 'terrain_x', 'terrain_y'];

type FormulaireWithAuteur = Formulaire & { auteur?: { nigend: string; grade: string | null; prenom: string; nom: string; id_region: number | null } };

/** Horodatage ISO sans millisecondes (format historique de l'API). */
const iso = (d: Date | string) => new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');

function toDto(f: FormulaireWithAuteur): FormulaireDto {
  const a = f.auteur;
  const content = Object.fromEntries(CONTENT_ATTRIBUTES.map((k) => [k, f.get(k) ?? null]));
  return {
    ...(content as unknown as FormulaireDto),
    id_formulaire: f.id_formulaire,
    id_user: f.id_user,
    is_closed: f.is_closed,
    created_at: iso(f.created_at),
    updated_at: iso(f.updated_at),
    auteur_nigend: a?.nigend ?? '',
    auteur_nom: a ? `${a.grade ?? ''} ${a.prenom} ${a.nom}`.trim() : '',
    auteur_id_region: a?.id_region ?? null,
  };
}

const AUTEUR = { model: RefUser, as: 'auteur', attributes: ['nigend', 'grade', 'prenom', 'nom', 'id_region'], required: true };

@Injectable()
export class FormulaireService {
  // Fiches de crise : seuls identifiants et métadonnées sont journalisés, jamais le contenu (données personnelles).
  private readonly logger = new Logger(FormulaireService.name);

  constructor(
    private readonly adminLog: AdminLogService,
    @InjectModel(Formulaire) private readonly formulaires: typeof Formulaire,
  ) {}

  /**
   * BR-FOR-2, appliqué **côté API** (dette §9.4) : le GIGN voit tout (filtre région optionnel),
   * les autres uniquement les fiches dont l'auteur appartient à leur région.
   */
  async list(user: RniUser, filter: FormulaireFilter): Promise<FormulaireDto[]> {
    const national = isNationalAdmin(user.id_profil);
    const region = national ? (filter.region ?? null) : user.id_region;
    if (!national && region == null) return [];
    if (filter.from && !isIsoDate(filter.from)) throw BusinessException.invalid('Date de début invalide.');
    if (filter.to && !isIsoDate(filter.to)) throw BusinessException.invalid('Date de fin invalide.');
    const where: WhereOptions[] = [];
    if (filter.closed != null) where.push({ is_closed: filter.closed });
    // Bornes de dates en heure de Paris (journée complète pour « au »)
    if (filter.from) where.push({ updated_at: { [Op.gte]: zonedMidnight(filter.from) } });
    if (filter.to) where.push({ updated_at: { [Op.lt]: zonedMidnight(addDays(filter.to, 1)) } });
    const found = await Formulaire.findAll({
      where: { [Op.and]: where },
      include: [{ ...AUTEUR, ...(region != null ? { where: { id_region: region } } : {}) }],
      order: [['updated_at', 'DESC']],
    });
    const rows = found.map((f) => toDto(f as FormulaireWithAuteur));
    this.logger.debug(
      `Fiches de crise (${user.nigend}) : région ${region ?? 'toutes'}, clôturées ${filter.closed ?? 'toutes'}, ${filter.from ?? '…'} → ${filter.to ?? '…'} : ${rows.length} fiche(s)`,
    );
    return rows;
  }

  async get(user: RniUser, id: number): Promise<FormulaireDto> {
    const found = await Formulaire.findByPk(id, { include: [AUTEUR] });
    if (!found) throw BusinessException.notFound('Fiche introuvable.');
    const row = toDto(found as FormulaireWithAuteur);
    if (!isNationalAdmin(user.id_profil) && row.auteur_id_region !== user.id_region) {
      this.logger.warn(`Fiche ${id} (région ${row.auteur_id_region}) refusée à ${user.nigend} (région ${user.id_region}) : hors périmètre.`);
      throw new BusinessException(ErrorCode.HORS_PERIMETRE, undefined, 403);
    }
    return row;
  }

  /** BR-FOR-4 : créée au profit de l'utilisateur connecté. */
  async create(user: RniUser, body: unknown): Promise<FormulaireDto> {
    const content = sanitizeFormulaire(body, 'create');
    const created = await this.formulaires.create({ ...content, id_user: user.id_user, is_closed: false });
    this.logger.log(`Fiche de crise ${created.id_formulaire} créée par ${user.nigend} (${Object.keys(content).length} champ(s) renseigné(s))`);
    return this.get(user, created.id_formulaire);
  }

  /** BR-FOR-5 : une fiche clôturée n'est plus modifiable. */
  async update(user: RniUser, id: number, body: unknown): Promise<FormulaireDto> {
    const current = await this.get(user, id);
    if (current.is_closed) {
      this.logger.warn(`Modification refusée : fiche ${id} clôturée (${user.nigend}).`);
      throw new BusinessException(ErrorCode.FICHE_INALTERABLE, 'Fiche clôturée.');
    }
    const content = sanitizeFormulaire(body, 'update');
    const nom = ('nom' in content ? content['nom'] : current['nom']) as string | null;
    const prenom = ('prenom' in content ? content['prenom'] : current['prenom']) as string | null;
    if (!hasNameOrFirstName(nom, prenom)) throw BusinessException.invalid('Le nom ou le prénom de l’individu est obligatoire.');
    await this.formulaires.update({ ...content }, { where: { id_formulaire: id, is_closed: false } });
    this.logger.log(`Fiche de crise ${id} modifiée par ${user.nigend} (champs : ${Object.keys(content).join(', ') || 'aucun'})`);
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
