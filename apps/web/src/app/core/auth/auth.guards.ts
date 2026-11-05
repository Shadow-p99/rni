import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, ResolveFn, Router } from '@angular/router';
import type { DroitCode } from '@rni/shared';
import { FormulaireConfigService } from '../formulaire/formulaire-config.service';
import { ReferentielService } from '../referentiel/referentiel.service';
import { AuthService } from './auth.service';

/** Utilisateur habilité ; API indisponible → page dédiée (avec retour), jamais « non autorisé ». */
export const isUserGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const status = await auth.load();
  if (status === 'authenticated') return true;
  if (status === 'unavailable') return new RedirectCommand(router.parseUrl(`/indisponible?retour=${encodeURIComponent(state.url)}`));
  return router.parseUrl('/unauthorized');
};

/** Page réservée à un droit du profil (Administration › Droits), sinon /unauthorized. */
export const droitGuard =
  (code: DroitCode): CanActivateFn =>
  () =>
    inject(AuthService).can(code) ? true : inject(Router).parseUrl('/unauthorized');

/** Racine : première page accessible au profil. */
export const homeRedirectGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return inject(Router).parseUrl(auth.homePath() ?? '/unauthorized');
};

/** Référentiels indispensables (positions, couleurs, régions) chargés avant l'affichage des écrans. */
export const referentielResolver: ResolveFn<boolean> = async (_route, state) => {
  const ok = await inject(ReferentielService).load();
  if (!ok) {
    const router = inject(Router);
    return new RedirectCommand(router.parseUrl(`/indisponible?retour=${encodeURIComponent(state.url)}`)) as unknown as boolean;
  }
  return true;
};

/** Structure paramétrée de la fiche de crise, relue à chaque entrée (repli : structure livrée). */
export const formulaireConfigResolver: ResolveFn<boolean> = async () => {
  await inject(FormulaireConfigService).load();
  return true;
};
