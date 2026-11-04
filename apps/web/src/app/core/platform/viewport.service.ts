import { Injectable, signal } from '@angular/core';

/** Largeur sous laquelle l'interface mobile est utilisée (cf. §1.2). */
export const MOBILE_BREAKPOINT = 1038;

/** Suit la largeur de l'écran (bascule bureau / mobile, rotation de l'appareil). */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly query = typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`) : null;
  readonly mobile = signal(this.query?.matches ?? false);

  constructor() {
    // Service racine : l'écoute dure toute la vie de l'application.
    this.query?.addEventListener('change', (e) => this.mobile.set(e.matches));
  }
}
