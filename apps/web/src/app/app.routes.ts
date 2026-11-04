import { Routes } from '@angular/router';
import { formulaireGuard, isAdminGuard, isUserGuard, referentielResolver } from './core/auth/auth.guards';
import { unsavedChangesGuard } from './core/platform/unsaved-changes.guard';

export const routes: Routes = [
  {
    // Écrans métier : utilisateur habilité + référentiels chargés
    path: '',
    canActivate: [isUserGuard],
    resolve: { referentiel: referentielResolver },
    runGuardsAndResolvers: 'always',
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'carte' },
      {
        path: 'carte',
        title: 'Carte opérationnelle — RNI',
        loadComponent: () => import('./features/carte/carte-page').then((m) => m.CartePage),
      },
      {
        // Une seule page : interface bureau ou mobile selon la largeur d'écran
        path: 'planning',
        title: 'Planning — RNI',
        loadComponent: () => import('./features/planning/planning-page').then((m) => m.PlanningPage),
      },
      // Ancienne adresse de la version mobile (favoris, liens partagés)
      { path: 'planning-mobile', redirectTo: 'planning' },
      {
        path: 'formulaire',
        title: 'Fiches de crise — RNI',
        canActivate: [formulaireGuard],
        loadComponent: () => import('./features/formulaire/formulaire-list-page').then((m) => m.FormulaireListPage),
      },
      {
        path: 'formulaire/:id',
        title: 'Fiche de crise — RNI',
        canActivate: [formulaireGuard],
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./features/formulaire/formulaire-edit-page').then((m) => m.FormulaireEditPage),
      },
      {
        path: 'gestion',
        title: 'Gestion du personnel — RNI',
        canActivate: [isAdminGuard],
        loadComponent: () => import('./features/gestion/gestion-page').then((m) => m.GestionPage),
      },
    ],
  },
  {
    path: 'testvie',
    title: 'Test de vie — RNI',
    loadComponent: () => import('./features/system/alive-page').then((m) => m.AlivePage),
  },
  {
    path: 'unauthorized',
    title: 'Accès refusé — RNI',
    loadComponent: () => import('./features/system/unauthorized-page').then((m) => m.UnauthorizedPage),
  },
  {
    path: 'indisponible',
    title: 'Service indisponible — RNI',
    loadComponent: () => import('./features/system/unavailable-page').then((m) => m.UnavailablePage),
  },
  {
    path: '**',
    title: 'Page introuvable — RNI',
    loadComponent: () => import('./features/system/not-found-page').then((m) => m.NotFoundPage),
  },
];
