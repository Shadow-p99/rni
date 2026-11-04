import { Component, inject } from '@angular/core';
import { ViewportService } from '../../core/platform/viewport.service';
import { PlanningDesktopView } from './desktop/planning-desktop-view';
import { PlanningMobileView } from './mobile/planning-mobile-view';

/**
 * Planning : une seule page, deux interfaces.
 * Sous 1038 px l'interface mobile (calendrier compact + liste du créneau), sinon l'interface
 * bureau (grille mensuelle par région). La bascule suit la largeur de l'écran en direct.
 */
@Component({
  selector: 'rni-planning-page',
  imports: [PlanningDesktopView, PlanningMobileView],
  host: { class: 'flex flex-1 flex-col' },
  template: `
    @if (viewport.mobile()) {
      <rni-planning-mobile-view />
    } @else {
      <rni-planning-desktop-view class="flex flex-1 flex-col" />
    }
  `,
})
export class PlanningPage {
  protected readonly viewport = inject(ViewportService);
}
