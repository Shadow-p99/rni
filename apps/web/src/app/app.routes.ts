import { Routes } from '@angular/router';
import { desktopPlanningGuard, formulaireGuard, isAdminGuard, isUserGuard } from './core/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'carte' },
  {
    path: 'carte',
    title: 'Carte opérationnelle — RNI',
    canActivate: [isUserGuard],
    loadComponent: () => import('./pages/carte/carte-page').then((m) => m.CartePage),
  },
  {
    path: 'planning',
    title: 'Planning national — RNI',
    canActivate: [isUserGuard, desktopPlanningGuard],
    loadComponent: () => import('./pages/planning/planning-page').then((m) => m.PlanningPage),
  },
  {
    path: 'planning-mobile',
    title: 'Planning — RNI',
    canActivate: [isUserGuard],
    loadComponent: () => import('./pages/planning-mobile/planning-mobile-page').then((m) => m.PlanningMobilePage),
  },
  {
    path: 'formulaire',
    title: 'Fiches de crise — RNI',
    canActivate: [isUserGuard, formulaireGuard],
    loadComponent: () => import('./pages/formulaire/formulaire-list-page').then((m) => m.FormulaireListPage),
  },
  {
    path: 'formulaire/:id',
    title: 'Fiche de crise — RNI',
    canActivate: [isUserGuard, formulaireGuard],
    loadComponent: () => import('./pages/formulaire/formulaire-edit-page').then((m) => m.FormulaireEditPage),
  },
  {
    path: 'gestion',
    title: 'Gestion du personnel — RNI',
    canActivate: [isUserGuard, isAdminGuard],
    loadComponent: () => import('./pages/gestion/gestion-page').then((m) => m.GestionPage),
  },
  {
    path: 'testvie',
    title: 'Test de vie — RNI',
    loadComponent: () => import('./pages/alive/alive-page').then((m) => m.AlivePage),
  },
  {
    path: 'unauthorized',
    title: 'Accès refusé — RNI',
    loadComponent: () => import('./pages/unauthorized/unauthorized-page').then((m) => m.UnauthorizedPage),
  },
  { path: '**', redirectTo: 'carte' },
];
