import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { ConfirmService } from '../../shared/ui/confirm';

/** Composant pouvant contenir une saisie non enregistrée. */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/** Demande confirmation avant de quitter une page avec une saisie non enregistrée. */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) =>
  !component?.hasUnsavedChanges()
    ? true
    : inject(ConfirmService).ask('Modifications non enregistrées', 'Vos modifications seront perdues. Quitter la page ?', {
        confirmLabel: 'Quitter sans enregistrer',
        danger: true,
      });
