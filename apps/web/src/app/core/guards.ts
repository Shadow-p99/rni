import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const MOBILE_BREAKPOINT = 1038;

export const isUserGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return (await auth.load()) ? true : router.parseUrl('/unauthorized');
};

/** BR-AUTH-5 : page /gestion réservée aux profils 1, 3, 7. */
export const isAdminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.load();
  return auth.isAdmin() ? true : router.parseUrl('/unauthorized');
};

/** BR-FOR-1 : profils 2, 5, 6 renvoyés vers /unauthorized. */
export const formulaireGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.load();
  return auth.canFormulaire() ? true : router.parseUrl('/unauthorized');
};

/** Déclinaison mobile : sous 1038 px, le planning bascule sur /planning-mobile. */
export const desktopPlanningGuard: CanActivateFn = () => {
  const router = inject(Router);
  return typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT ? router.parseUrl('/planning-mobile') : true;
};
