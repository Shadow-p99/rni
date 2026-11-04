import { Component, DestroyRef, ElementRef, afterNextRender, effect, inject, input, output, untracked, viewChild } from '@angular/core';
import type { BaseLayerDto, IsochroneCollection, PersonnelPointProperties } from '@rni/shared';
import type * as Leaflet from 'leaflet';
import { L } from '../../../core/map/leaflet';
import { tileUrl } from '../../../core/map/tiles';
import type { Crise, MapView as View, PersonPoint } from '../carte.store';
import { clusterColor, clusterIcon, criseIcon, personIcon } from '../map-icons';

type Marker = Leaflet.Marker & { rni?: PersonnelPointProperties };

/** Nombre d'échecs de tuiles avant de considérer un fond comme indisponible. */
const TILE_FAILURE_THRESHOLD = 12;

/**
 * Carte Leaflet (présentation) : fonds, clusters de personnels (BR-CAR-4), point de crise et
 * isochrones. L'état vit dans `CarteStore` ; ce composant ne fait que le refléter.
 */
@Component({
  selector: 'rni-map-view',
  host: { class: 'absolute inset-0 z-0 block' },
  template: `<div #map class="h-full w-full" role="application" aria-label="Carte opérationnelle des négociateurs"></div>`,
})
export class MapViewComponent {
  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('map');
  private readonly destroyRef = inject(DestroyRef);

  readonly view = input.required<View>();
  readonly baseLayers = input.required<BaseLayerDto[]>();
  readonly activeLayer = input.required<string>();
  readonly points = input.required<PersonPoint[]>();
  readonly crise = input<Crise | null>(null);
  readonly isochrones = input<IsochroneCollection | null>(null);
  readonly isoVisible = input(true);
  /** Le prochain clic sur la carte place le point de crise. */
  readonly placing = input(false);

  readonly peopleSelect = output<PersonnelPointProperties[]>();
  readonly mapClick = output<{ lat: number; lng: number }>();
  /** Le fond indiqué ne fournit plus de tuiles. */
  readonly layerFailure = output<string>();
  /** Données géographiques inexploitables (ex. isochrones mal formées). */
  readonly renderError = output<string>();

  private map: Leaflet.Map | null = null;
  private cluster!: Leaflet.MarkerClusterGroup;
  private tiles = new Map<string, Leaflet.TileLayer>();
  private criseMarker: Leaflet.Marker | null = null;
  private isoLayer: Leaflet.GeoJSON | null = null;

  constructor() {
    effect(() => this.syncLayers(this.baseLayers(), this.activeLayer()));
    effect(() => this.syncPoints(this.points()));
    effect(() => this.syncCrise(this.crise()));
    effect(() => this.syncIsochrones(this.isochrones(), this.isoVisible()));
    effect(() => this.mapEl().nativeElement.classList.toggle('cursor-crosshair', this.placing()));
    // Création après le premier rendu complet : Leaflet mesure alors la taille définitive du conteneur.
    afterNextRender(() => this.createMap());
  }

  private createMap(): void {
    const v = untracked(() => this.view());
    const map = L.map(this.mapEl().nativeElement, { center: [v.lat, v.lng], zoom: v.zoom, minZoom: 3, maxZoom: 19, zoomControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

    this.cluster = L.markerClusterGroup({
      maxClusterRadius: 20,
      zoomToBoundsOnClick: false,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: false,
      iconCreateFunction: (c) => {
        const children = c.getAllChildMarkers().map((m) => (m as Marker).rni!).filter(Boolean);
        return clusterIcon(c.getChildCount(), clusterColor(children));
      },
    });
    // Clic sur un cluster : zoom si < 10, sinon fiche avec navigation entre les personnes
    this.cluster.on('clusterclick', (e: Leaflet.LeafletEvent) => {
      const c = (e as unknown as { layer: Leaflet.MarkerCluster }).layer;
      if (map.getZoom() < 10) c.zoomToBounds({ padding: [40, 40] });
      else this.peopleSelect.emit(c.getAllChildMarkers().map((m) => (m as Marker).rni!).filter(Boolean));
    });
    map.addLayer(this.cluster);
    map.on('click', (e: Leaflet.LeafletMouseEvent) => this.mapClick.emit({ lat: e.latlng.lat, lng: e.latlng.lng }));

    this.map = map;
    // La carte est créée après les premiers effets : on applique l'état courant.
    untracked(() => {
      this.syncLayers(this.baseLayers(), this.activeLayer());
      this.syncPoints(this.points());
      this.syncCrise(this.crise());
      this.syncIsochrones(this.isochrones(), this.isoVisible());
    });
    // Recalcul de la taille si le conteneur change (mise en page, rotation mobile…)
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    ro.observe(this.mapEl().nativeElement);
    this.destroyRef.onDestroy(() => {
      ro.disconnect();
      map.remove();
      this.map = null;
    });
  }

  /** Élément à capturer pour l'export PNG. */
  get element(): HTMLElement {
    return this.mapEl().nativeElement;
  }

  private syncLayers(layers: BaseLayerDto[], active: string): void {
    const map = this.map;
    if (!map) return;
    for (const l of layers) {
      if (this.tiles.has(l.id)) continue;
      const layer = L.tileLayer(tileUrl(l), { attribution: l.attribution, maxZoom: l.maxZoom ?? 19, crossOrigin: 'anonymous' });
      let failures = 0;
      layer.on('tileerror', () => {
        if (++failures === TILE_FAILURE_THRESHOLD) this.layerFailure.emit(l.id);
      });
      layer.on('tileload', () => (failures = 0));
      this.tiles.set(l.id, layer);
    }
    for (const [id, layer] of this.tiles) {
      if (id === active && !map.hasLayer(layer)) layer.addTo(map);
      if (id !== active && map.hasLayer(layer)) layer.remove();
    }
  }

  private syncPoints(points: PersonPoint[]): void {
    if (!this.map) return;
    this.cluster.clearLayers();
    this.cluster.addLayers(
      points.map((p) => {
        const m: Marker = L.marker([p.coords[1], p.coords[0]], { icon: personIcon(p), title: `${p.grade ?? ''} ${p.prenom} ${p.nom}`.trim(), keyboard: true });
        m.rni = p;
        m.on('click', () => this.peopleSelect.emit([p]));
        return m;
      }),
    );
  }

  private syncCrise(crise: Crise | null): void {
    const map = this.map;
    if (!map) return;
    this.criseMarker?.remove();
    this.criseMarker = null;
    if (!crise) return;
    this.criseMarker = L.marker([crise.lat, crise.lng], { icon: criseIcon(), zIndexOffset: 1000, title: 'Point de crise' })
      .bindTooltip(crise.label, { direction: 'top', offset: [0, -34] })
      .addTo(map);
    map.setView([crise.lat, crise.lng], 10);
  }

  private syncIsochrones(fc: IsochroneCollection | null, visible: boolean): void {
    const map = this.map;
    if (!map) return;
    this.isoLayer?.remove();
    this.isoLayer = null;
    if (!fc || !visible) return;
    const sorted = [...fc.features].sort((a, b) => b.properties.timebreak - a.properties.timebreak);
    try {
      this.isoLayer = L.geoJSON(sorted as unknown as GeoJSON.FeatureCollection, {
        interactive: false,
        style: () => ({ color: '#1d4ed8', weight: 1.5, fillColor: '#3b82f6', fillOpacity: 0.12 }),
      }).addTo(map);
    } catch (e) {
      // Géométrie invalide renvoyée par le service : on n'affiche rien plutôt que de casser la carte.
      console.error('[RNI] isochrones invalides', e);
      this.renderError.emit('Les isochrones reçues sont invalides et ne peuvent pas être affichées.');
    }
  }
}
