import { Injectable, Logger } from '@nestjs/common';
import {
  DROIT_CODES,
  DROIT_MODULES,
  LOCKED_DROITS,
  PARAM_COULEUR_SANS_PLANNING,
  PARAM_JOURS_GLISSANTS,
  PERIMETRE_MODULES,
  Profil,
  defaultPerimetre,
  parseJoursGlissants,
  type DroitCode,
  type DroitDefDto,
  type DroitModule,
  type DroitsMap,
  type DroitsMatrixDto,
  type DroitsUpdateDto,
  type MessageDto,
  type MessageType,
  type ParamAppDto,
  type ParamAppUpdateDto,
  type Portee,
  type PositionInputDto,
  type PositionServiceDto,
  type ProfilAdminDto,
  type ProfilCreateDto,
  type ProfilGestionUpdateDto,
  type ProfilInputDto,
} from '@rni/shared';
import { Op, type Transaction } from 'sequelize';
import { BusinessException } from '../../common/business.exception.js';
import { CacheService, CacheTag } from '../../common/cache/cache.service.js';
import { MessagesService } from '../../common/messages.service.js';
import { Db } from '../../database/db.service.js';
import {
  AdminMessage,
  ParamApp,
  PerimetreProfil,
  ProfilClassement,
  ProfilDroit,
  ProfilGestion,
  RefDroit,
  RefPosService,
  RefProfil,
  RefUser,
} from '../../database/models/index.js';

/** Profils livrés : non supprimables. */
const SYSTEM_PROFILS = new Set<number>([1, 2, 3, 4, 5, 6, 7, 8]);
const MESSAGE_TYPES: readonly MessageType[] = ['ERREUR', 'AVERTISSEMENT', 'INFO'];
/** Clé de paramètre contenant un secret : valeur jamais renvoyée au navigateur. */
const SECRET_KEY = /(token|secret|password|passwd|mot_de_passe|api[_.-]?key|apikey|credential)/i;
const COLOR = /^#[0-9a-fA-F]{6}$/;

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z') : null);

/** Réglé par un autre écran d'administration (lecture seule dans « Paramètres »). */
function gerePar(cle: string): string | null {
  if (cle.startsWith('rni.log.') || cle === 'rni.metrics.retention_days') return 'Journalisation';
  return null;
}

/**
 * Paramétrage de l'application par le super administrateur : droits par profil, profils et
 * règles de gestion du personnel, positions de service, paramètres applicatifs, messages.
 * Chaque modification est appliquée immédiatement par tous les processus (cache invalidé,
 * notification PostgreSQL) et tracée par l'appelant.
 */
@Injectable()
export class ParametrageService {
  private readonly logger = new Logger(ParametrageService.name);

  constructor(
    private readonly db: Db,
    private readonly cache: CacheService,
    private readonly messages: MessagesService,
  ) {}

  private invalidate(...tags: CacheTag[]): void {
    this.cache.invalidate(...tags);
  }

  private async profilsOrdonnes(): Promise<{ id_profil: number; libelle: string; code: string | null; has_planning: boolean; classement: number }[]> {
    const [profils, classements] = await Promise.all([RefProfil.findAll({ raw: true }), ProfilClassement.findAll({ raw: true })]);
    const rank = new Map(classements.map((c) => [c.id_profil, c.classement]));
    return profils
      .map((p) => ({ id_profil: p.id_profil, libelle: p.libelle, code: p.code, has_planning: !!p.has_planning, classement: rank.get(p.id_profil) ?? 99 }))
      .sort((a, b) => a.classement - b.classement || a.id_profil - b.id_profil);
  }

  private async userCounts(): Promise<Map<number, number>> {
    const rows = (await RefUser.count({ where: { bool_user_inactif: false }, group: ['id_profil'] })) as unknown as { id_profil: number; count: number | string }[];
    return new Map(rows.map((r) => [r.id_profil, Number(r.count)]));
  }

  // --- Droits ------------------------------------------------------------------

  async droits(): Promise<DroitsMatrixDto> {
    const [catalogue, attributions, profils, counts] = await Promise.all([
      RefDroit.findAll({ order: [['ordre', 'ASC'], ['code', 'ASC']], raw: true }),
      ProfilDroit.findAll({ raw: true }),
      this.profilsOrdonnes(),
      this.userCounts(),
    ]);
    const known = new Set<string>(DROIT_CODES);
    const moduleRank = (m: string) => DROIT_MODULES.indexOf(m as DroitModule);
    const defs: DroitDefDto[] = catalogue
      .filter((d) => known.has(d.code))
      .map((d) => ({ code: d.code as DroitCode, module: d.module as DroitModule, libelle: d.libelle, description: d.description, portees: d.portees as Portee[], ordre: d.ordre }))
      .sort((a, b) => moduleRank(a.module) - moduleRank(b.module) || a.ordre - b.ordre);
    const byProfil = new Map<number, DroitsMap>();
    let last: { at: Date; by: string | null } | null = null;
    for (const a of attributions) {
      if (!known.has(a.code_droit)) continue;
      byProfil.set(a.id_profil, { ...(byProfil.get(a.id_profil) ?? {}), [a.code_droit]: a.portee as Portee });
      const at = new Date(a.updated_at);
      if (!last || at > last.at) last = { at, by: a.updated_by };
    }
    return {
      catalogue: defs,
      profils: profils.map((p) => ({
        id_profil: p.id_profil,
        libelle: p.libelle,
        droits: byProfil.get(p.id_profil) ?? {},
        locked: p.id_profil === Profil.SUPER_ADMIN ? [...LOCKED_DROITS] : [],
        nb_utilisateurs: counts.get(p.id_profil) ?? 0,
      })),
      updated_at: iso(last?.at),
      updated_by: last?.by ?? null,
    };
  }

  async updateDroits(dto: DroitsUpdateDto, by: string): Promise<{ result: DroitsMatrixDto; changes: string[] }> {
    if (!Array.isArray(dto?.items) || !dto.items.length) throw BusinessException.missing('items');
    if (dto.items.length > 2000) throw BusinessException.invalid('Trop de modifications en une fois.');
    const [catalogue, profils] = await Promise.all([RefDroit.findAll({ raw: true }), RefProfil.findAll({ attributes: ['id_profil'], raw: true })]);
    const defs = new Map(catalogue.map((d) => [d.code, d]));
    const profilIds = new Set(profils.map((p) => p.id_profil));
    for (const i of dto.items) {
      if (!profilIds.has(i.id_profil)) throw BusinessException.invalid(`Profil inconnu : ${i.id_profil}.`);
      const def = defs.get(i.code);
      if (!def || !(DROIT_CODES as readonly string[]).includes(i.code)) throw BusinessException.invalid(`Droit inconnu : ${i.code}.`);
      if (i.portee != null && !def.portees.includes(i.portee)) throw BusinessException.invalid(`Portée « ${i.portee} » non proposée pour ${i.code}.`);
      if (i.id_profil === Profil.SUPER_ADMIN && LOCKED_DROITS.includes(i.code) && i.portee == null) {
        throw BusinessException.forbidden('Le super administrateur garde toujours l’accès à l’administration.');
      }
    }
    const changes: string[] = [];
    await this.db.transaction(async (transaction) => {
      const current = await ProfilDroit.findAll({ transaction, lock: transaction.LOCK.UPDATE });
      const byKey = new Map(current.map((c) => [`${c.id_profil}:${c.code_droit}`, c]));
      for (const i of dto.items) {
        const existing = byKey.get(`${i.id_profil}:${i.code}`);
        if ((existing?.portee ?? null) === (i.portee ?? null)) continue;
        changes.push(`profil ${i.id_profil} ${i.code}: ${existing?.portee ?? '—'} → ${i.portee ?? '—'}`);
        if (i.portee == null) await ProfilDroit.destroy({ where: { id_profil: i.id_profil, code_droit: i.code }, transaction });
        else await ProfilDroit.upsert({ id_profil: i.id_profil, code_droit: i.code, portee: i.portee, updated_at: new Date(), updated_by: by }, { transaction });
      }
    });
    this.invalidate(CacheTag.PARAM);
    if (changes.length) this.logger.log(`Droits modifiés par ${by} : ${changes.join(', ')}`);
    return { result: await this.droits(), changes };
  }

  // --- Profils -----------------------------------------------------------------

  async profils(): Promise<ProfilAdminDto[]> {
    const [profils, counts, gestion] = await Promise.all([this.profilsOrdonnes(), this.userCounts(), ProfilGestion.findAll({ raw: true })]);
    return profils.map((p) => ({
      ...p,
      nb_utilisateurs: counts.get(p.id_profil) ?? 0,
      systeme: SYSTEM_PROFILS.has(p.id_profil),
      visibles: gestion.filter((g) => g.id_profil === p.id_profil && g.visible).map((g) => g.id_profil_cible),
      gerables: gestion.filter((g) => g.id_profil === p.id_profil && g.visible && g.gerable).map((g) => g.id_profil_cible),
    }));
  }

  private checkProfilInput(dto: ProfilInputDto): ProfilInputDto {
    const libelle = dto?.libelle?.trim() ?? '';
    if (!libelle || libelle.length > 64) throw BusinessException.invalid('Libellé du profil obligatoire (64 caractères au plus).');
    const code = dto.code?.trim() || null;
    if (code && code.length > 4) throw BusinessException.invalid('Code du profil : 4 caractères au plus.');
    if (!Number.isInteger(dto.classement) || dto.classement < 0 || dto.classement > 999) throw BusinessException.invalid('Ordre d’affichage : entier entre 0 et 999.');
    return { libelle, code, classement: dto.classement, has_planning: !!dto.has_planning };
  }

  async createProfil(dto: ProfilCreateDto, by: string): Promise<ProfilAdminDto[]> {
    const input = this.checkProfilInput(dto);
    let id = 0;
    await this.db.transaction(async (transaction) => {
      const all = await RefProfil.findAll({ transaction, lock: transaction.LOCK.UPDATE });
      if (all.some((p) => p.libelle.toLocaleLowerCase('fr') === input.libelle.toLocaleLowerCase('fr'))) throw BusinessException.invalid('Un profil porte déjà ce libellé.');
      const modele = dto.modele != null ? all.find((p) => p.id_profil === dto.modele) : undefined;
      if (dto.modele != null && !modele) throw BusinessException.invalid(`Profil modèle inconnu : ${dto.modele}.`);
      id = Math.max(100, ...all.map((p) => p.id_profil + 1));
      await RefProfil.create({ id_profil: id, code: input.code, libelle: input.libelle, has_planning: input.has_planning }, { transaction });
      await ProfilClassement.create({ id_profil: id, classement: input.classement }, { transaction });
      await this.copyFromModel(id, modele?.id_profil ?? null, by, transaction);
    });
    this.invalidate(CacheTag.PARAM, CacheTag.REFERENTIEL, CacheTag.USERS);
    this.logger.log(`Profil ${id} « ${input.libelle} » créé par ${by}${dto.modele != null ? ` à partir du profil ${dto.modele}` : ''}`);
    return this.profils();
  }

  /** Droits, périmètres et règles de gestion d'un nouveau profil : copie du modèle, sinon minimum. */
  private async copyFromModel(id: number, modele: number | null, by: string, transaction: Transaction): Promise<void> {
    const now = new Date();
    if (modele == null) {
      // Sans modèle : consultation de la carte et du planning, périmètre « sa région »
      await ProfilDroit.bulkCreate(['carte.voir', 'planning.voir'].map((code_droit) => ({ id_profil: id, code_droit, portee: 'oui', updated_at: now, updated_by: by })), { transaction });
      await PerimetreProfil.bulkCreate(PERIMETRE_MODULES.map((module) => ({ id_profil: id, module, perimetre: defaultPerimetre(id, module), updated_at: now, updated_by: by })), { transaction });
      return;
    }
    const [droits, perimetres, gestion, cibles] = await Promise.all([
      ProfilDroit.findAll({ where: { id_profil: modele }, raw: true, transaction }),
      PerimetreProfil.findAll({ where: { id_profil: modele }, raw: true, transaction }),
      ProfilGestion.findAll({ where: { id_profil: modele }, raw: true, transaction }),
      // Profils qui géraient le modèle : ils gèrent aussi le nouveau profil
      ProfilGestion.findAll({ where: { id_profil_cible: modele }, raw: true, transaction }),
    ]);
    // L'administration n'est jamais copiée implicitement
    await ProfilDroit.bulkCreate(
      droits.filter((d) => !LOCKED_DROITS.includes(d.code_droit as DroitCode)).map((d) => ({ id_profil: id, code_droit: d.code_droit, portee: d.portee, updated_at: now, updated_by: by })),
      { transaction },
    );
    await PerimetreProfil.bulkCreate(
      PERIMETRE_MODULES.map((module) => ({
        id_profil: id,
        module,
        perimetre: perimetres.find((p) => p.module === module)?.perimetre ?? defaultPerimetre(id, module),
        updated_at: now,
        updated_by: by,
      })),
      { transaction },
    );
    await ProfilGestion.bulkCreate(
      [
        ...gestion.map((g) => ({ id_profil: id, id_profil_cible: g.id_profil_cible === modele ? id : g.id_profil_cible, visible: g.visible, gerable: g.gerable })),
        ...cibles.filter((g) => g.id_profil !== modele).map((g) => ({ id_profil: g.id_profil, id_profil_cible: id, visible: g.visible, gerable: g.gerable })),
      ].map((g) => ({ ...g, updated_at: now, updated_by: by })),
      { transaction },
    );
  }

  async updateProfil(id: number, dto: ProfilInputDto, by: string): Promise<ProfilAdminDto[]> {
    const input = this.checkProfilInput(dto);
    await this.db.transaction(async (transaction) => {
      const profil = await RefProfil.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!profil) throw BusinessException.notFound('Profil introuvable.');
      const homonyme = await RefProfil.findOne({ where: { id_profil: { [Op.ne]: id }, libelle: { [Op.iLike]: input.libelle } }, transaction });
      if (homonyme) throw BusinessException.invalid('Un profil porte déjà ce libellé.');
      await profil.update({ libelle: input.libelle, code: input.code, has_planning: input.has_planning }, { transaction });
      await ProfilClassement.upsert({ id_profil: id, classement: input.classement }, { transaction });
    });
    this.invalidate(CacheTag.REFERENTIEL, CacheTag.USERS, CacheTag.PARAM, CacheTag.PLANNING);
    this.logger.log(`Profil ${id} modifié par ${by} : « ${input.libelle} », ordre ${input.classement}, planning ${input.has_planning ? 'oui' : 'non'}`);
    return this.profils();
  }

  async deleteProfil(id: number, by: string): Promise<ProfilAdminDto[]> {
    if (SYSTEM_PROFILS.has(id)) throw BusinessException.forbidden('Les profils livrés ne peuvent pas être supprimés.');
    await this.db.transaction(async (transaction) => {
      const profil = await RefProfil.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!profil) throw BusinessException.notFound('Profil introuvable.');
      // Comptes inactifs compris : la clé étrangère de ref_user l'exige
      const users = await RefUser.count({ where: { id_profil: id }, transaction });
      if (users) throw BusinessException.invalid(`Profil attribué à ${users} compte(s) (actifs ou désactivés) : attribuez-leur un autre profil avant de le supprimer.`);
      await ProfilDroit.destroy({ where: { id_profil: id }, transaction });
      await PerimetreProfil.destroy({ where: { id_profil: id }, transaction });
      await ProfilGestion.destroy({ where: { [Op.or]: [{ id_profil: id }, { id_profil_cible: id }] }, transaction });
      await ProfilClassement.destroy({ where: { id_profil: id }, transaction });
      await profil.destroy({ transaction });
    });
    this.invalidate(CacheTag.PARAM, CacheTag.REFERENTIEL, CacheTag.USERS);
    this.logger.log(`Profil ${id} supprimé par ${by}`);
    return this.profils();
  }

  async updateGestion(dto: ProfilGestionUpdateDto, by: string): Promise<{ result: ProfilAdminDto[]; changes: string[] }> {
    if (!Array.isArray(dto?.items) || !dto.items.length) throw BusinessException.missing('items');
    const ids = new Set((await RefProfil.findAll({ attributes: ['id_profil'], raw: true })).map((p) => p.id_profil));
    for (const i of dto.items) {
      if (!ids.has(i.id_profil) || !ids.has(i.id_profil_cible)) throw BusinessException.invalid('Profil inconnu.');
      if (i.gerable && !i.visible) throw BusinessException.invalid('Un profil géré doit aussi être listé.');
      if (i.id_profil_cible === Profil.SUPER_ADMIN && i.gerable && i.id_profil !== Profil.SUPER_ADMIN) {
        throw BusinessException.forbidden('Seul le super administrateur gère les comptes super administrateur.');
      }
    }
    const changes: string[] = [];
    await this.db.transaction(async (transaction) => {
      const current = await ProfilGestion.findAll({ transaction, lock: transaction.LOCK.UPDATE });
      const byKey = new Map(current.map((c) => [`${c.id_profil}:${c.id_profil_cible}`, c]));
      for (const i of dto.items) {
        const e = byKey.get(`${i.id_profil}:${i.id_profil_cible}`);
        if ((e?.visible ?? false) === i.visible && (e?.gerable ?? false) === i.gerable) continue;
        changes.push(`profil ${i.id_profil} → ${i.id_profil_cible}: ${i.gerable ? 'géré' : i.visible ? 'listé' : 'masqué'}`);
        if (!i.visible) await ProfilGestion.destroy({ where: { id_profil: i.id_profil, id_profil_cible: i.id_profil_cible }, transaction });
        else await ProfilGestion.upsert({ ...i, updated_at: new Date(), updated_by: by }, { transaction });
      }
    });
    this.invalidate(CacheTag.PARAM);
    if (changes.length) this.logger.log(`Gestion du personnel modifiée par ${by} : ${changes.join(', ')}`);
    return { result: await this.profils(), changes };
  }

  // --- Positions de service ---------------------------------------------------

  async positions(): Promise<PositionServiceDto[]> {
    return (await RefPosService.findAll({ order: [['id_pos_service', 'ASC']], raw: true })).map((p) => ({
      id_pos_service: p.id_pos_service,
      libelle: p.libelle,
      color: p.color,
      is_actif: p.is_actif,
      is_restreinte: !!p.is_restreinte,
      priorite_cluster: p.priorite_cluster ?? null,
    }));
  }

  private checkPosition(dto: PositionInputDto): PositionInputDto {
    const libelle = dto?.libelle?.trim() ?? '';
    if (!libelle || libelle.length > 64) throw BusinessException.invalid('Libellé de la position obligatoire (64 caractères au plus).');
    if (!COLOR.test(dto.color ?? '')) throw BusinessException.invalid('Couleur au format #rrggbb attendue.');
    const prio = dto.priorite_cluster;
    if (prio != null && (!Number.isInteger(prio) || prio < 1 || prio > 99)) throw BusinessException.invalid('Priorité de cluster : entier entre 1 et 99, ou vide.');
    return { libelle, color: dto.color.toLowerCase(), is_actif: !!dto.is_actif, is_restreinte: !!dto.is_restreinte, priorite_cluster: prio ?? null };
  }

  async createPosition(dto: PositionInputDto, by: string): Promise<PositionServiceDto[]> {
    const input = this.checkPosition(dto);
    await this.db.transaction(async (transaction) => {
      const all = await RefPosService.findAll({ transaction, lock: transaction.LOCK.UPDATE });
      if (all.some((p) => p.libelle.toLocaleLowerCase('fr') === input.libelle.toLocaleLowerCase('fr'))) throw BusinessException.invalid('Une position porte déjà ce libellé.');
      await RefPosService.create({ id_pos_service: Math.max(0, ...all.map((p) => p.id_pos_service)) + 1, ...input }, { transaction });
    });
    this.invalidate(CacheTag.REFERENTIEL, CacheTag.PLANNING);
    this.logger.log(`Position de service « ${input.libelle} » créée par ${by}`);
    return this.positions();
  }

  async updatePosition(id: number, dto: PositionInputDto, by: string): Promise<PositionServiceDto[]> {
    const input = this.checkPosition(dto);
    const pos = await RefPosService.findByPk(id);
    if (!pos) throw BusinessException.notFound('Position introuvable.');
    const homonyme = await RefPosService.findOne({ where: { id_pos_service: { [Op.ne]: id }, libelle: { [Op.iLike]: input.libelle } } });
    if (homonyme) throw BusinessException.invalid('Une position porte déjà ce libellé.');
    if (!input.is_actif) {
      const actives = await RefPosService.count({ where: { id_pos_service: { [Op.ne]: id }, is_actif: true } });
      if (!actives) throw BusinessException.invalid('Au moins une position doit rester active.');
    }
    await pos.update(input);
    this.invalidate(CacheTag.REFERENTIEL, CacheTag.PLANNING);
    this.logger.log(`Position de service ${id} modifiée par ${by} : ${JSON.stringify(input)}`);
    return this.positions();
  }

  // --- Paramètres applicatifs -------------------------------------------------

  async params(): Promise<ParamAppDto[]> {
    const rows = await ParamApp.findAll({ order: [['cle_param_app', 'ASC']], raw: true });
    return rows.map((r) => {
      const secret = SECRET_KEY.test(r.cle_param_app);
      return { cle: r.cle_param_app, valeur: secret ? null : r.valeur, description: r.description, is_front: r.is_front, secret, gere_par: gerePar(r.cle_param_app) };
    });
  }

  async updateParam(dto: ParamAppUpdateDto, by: string): Promise<{ result: ParamAppDto[]; secret: boolean; before: string | null }> {
    const cle = dto?.cle ?? '';
    const valeur = typeof dto?.valeur === 'string' ? dto.valeur.trim() : null;
    if (valeur == null) throw BusinessException.missing('valeur');
    if (valeur.length > 10_000) throw BusinessException.invalid('Valeur trop longue (10 000 caractères).');
    const row = await ParamApp.findByPk(cle);
    if (!row) throw BusinessException.notFound(`Paramètre inconnu : ${cle}.`);
    const owner = gerePar(cle);
    if (owner) throw BusinessException.invalid(`Ce paramètre se règle dans l’écran ${owner}.`);
    const secret = SECRET_KEY.test(cle);
    if (secret && !valeur) throw BusinessException.invalid('Saisissez la nouvelle valeur du secret.');
    if (cle === PARAM_COULEUR_SANS_PLANNING && !COLOR.test(valeur)) throw BusinessException.invalid('Couleur au format #rrggbb attendue.');
    if (cle === PARAM_JOURS_GLISSANTS && valeur !== '' && parseJoursGlissants(valeur) == null) throw BusinessException.invalid('Nombre de jours entier positif attendu (vide = désactivé).');
    const before = row.valeur;
    await row.update({ valeur });
    this.invalidate(CacheTag.PARAM, CacheTag.EXTERNAL);
    this.logger.log(`Paramètre ${cle} modifié par ${by}${secret ? ' (secret)' : ''}`);
    return { result: await this.params(), secret, before: secret ? null : before };
  }

  // --- Messages ----------------------------------------------------------------

  async messagesList(): Promise<MessageDto[]> {
    return (await AdminMessage.findAll({ order: [['code_message', 'ASC']], raw: true })).map((m) => ({ code_message: m.code_message, libelle: m.libelle, type: m.type as MessageType }));
  }

  async updateMessage(dto: MessageDto, by: string): Promise<MessageDto[]> {
    const libelle = dto?.libelle?.trim() ?? '';
    if (!libelle || libelle.length > 512) throw BusinessException.invalid('Libellé obligatoire (512 caractères au plus).');
    if (!MESSAGE_TYPES.includes(dto.type)) throw BusinessException.invalid('Type : ERREUR, AVERTISSEMENT ou INFO.');
    const row = await AdminMessage.findByPk(dto.code_message);
    if (!row) throw BusinessException.notFound(`Message inconnu : ${dto.code_message}.`);
    await row.update({ libelle, type: dto.type });
    await this.messages.refresh();
    this.logger.log(`Message ${dto.code_message} modifié par ${by}`);
    return this.messagesList();
  }
}
