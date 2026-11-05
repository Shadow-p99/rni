import {
  CRISE_PAR_DEFAUT,
  FORMULAIRE_FIELDS,
  FormulaireContent,
  NOTE_MAX,
  NOTE_MIN,
  hasNameOrFirstName,
  isValidPhone,
} from '@rni/shared';
import { BusinessException } from '../../common/business.exception.js';

const MAX_TEXT = 20_000;

/**
 * Validation serveur d'une fiche de crise : seuls les champs du catalogue sont retenus
 * (liste blanche), types et bornes contrôlés, notes à 0 par défaut (BR-FOR-3).
 */
/** `crises` : libellés acceptés pour le type de crise (`ref_type_crise` actifs). */
export function sanitizeFormulaire(body: unknown, mode: 'create' | 'update', crises: readonly string[]): FormulaireContent {
  if (!body || typeof body !== 'object') throw BusinessException.invalid('Corps de requête invalide.');
  const src = body as Record<string, unknown>;
  const out: FormulaireContent = {};

  for (const def of FORMULAIRE_FIELDS) {
    if (!(def.key in src)) {
      if (mode === 'create' && def.kind === 'note') out[def.key] = 0;
      continue;
    }
    const raw = src[def.key];
    if (def.kind === 'note') {
      const n = raw === '' || raw == null ? 0 : Number(raw);
      if (!Number.isInteger(n) || n < NOTE_MIN || n > NOTE_MAX) {
        throw BusinessException.invalid(`${def.label} : note entière entre ${NOTE_MIN} et ${NOTE_MAX} attendue.`);
      }
      out[def.key] = n;
      continue;
    }
    if (raw != null && typeof raw !== 'string' && typeof raw !== 'number') throw BusinessException.invalid(`${def.label} : valeur invalide.`);
    const s = raw == null ? null : String(raw).trim() || null;
    if (s && s.length > (def.kind === 'textarea' ? MAX_TEXT : 512)) throw BusinessException.invalid(`${def.label} : texte trop long.`);
    if (def.kind === 'select' && s && !crises.includes(s) && s !== CRISE_PAR_DEFAUT) throw BusinessException.invalid('Type de crise inconnu.');
    if (def.kind === 'phone' && s && !isValidPhone(s)) throw BusinessException.invalid('Téléphone de l’auteur invalide.');
    out[def.key] = def.kind === 'select' ? (s ?? CRISE_PAR_DEFAUT) : s;
  }

  for (const key of ['terrain_x', 'terrain_y'] as const) {
    if (key in src) {
      const v = src[key];
      const n = v == null || v === '' ? null : Number(v);
      if (n != null && !Number.isFinite(n)) throw BusinessException.invalid('Coordonnées invalides.');
      out[key] = n;
    }
  }
  if ('terrain_adresse' in out && !out['terrain_adresse']) {
    out['terrain_x'] = null;
    out['terrain_y'] = null;
  }

  if (mode === 'create' && !hasNameOrFirstName(out['nom'] as string | null, out['prenom'] as string | null)) {
    throw BusinessException.invalid('Le nom ou le prénom de l’individu est obligatoire.');
  }
  return out;
}
