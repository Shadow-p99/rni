import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { BaseLayerDto, IsochroneCollection, PersonnelPointProperties, Profil } from '@rni/shared';
import { firstValueFrom } from 'rxjs';
import { GeoApi } from '../../core/api/geo.api';
import { PlanningApi } from '../../core/api/planning.api';
import { AuthService } from '../../core/auth/auth.service';
import { AppError, toAppError } from '../../core/errors/app-error';
import { ToastService } from '../../core/notifications/toast.service';
import { ReferentielService } from '../../core/referentiel/referentiel.service';
import { AsyncState } from '../../core/state/async-state';

/** Point affiché : propriétés de l'agent + coordonnées [lng, lat]. */
export interface PersonPoint extends PersonnelPointProperties {
  coords: [number, number];
}

export interface Crise {
  lat: number;
  lng: number;
  label: string;
}

export interface MapView {
  lat: number;
  lng: number;
  zoom: number;
}

export const OSM_LAYER: BaseLayerDto = {
  id: 'osm',
  label: 'OpenStreetMap',
  type: 'xyz',
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© contributeurs OpenStreetMap',
  maxZoom: 19,
  visible: true,
};

const FRANCE: MapView = { lat: 46.4547, lng: 2.2529, zoom: 6 };
const REFRESH_MS = 60_000;

/** État de la carte opérationnelle (§4) : points, filtres, fiche, fonds, crise et isochrones. */
@Injectable()
export class CarteStore {
  private readonly planning = inject(PlanningApi);
  private readonly geo = inject(GeoApi);
  private readonly auth = inject(AuthService);
  private readonly ref = inject(ReferentielService);
  private readonly toasts = inject(ToastService);

  readonly points = new AsyncState<PersonPoint[]>([]);
  readonly lastUpdate = signal<Date | null>(null);
  /** Échec d'une actualisation automatique alors que des points sont déjà affichés. */
  readonly staleError = signal<AppError | null>(null);
  readonly filters = signal<Set<number>>(new Set([1, 2, 3, 4, 5]));
  readonly visible = computed(() => this.points.data().filter((p) => this.filters().has(p.id_pos_service)));

  readonly baseLayers = signal<BaseLayerDto[]>([OSM_LAYER]);
  readonly activeLayer = signal('osm');

  /** Fiche : personnes au même endroit + index courant (BR-CAR-4). */
  readonly selection = signal<PersonnelPointProperties[]>([]);
  readonly selIndex = signal(0);
  readonly selected = computed(() => this.selection()[this.selIndex()] ?? null);

  readonly crise = signal<Crise | null>(null);
  readonly placingCrise = signal(false);
  readonly isochrones = new AsyncState<IsochroneCollection | null>(null);
  readonly isoVisible = signal(true);
  /** Point de crise et isochrones : droit `carte.isochrone`. */
  readonly canCrise = this.auth.canIsochrone;

  /**
   * Cadrage initial : sur sa région dès que le périmètre « carte » du profil n'est pas national
   * (par défaut : tous les profils sauf GIGN et lecture seule), sinon la France entière.
   */
  readonly initialView = computed<MapView>(() => {
    const u = this.auth.user();
    if (u && u.perimetres.carte != null) {
      const c = this.ref.regionCenter(u.id_region);
      if (c) return { lat: c.lat, lng: c.lng, zoom: c.zoom };
    }
    return FRANCE;
  });

  constructor() {
    // Actualisation périodique (« temps réel »), suspendue quand l'onglet est masqué.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.refresh();
    }, REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  init(): void {
    void this.loadBaseLayers();
    void this.refresh();
  }

  /** BR-CAR-1 : fonds de la Facade ; repli OSM si le service ne répond pas. */
  private async loadBaseLayers(): Promise<void> {
    try {
      const layers = await firstValueFrom(this.geo.baseLayers({ silent: true }));
      if (layers.length) {
        this.baseLayers.set(layers);
        this.activeLayer.set((layers.find((l) => l.visible) ?? layers[0]).id);
      }
    } catch {
      this.toasts.warning('Fonds cartographiques indisponibles', 'Affichage du fond OpenStreetMap par défaut.');
    }
  }

  private async fetchPoints(): Promise<PersonPoint[]> {
    const fc = await firstValueFrom(this.planning.geojson({ silent: true }));
    return fc.features.map((f) => ({ ...f.properties, coords: f.geometry.coordinates }));
  }

  /**
   * Recharge les points. Premier chargement : erreur affichée avec « Réessayer ».
   * Actualisation (manuelle ou automatique) : en cas d'échec, les points déjà affichés sont conservés
   * et un bandeau signale qu'ils ne sont plus à jour.
   */
  async refresh(): Promise<void> {
    if (this.points.loading()) return;
    let pts: PersonPoint[] | null;
    if (!this.points.data().length) {
      pts = await this.points.load(() => this.fetchPoints());
    } else {
      try {
        pts = await this.fetchPoints();
        this.points.set(pts);
      } catch (e) {
        // Bandeau « positions peut-être obsolètes » avec « Réessayer » ; les points restent affichés.
        this.staleError.set(toAppError(e));
        return;
      }
    }
    if (!pts) return;
    this.lastUpdate.set(new Date());
    this.staleError.set(null);
    // Actualise la fiche ouverte
    const sel = this.selection();
    if (sel.length) this.selection.set(sel.map((s) => pts.find((p) => p.id_user === s.id_user) ?? s));
  }

  setLayer(id: string): void {
    this.activeLayer.set(id);
  }

  /** Repli automatique sur OSM quand le fond choisi ne fournit plus de tuiles. */
  onLayerFailure(id: string): void {
    if (id === OSM_LAYER.id || this.activeLayer() !== id) return;
    const label = this.baseLayers().find((l) => l.id === id)?.label ?? id;
    if (!this.baseLayers().some((l) => l.id === OSM_LAYER.id)) this.baseLayers.update((l) => [OSM_LAYER, ...l]);
    this.activeLayer.set(OSM_LAYER.id);
    this.toasts.warning(`Fond « ${label} » indisponible`, 'Bascule sur OpenStreetMap.');
  }

  toggleFilter(id: number): void {
    const s = new Set(this.filters());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.filters.set(s);
  }

  toggleAllFilters(): void {
    const all = this.ref.positions().map((p) => p.id_pos_service);
    this.filters.set(this.filters().size === all.length ? new Set() : new Set(all));
  }

  select(list: PersonnelPointProperties[]): void {
    this.selection.set(list);
    this.selIndex.set(0);
  }

  closeSelection(): void {
    this.selection.set([]);
  }

  // --- Crise (BR-CAR-5..7) -------------------------------------------------------

  /** Pose (ou déplace) le point de crise et calcule les isochrones 30 / 60 / 90 min. */
  async setCrise(crise: Crise): Promise<void> {
    this.placingCrise.set(false);
    this.crise.set(crise);
    this.isoVisible.set(true);
    this.isochrones.reset();
    await this.isochrones.load(() => this.geo.isochrones(crise.lng, crise.lat, { silent: true }));
  }

  clearCrise(): void {
    this.crise.set(null);
    this.isochrones.reset();
  }
}
