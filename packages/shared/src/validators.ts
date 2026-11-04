/**
 * Validations partagées client / API.
 */

/** Téléphone : national (`0[1-9]` + 8 chiffres) ou international (`+` / `00` + 6 à 15 chiffres). */
export const PHONE_REGEX = /^(?:0[1-9](?:[\s.-]?\d{2}){4}|(?:\+|00)[1-9](?:[\s.-]?\d){5,14})$/;

export function isValidPhone(value: string | null | undefined): boolean {
  return !!value && PHONE_REGEX.test(value.trim());
}

/** Nigend : identifiant agent sur 6 chiffres (certains anciens comptes sur 5). */
export const NIGEND_REGEX = /^\d{5,6}$/;

export function isValidNigend(value: unknown): value is string {
  return typeof value === 'string' && NIGEND_REGEX.test(value);
}

/** BR-FOR-3 : au moins l'un de nom / prénom renseigné. */
export function hasNameOrFirstName(nom?: string | null, prenom?: string | null): boolean {
  return !!(nom?.trim() || prenom?.trim());
}

/** Nombre minimal de caractères pour l'autocomplétion RPSI (BR-GPU-2). */
export const RPSI_SEARCH_MIN_CHARS = 6;
/** Nombre minimal de caractères pour le géocodeur de l'adresse temporaire (§5.2). */
export const GEOCODER_PLANNING_MIN_CHARS = 6;
/** Nombre minimal de caractères pour la recherche d'adresse de crise (BR-CAR-5). */
export const GEOCODER_CRISE_MIN_CHARS = 1;

/** Indicatif GEOLOC dérivé de l'id utilisateur (BR-REF-2) : `RNI` + id sur 6 chiffres. */
export function geolocIndicatif(idUser: number): string {
  return `RNI${String(idUser).padStart(6, '0')}`;
}

/**
 * §4.3 : déduplication des numéros NEO — si `numero_neo_2` est une liste CSV dont le premier
 * élément est `numero_neo_1`, seul le second est conservé.
 */
export function dedupeNeo(neo1?: string | null, neo2?: string | null): { neo1: string | null; neo2: string | null } {
  const n1 = neo1?.trim() || null;
  if (!neo2) return { neo1: n1, neo2: null };
  const parts = neo2
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length > 1 && parts[0] === n1) return { neo1: n1, neo2: parts[1] ?? null };
  const n2 = parts.join(', ') || null;
  return { neo1: n1, neo2: n2 === n1 ? null : n2 };
}
