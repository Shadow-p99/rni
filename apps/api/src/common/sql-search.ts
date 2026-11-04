import { Op, type WhereOptions } from 'sequelize';
import { RefUnite } from '../database/models/index.js';

/**
 * Recherche plein texte du personnel, partagée par la gestion du personnel et le planning.
 * La colonne `recherche` des vues (v_user_detail, v_personnel_to_ref_user) reprend l'expression
 * des index trigrammes : `Op.iLike` sur cette colonne utilise l'index.
 */

/** Découpe la recherche en mots (5 max), échappe les jokers SQL et encadre de `%`. */
export function searchTerms(q?: string | null): string[] {
  return (q ?? '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 5)
    .map((w) => `%${w.slice(0, 64).replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
}

/** Chaque mot présent dans `recherche` (nigend, nom, prénom…). */
export function wordsWhere(terms: string[]): WhereOptions[] {
  return terms.map((t) => ({ recherche: { [Op.iLike]: t } }));
}

/**
 * Chaque mot doit apparaître dans nom, prénom, nigend, code ou **libellé** d'unité : les unités
 * dont le libellé correspond (index trigrammes `ix_unite_libelle`) sont d'abord recherchées.
 */
export async function personnelSearchWhere(terms: string[]): Promise<WhereOptions[]> {
  return Promise.all(
    terms.map(async (t) => {
      const unites = await RefUnite.findAll({ attributes: ['code_unite'], where: { libelle: { [Op.iLike]: t } }, raw: true });
      const codes = unites.map((u) => u.code_unite);
      return codes.length ? { [Op.or]: [{ recherche: { [Op.iLike]: t } }, { code_unite: { [Op.in]: codes } }] } : { recherche: { [Op.iLike]: t } };
    }),
  );
}
