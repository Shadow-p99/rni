import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { hasNameOrFirstName, isValidPhone } from '@rni/shared';

/** Téléphone FR (0X…) ou international (+ / 00) ; vide accepté (combiner avec `required`). */
export const phoneValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  !c.value || isValidPhone(String(c.value)) ? null : { phone: true };

/** BR-FOR-3 : au moins l'un de nom / prénom. */
export const nameValidator: ValidatorFn = (g: AbstractControl): ValidationErrors | null =>
  hasNameOrFirstName(g.get('nom')?.value, g.get('prenom')?.value) ? null : { name: true };
