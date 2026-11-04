/**
 * Pagination côté serveur : les listes potentiellement volumineuses (personnel…) ne sont
 * jamais renvoyées en totalité.
 */
export interface Page<T> {
  items: T[];
  /** Nombre total d'éléments correspondant aux filtres. */
  total: number;
  /** Numéro de page (à partir de 1). */
  page: number;
  size: number;
  /** `true` si le comptage a été plafonné : `total` est alors un minimum (affiner la recherche). */
  capped?: boolean;
}

/** Au-delà, le total n'est plus compté exactement et les pages ne sont plus proposées. */
export const MAX_COUNTED_ROWS = 100_000;

export const PAGE_SIZES = [20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type SortDir = 'asc' | 'desc';

/** Colonnes de tri autorisées pour la liste du personnel. */
export const USER_SORTS = ['defaut', 'nom', 'nigend', 'unite', 'region', 'profil'] as const;
export type UserSort = (typeof USER_SORTS)[number];

export interface UserListQuery {
  page?: number;
  size?: number;
  /** Recherche plein texte : nom, prénom, nigend, code ou libellé d'unité. */
  q?: string;
  region?: number;
  profil?: number;
  sort?: UserSort;
  dir?: SortDir;
}

/** Normalise page / taille demandées. */
export function normalizePage(page?: number | string | null, size?: number | string | null): { page: number; size: number; offset: number } {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const s = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(size) || DEFAULT_PAGE_SIZE)));
  return { page: p, size: s, offset: (p - 1) * s };
}

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

/**
 * Numéros de pages à afficher autour de la page courante (`null` = ellipse).
 * Ex. page 7 / 20 → [1, null, 5, 6, 7, 8, 9, null, 20]
 */
export function pageWindow(page: number, pages: number, radius = 2): (number | null)[] {
  const out: (number | null)[] = [];
  const from = Math.max(2, page - radius);
  const to = Math.min(pages - 1, page + radius);
  out.push(1);
  if (from > 2) out.push(null);
  for (let i = from; i <= to; i++) out.push(i);
  if (to < pages - 1) out.push(null);
  if (pages > 1) out.push(pages);
  return out;
}
