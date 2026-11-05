import { FormControl, FormGroup, Validators } from '@angular/forms';
import { CRISE_PAR_DEFAUT, FormulaireChampDto, FormulaireDto, GeocodeCandidate, NOTE_MAX, NOTE_MIN, SectionId } from '@rni/shared';
import { DEFAULT_FORMULAIRE_CONFIG } from '../../core/formulaire/formulaire-config.service';
import { nameValidator, phoneValidator } from '../../shared/forms/validators';

export type FormulaireGroup = FormGroup<Record<string, FormControl>>;

const DEFAULT_CHAMPS = DEFAULT_FORMULAIRE_CONFIG.champs;

/** Construit le formulaire réactif à partir de la structure paramétrée en base (§6.2). */
export function buildFormulaireForm(champs: readonly FormulaireChampDto[] = DEFAULT_CHAMPS): FormulaireGroup {
  const group: FormulaireGroup = new FormGroup<Record<string, FormControl>>({}, { validators: nameValidator });
  for (const def of champs) {
    const validators = [];
    if (def.required && def.kind !== 'address') validators.push(Validators.required);
    if (def.kind === 'phone') validators.push(phoneValidator);
    if (def.kind === 'note') validators.push(Validators.min(NOTE_MIN), Validators.max(NOTE_MAX), Validators.pattern(/^\d+$/));
    group.addControl(def.key, new FormControl(defaultValue(def), validators));
  }
  return group;
}

export function defaultValue(def: Pick<FormulaireChampDto, 'kind'>): string | number {
  return def.kind === 'note' ? 0 : def.kind === 'select' ? CRISE_PAR_DEFAUT : '';
}

export function fieldsOf(section: SectionId, champs: readonly FormulaireChampDto[] = DEFAULT_CHAMPS): FormulaireChampDto[] {
  return champs.filter((f) => f.section === section).sort((a, b) => a.ordre - b.ordre);
}

/** Valeurs à injecter dans le formulaire depuis une fiche. */
export function toFormValue(f: FormulaireDto, champs: readonly FormulaireChampDto[] = DEFAULT_CHAMPS): Record<string, unknown> {
  return Object.fromEntries(champs.map((d) => [d.key, f[d.key] ?? defaultValue(d)]));
}

/** Corps envoyé à l'API (notes numériques, adresse et coordonnées issues du géocodeur). */
export function toPayload(value: Record<string, unknown>, address: GeocodeCandidate | null, champs: readonly FormulaireChampDto[] = DEFAULT_CHAMPS): Record<string, unknown> {
  return {
    ...value,
    ...Object.fromEntries(champs.filter((d) => d.kind === 'note').map((d) => [d.key, Number(value[d.key] || 0)])),
    terrain_adresse: address?.address ?? null,
    terrain_x: address?.x ?? null,
    terrain_y: address?.y ?? null,
  };
}

/** Adresse enregistrée d'une fiche, sous forme de candidat géocodé. */
export function addressOf(f: FormulaireDto): GeocodeCandidate | null {
  const text = f['terrain_adresse'] as string | null;
  return text && f['terrain_x'] != null && f['terrain_y'] != null ? { address: text, x: Number(f['terrain_x']), y: Number(f['terrain_y']), score: 100 } : null;
}
