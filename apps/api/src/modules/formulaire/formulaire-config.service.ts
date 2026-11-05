import { Injectable, Logger } from '@nestjs/common';
import {
  CRISE_PAR_DEFAUT,
  FORMULAIRE_FIELDS,
  SECTIONS,
  type FormulaireChampDto,
  type FormulaireConfigDto,
  type FormulaireConfigUpdateDto,
  type FormulaireSectionDto,
  type SectionId,
  type TypeCriseDto,
} from '@rni/shared';
import { Op } from 'sequelize';
import { BusinessException } from '../../common/business.exception.js';
import { CacheService, CacheTag, CacheTtl } from '../../common/cache/cache.service.js';
import { Db } from '../../database/db.service.js';
import { FormulaireChamp, FormulaireSection, RefTypeCrise } from '../../database/models/index.js';

/**
 * Structure de la fiche de crise paramétrable (Administration › Fiche de crise) : types de crise
 * (`ref_type_crise`), libellés / impression des sections, libellés / obligation / ordre des champs.
 * La nature des champs (colonnes de `t_formulaire`) reste celle du catalogue technique de @rni/shared.
 */
@Injectable()
export class FormulaireConfigService {
  private readonly logger = new Logger(FormulaireConfigService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly db: Db,
  ) {}

  /** Structure complète (types de crise inactifs compris : l'écran d'administration en a besoin). */
  config(): Promise<FormulaireConfigDto> {
    return this.cache.wrap('ref:formulaire', CacheTtl.REFERENTIEL, () => this.load(), [CacheTag.REFERENTIEL]);
  }

  private async load(): Promise<FormulaireConfigDto> {
    const [crises, sections, champs] = await Promise.all([
      RefTypeCrise.findAll({ order: [['ordre', 'ASC'], ['id_type_crise', 'ASC']], raw: true }),
      FormulaireSection.findAll({ raw: true }),
      FormulaireChamp.findAll({ raw: true }),
    ]);
    const sectionRows = new Map(sections.map((s) => [s.id_section, s]));
    const champRows = new Map(champs.map((c) => [c.cle, c]));
    const secs: FormulaireSectionDto[] = SECTIONS.map((s, i) => {
      const row = sectionRows.get(s.id);
      return { id: s.id, libelle: row?.libelle ?? s.libelle, imprimable: row?.imprimable ?? s.imprimable, ordre: row?.ordre ?? (i + 1) * 10 };
    }).sort((a, b) => a.ordre - b.ordre);
    const fields: FormulaireChampDto[] = FORMULAIRE_FIELDS.map((f, i) => {
      const row = champRows.get(f.key);
      return { key: f.key, label: row?.libelle ?? f.label, section: f.section, kind: f.kind, required: row?.obligatoire ?? f.required, ordre: row?.ordre ?? i };
    }).sort((a, b) => a.ordre - b.ordre);
    const types: TypeCriseDto[] = crises.length
      ? crises.map((c) => ({ id_type_crise: c.id_type_crise, libelle: c.libelle, ordre: c.ordre, is_actif: c.is_actif }))
      : [{ id_type_crise: 0, libelle: CRISE_PAR_DEFAUT, ordre: 0, is_actif: true }];
    return { crises: types, sections: secs, champs: fields };
  }

  /** Libellés acceptés pour le type de crise. */
  async crisesActives(): Promise<string[]> {
    return (await this.config()).crises.filter((c) => c.is_actif).map((c) => c.libelle);
  }

  async update(dto: FormulaireConfigUpdateDto, by: string): Promise<FormulaireConfigDto> {
    const sectionIds = new Set<string>(SECTIONS.map((s) => s.id));
    const fieldKeys = new Set(FORMULAIRE_FIELDS.map((f) => f.key));
    const crises = (dto.crises ?? []).map((c) => ({ ...c, libelle: c.libelle?.trim() ?? '' }));
    if (!crises.length) throw BusinessException.invalid('Au moins un type de crise est requis.');
    if (crises.some((c) => !c.libelle || c.libelle.length > 128)) throw BusinessException.invalid('Libellé de type de crise vide ou trop long (128 caractères).');
    const lower = crises.map((c) => c.libelle.toLocaleLowerCase('fr'));
    if (new Set(lower).size !== lower.length) throw BusinessException.invalid('Deux types de crise portent le même libellé.');
    if (!crises.some((c) => c.libelle === CRISE_PAR_DEFAUT && c.is_actif)) {
      throw BusinessException.invalid(`Le type « ${CRISE_PAR_DEFAUT} » (valeur par défaut) doit rester présent et actif.`);
    }
    for (const s of dto.sections ?? []) {
      if (!sectionIds.has(s.id)) throw BusinessException.invalid(`Section inconnue : ${s.id}.`);
      if (!s.libelle?.trim() || s.libelle.trim().length > 128) throw BusinessException.invalid('Libellé de section vide ou trop long.');
    }
    for (const c of dto.champs ?? []) {
      if (!fieldKeys.has(c.key)) throw BusinessException.invalid(`Champ inconnu : ${c.key}.`);
      if (!c.label?.trim() || c.label.trim().length > 128) throw BusinessException.invalid('Libellé de champ vide ou trop long.');
      if (!Number.isInteger(c.ordre) || c.ordre < 0 || c.ordre > 100_000) throw BusinessException.invalid('Ordre de champ invalide.');
    }

    await this.db.transaction(async (transaction) => {
      const existing = await RefTypeCrise.findAll({ transaction, lock: transaction.LOCK.UPDATE });
      const byId = new Map(existing.map((c) => [c.id_type_crise, c]));
      const kept = new Set<number>();
      for (const [i, c] of crises.entries()) {
        const row = c.id_type_crise != null ? byId.get(c.id_type_crise) : undefined;
        if (c.id_type_crise != null && !row) throw BusinessException.invalid(`Type de crise inconnu : ${c.id_type_crise}.`);
        if (row) {
          kept.add(row.id_type_crise);
          await row.update({ libelle: c.libelle, is_actif: c.is_actif, ordre: (i + 1) * 10 }, { transaction });
        } else {
          await RefTypeCrise.create({ libelle: c.libelle, is_actif: c.is_actif, ordre: (i + 1) * 10 }, { transaction });
        }
      }
      // Types retirés de la liste : supprimés (les fiches gardent le libellé enregistré)
      const removed = existing.filter((c) => !kept.has(c.id_type_crise)).map((c) => c.id_type_crise);
      if (removed.length) await RefTypeCrise.destroy({ where: { id_type_crise: { [Op.in]: removed } }, transaction });
      for (const s of dto.sections ?? []) {
        const ordre = SECTIONS.findIndex((x) => x.id === s.id) * 10 + 10;
        await FormulaireSection.upsert({ id_section: s.id as SectionId, libelle: s.libelle.trim(), imprimable: !!s.imprimable, ordre }, { transaction });
      }
      for (const c of dto.champs ?? []) {
        await FormulaireChamp.upsert({ cle: c.key, libelle: c.label.trim(), obligatoire: !!c.required, ordre: c.ordre }, { transaction });
      }
    });
    this.cache.invalidate(CacheTag.REFERENTIEL);
    this.logger.log(`Fiche de crise paramétrée par ${by} : ${crises.length} type(s) de crise, ${dto.sections?.length ?? 0} section(s), ${dto.champs?.length ?? 0} champ(s)`);
    return this.config();
  }
}
