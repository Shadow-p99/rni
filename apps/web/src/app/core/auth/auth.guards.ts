import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, ResolveFn, Router } from '@angular/router';
import { ReferentielService } from '../referentiel/referentiel.service';
import { AuthService } from './auth.service';

export const MOBILE_BREAKPOINT = 1038;

/** Utilisateur habilité ; API indisponible → page dédiée (avec retour), jamais « non autorisé ». */
export const isUserGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const status = await auth.load();
  if (status === 'authenticated') return true;
  if (status === 'unavailable') return new RedirectCommand(router.parseUrl(`/indisponible?retour=${encodeURIComponent(state.url)}`));
  return router.parseUrl('/unauthorized');
};

/** BR-AUTH-5 : page /gestion réservée aux profils 1, 3, 7. */
export const isAdminGuard: CanActivateFn = () => (inject(AuthService).isAdmin() ? true : inject(Router).parseUrl('/unauthorized'));

/** BR-FOR-1 : profils 2, 5, 6 renvoyés vers /unauthorized. */
export const formulaireGuard: CanActivateFn = () => (inject(AuthService).canFormulaire() ? true : inject(Router).parseUrl('/unauthorized'));

/** Déclinaison mobile : sous 1038 px, le planning bascule sur /planning-mobile. */
export const desktopPlanningGuard: CanActivateFn = () =>
  typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT ? inject(Router).parseUrl('/planning-mobile') : true;

/** Référentiels indispensables (positions, couleurs, régions) chargés avant l'affichage des écrans. */
export const referentielResolver: ResolveFn<boolean> = async (_route, state) => {
  const ok = await inject(ReferentielService).load();
  if (!ok) {
    const router = inject(Router);
    return new RedirectCommand(router.parseUrl(`/indisponible?retour=${encodeURIComponent(state.url)}`)) as unknown as boolean;
  }
  return true;
};
