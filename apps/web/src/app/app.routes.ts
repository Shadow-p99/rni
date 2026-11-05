import { Routes } from '@angular/router';
import { Droit } from '@rni/shared';
import { droitGuard, formulaireConfigResolver, homeRedirectGuard, isUserGuard, referentielResolver } from './core/auth/auth.guards';
import { unsavedChangesGuard } from './core/platform/unsaved-changes.guard';

export const routes: Routes = [
  {
    // Écrans métier : utilisateur habilité + référentiels chargés
    path: '',
    canActivate: [isUserGuard],
    resolve: { referentiel: referentielResolver },
    runGuardsAndResolvers: 'always',
    children: [
      // Racine : première page accessible au profil (carte, sinon planning, fiches…)
      { path: '', pathMatch: 'full', canActivate: [homeRedirectGuard], children: [] },
      {
        path: 'carte',
        title: 'Carte opérationnelle — RNI',
        canActivate: [droitGuard(Droit.CARTE_VOIR)],
        loadComponent: () => import('./features/carte/carte-page').then((m) => m.CartePage),
      },
      {
        // Une seule page : interface bureau ou mobile selon la largeur d'écran
        path: 'planning',
        title: 'Planning — RNI',
        canActivate: [droitGuard(Droit.PLANNING_VOIR)],
        loadComponent: () => import('./features/planning/planning-page').then((m) => m.PlanningPage),
      },
      // Ancienne adresse de la version mobile (favoris, liens partagés)
      { path: 'planning-mobile', redirectTo: 'planning' },
      {
        path: 'formulaire',
        title: 'Fiches de crise — RNI',
        canActivate: [droitGuard(Droit.FORMULAIRE_VOIR)],
        loadComponent: () => import('./features/formulaire/formulaire-list-page').then((m) => m.FormulaireListPage),
      },
      {
        path: 'formulaire/:id',
        title: 'Fiche de crise — RNI',
        canActivate: [droitGuard(Droit.FORMULAIRE_VOIR)],
        resolve: { structure: formulaireConfigResolver },
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./features/formulaire/formulaire-edit-page').then((m) => m.FormulaireEditPage),
      },
      {
        path: 'gestion',
        title: 'Gestion du personnel — RNI',
        canActivate: [droitGuard(Droit.GESTION_ACCES)],
        loadComponent: () => import('./features/gestion/gestion-page').then((m) => m.GestionPage),
      },
      {
        path: 'administration',
        canActivate: [droitGuard(Droit.ADMIN_ACCES)],
        loadComponent: () => import('./features/admin/admin-layout').then((m) => m.AdminLayout),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'tableau-de-bord' },
          {
            path: 'tableau-de-bord',
            title: 'Tableau de bord — Administration RNI',
            loadComponent: () => import('./features/admin/dashboard/dashboard-page').then((m) => m.DashboardPage),
          },
          {
            path: 'journal',
            title: 'Journal — Administration RNI',
            loadComponent: () => import('./features/admin/journal/journal-page').then((m) => m.JournalPage),
          },
          {
            path: 'journalisation',
            title: 'Réglages des journaux — Administration RNI',
            canDeactivate: [unsavedChangesGuard],
            loadComponent: () => import('./features/admin/log-settings/log-settings-page').then((m) => m.LogSettingsPage),
          },
          {
            path: 'droits',
            title: 'Droits — Administration RNI',
            canDeactivate: [unsavedChangesGuard],
            loadComponent: () => import('./features/admin/droits/droits-page').then((m) => m.DroitsPage),
          },
          {
            path: 'profils',
            title: 'Profils — Administration RNI',
            canDeactivate: [unsavedChangesGuard],
            loadComponent: () => import('./features/admin/profils/profils-page').then((m) => m.ProfilsPage),
          },
          {
            path: 'positions',
            title: 'Positions de service — Administration RNI',
            canDeactivate: [unsavedChangesGuard],
            loadComponent: () => import('./features/admin/positions/positions-page').then((m) => m.PositionsPage),
          },
          {
            path: 'fiche-de-crise',
            title: 'Fiche de crise — Administration RNI',
            canDeactivate: [unsavedChangesGuard],
            loadComponent: () => import('./features/admin/formulaire/formulaire-config-page').then((m) => m.FormulaireConfigPage),
          },
          {
            path: 'parametres',
            title: 'Paramètres — Administration RNI',
            canDeactivate: [unsavedChangesGuard],
            loadComponent: () => import('./features/admin/parametres/parametres-page').then((m) => m.ParametresPage),
          },
          {
            path: 'perimetres',
            title: 'Périmètres — Administration RNI',
            canDeactivate: [unsavedChangesGuard],
            loadComponent: () => import('./features/admin/perimetres-page').then((m) => m.PerimetresPage),
          },
        ],
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
