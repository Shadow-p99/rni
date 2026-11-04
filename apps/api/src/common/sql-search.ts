/**
 * Recherche plein texte du personnel, partagée par la gestion du personnel et le planning.
 * Les expressions correspondent aux index trigrammes `ix_ref_user_search` / `ix_unite_libelle`.
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

/** `AND expr ILIKE :t0 AND expr ILIKE :t1 …` (expression couverte par un index trigrammes). */
export function wordsClause(expr: string, n: number): string {
  return Array.from({ length: n }, (_, i) => `AND (${expr}) ILIKE :t${i}`).join(' ');
}

export function termParams(terms: string[]): Record<string, string> {
  return Object.fromEntries(terms.map((t, i) => [`t${i}`, t]));
}

/**
 * Chaque mot doit apparaître dans nom, prénom, nigend, code ou libellé d'unité.
 * `= ANY(ARRAY(...))` permet un BitmapOr entre l'index trigrammes et l'index sur `code_unite`.
 * `alias` : alias SQL de la table / vue portant les colonnes de `ref_user` (préfixe `alias.`).
 */
export function userSearchClauses(alias: string, n: number): string[] {
  const a = alias ? `${alias}.` : '';
  return Array.from(
    { length: n },
    (_, i) =>
      `((${a}nigend || ' ' || ${a}nom || ' ' || ${a}prenom || ' ' || coalesce(${a}code_unite, '')) ILIKE :t${i}
        OR ${a}code_unite = ANY (ARRAY(SELECT code_unite FROM ref_unite WHERE libelle ILIKE :t${i})))`,
  );
}
