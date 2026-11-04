import { FormControl, FormGroup, Validators } from '@angular/forms';
import { FORMULAIRE_FIELDS, FieldDef, FormulaireDto, GeocodeCandidate, NOTE_MAX, NOTE_MIN, SectionId } from '@rni/shared';
import { nameValidator, phoneValidator } from '../../shared/forms/validators';

export type FormulaireGroup = FormGroup<Record<string, FormControl>>;

/** Construit le formulaire réactif à partir du catalogue partagé (§6.2). */
export function buildFormulaireForm(): FormulaireGroup {
  const group: FormulaireGroup = new FormGroup<Record<string, FormControl>>({}, { validators: nameValidator });
  for (const def of FORMULAIRE_FIELDS) {
    const validators = [];
    if (def.required && def.kind !== 'address') validators.push(Validators.required);
    if (def.kind === 'phone') validators.push(phoneValidator);
    if (def.kind === 'note') validators.push(Validators.min(NOTE_MIN), Validators.max(NOTE_MAX), Validators.pattern(/^\d+$/));
    group.addControl(def.key, new FormControl(defaultValue(def), validators));
  }
  return group;
}

export function defaultValue(def: FieldDef): string | number {
  return def.kind === 'note' ? 0 : def.kind === 'select' ? 'Aucun' : '';
}

export function fieldsOf(section: SectionId): FieldDef[] {
  return FORMULAIRE_FIELDS.filter((f) => f.section === section);
}

/** Valeurs à injecter dans le formulaire depuis une fiche. */
export function toFormValue(f: FormulaireDto): Record<string, unknown> {
  return Object.fromEntries(FORMULAIRE_FIELDS.map((d) => [d.key, f[d.key] ?? defaultValue(d)]));
}

/** Corps envoyé à l'API (notes numériques, adresse et coordonnées issues du géocodeur). */
export function toPayload(value: Record<string, unknown>, address: GeocodeCandidate | null): Record<string, unknown> {
  return {
    ...value,
    ...Object.fromEntries(FORMULAIRE_FIELDS.filter((d) => d.kind === 'note').map((d) => [d.key, Number(value[d.key] || 0)])),
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
