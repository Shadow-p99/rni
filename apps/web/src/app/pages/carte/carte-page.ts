import { DatePipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  BaseLayerDto,
  CLUSTER_COLOR_PRIORITY,
  GEOCODER_CRISE_MIN_CHARS,
  GeocodeCandidate,
  NO_PLANNING_COLOR,
  PersonnelPointProperties,
  PosService,
  Profil,
  dedupeNeo,
  localDateIso,
} from '@rni/shared';
import type * as Leaflet from 'leaflet';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { GeoApi, PlanningApi } from '../../core/data.service';
import { L } from '../../core/leaflet';
import { exportElementToPng } from '../../core/pdf';
import { tileUrl } from '../../core/tiles';
import { ReferentielService } from '../../core/referentiel.service';
import { ToastService } from '../../core/toast.service';
import { AddressAutocomplete } from '../../shared/address-autocomplete';

const FRANCE: Leaflet.LatLngExpression = [46.4547, 2.2529];
const REFRESH_MS = 60_000;

type Marker = Leaflet.Marker & { rni?: PersonnelPointProperties };

/** Module Carte opérationnelle (§4). */
@Component({
  selector: 'rni-carte-page',
  imports: [FormsModule, DatePipe, AddressAutocomplete],
  templateUrl: './carte-page.html',
})
export class CartePage implements AfterViewInit {
  protected readonly auth = inject(AuthService);
  protected readonly ref = inject(ReferentielService);
  private readonly planningApi = inject(PlanningApi);
  private readonly geo = inject(GeoApi);
  private readonly toasts = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('map');
  private readonly wrapperEl = viewChild.required<ElementRef<HTMLDivElement>>('wrapper');

  private map!: Leaflet.Map;
  private cluster!: Leaflet.MarkerClusterGroup;
  private tileLayers = new Map<string, Leaflet.TileLayer>();
  private criseMarker: Leaflet.Marker | null = null;
  private isoLayer: Leaflet.GeoJSON | null = null;

  protected readonly baseLayers = signal<BaseLayerDto[]>([]);
  protected readonly activeLayer = signal<string>('');
  protected readonly points = signal<PersonnelPointProperties[]>([]);
  protected readonly coords = new Map<number, [number, number]>();
  protected readonly lastUpdate = signal<Date | null>(null);
  protected readonly filters = signal<Set<number>>(new Set([1, 2, 3, 4, 5]));
  protected readonly panel = signal<'filtres' | 'fonds' | 'crise' | null>(null);

  /** Fiche affichée : liste des personnes au même endroit + index courant (BR-CAR-4). */
  protected readonly selection = signal<PersonnelPointProperties[]>([]);
  protected readonly selIndex = signal(0);
  protected readonly selected = computed(() => this.selection()[this.selIndex()] ?? null);

  protected readonly criseMode = signal(false);
  protected readonly crise = signal<{ lat: number; lng: number; label: string } | null>(null);
  protected readonly isoVisible = signal(true);
  protected readonly isoLoading = signal(false);
  protected criseText = '';
  protected readonly criseMinChars = GEOCODER_CRISE_MIN_CHARS;

  protected readonly canCrise = this.auth.hasExtendedRights;
  protected readonly visibleCount = computed(() => this.points().filter((p) => this.filters().has(p.id_pos_service)).length);

  async ngAfterViewInit(): Promise<void> {
    await this.ref.load();
    this.createMap();
    await Promise.all([this.loadBaseLayers(), this.refresh()]);
    const timer = setInterval(() => void this.refresh(), REFRESH_MS);
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      this.map?.remove();
    });
  }

  // ---------------------------------------------------------------------------
  // Carte et fonds
  // ---------------------------------------------------------------------------

  private createMap(): void {
    this.map = L.map(this.mapEl().nativeElement, { center: FRANCE, zoom: 6, minZoom: 3, maxZoom: 19, zoomControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(this.map);

    // Cadrage automatique sur la région pour les profils régionaux (≠ 1, 2)
    const u = this.auth.user();
    if (u && u.id_profil !== Profil.GIGN && u.id_profil !== Profil.LECTURE_SEULE) {
      const c = this.ref.regions().find((r) => r.id_region === u.id_region)?.center;
      if (c) this.map.setView([c.lat, c.lng], c.zoom);
    }

    this.cluster = L.markerClusterGroup({
      maxClusterRadius: 20,
      zoomToBoundsOnClick: false,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: false,
      iconCreateFunction: (c) => this.clusterIcon(c),
    });
    this.cluster.on('clusterclick', (e: Leaflet.LeafletEvent) => {
      const c = (e as unknown as { layer: Leaflet.MarkerCluster }).layer;
      if (this.map.getZoom() < 10) {
        c.zoomToBounds({ padding: [40, 40] });
      } else {
        this.openSelection(c.getAllChildMarkers().map((m) => (m as Marker).rni!).filter(Boolean));
      }
    });
    this.map.addLayer(this.cluster);

    this.map.on('click', (e: Leaflet.LeafletMouseEvent) => {
      if (this.criseMode()) {
        this.criseMode.set(false);
        void this.setCrise(e.latlng.lat, e.latlng.lng, `Point ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`);
      }
    });
  }

  /** BR-CAR-1 : fonds fournis par la Facade (WMTS / XYZ), OSM par défaut et en repli. */
  private async loadBaseLayers(): Promise<void> {
    let layers: BaseLayerDto[];
    try {
      layers = await firstValueFrom(this.geo.baseLayers());
    } catch {
      layers = [];
    }
    if (!layers.length) {
      layers = [{ id: 'osm', label: 'OpenStreetMap', type: 'xyz', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap', maxZoom: 19, visible: true }];
    }
    this.baseLayers.set(layers);
    for (const l of layers) {
      this.tileLayers.set(
        l.id,
        L.tileLayer(tileUrl(l), { attribution: l.attribution, maxZoom: l.maxZoom ?? 19, crossOrigin: 'anonymous' }),
      );
    }
    this.selectLayer((layers.find((l) => l.visible) ?? layers[0]).id);
  }

  selectLayer(id: string): void {
    for (const [lid, layer] of this.tileLayers) {
      if (lid === id) layer.addTo(this.map);
      else layer.remove();
    }
    this.activeLayer.set(id);
  }

  // ---------------------------------------------------------------------------
  // Points des personnels
  // ---------------------------------------------------------------------------

  async refresh(): Promise<void> {
    try {
      const fc = await firstValueFrom(this.planningApi.geojson());
      this.coords.clear();
      const props = fc.features.map((f) => {
        this.coords.set(f.properties.id_user, f.geometry.coordinates);
        return f.properties;
      });
      this.points.set(props);
      this.lastUpdate.set(new Date());
      this.redraw();
      // Actualise la fiche ouverte
      const sel = this.selection();
      if (sel.length) this.selection.set(sel.map((s) => props.find((p) => p.id_user === s.id_user) ?? s));
    } catch {
      /* notifié par l'intercepteur */
    }
  }

  private redraw(): void {
    this.cluster.clearLayers();
    const markers: Marker[] = [];
    for (const p of this.points()) {
      if (!this.filters().has(p.id_pos_service)) continue;
      const c = this.coords.get(p.id_user);
      if (!c) continue;
      const m: Marker = L.marker([c[1], c[0]], { icon: personIcon(p), title: `${p.grade ?? ''} ${p.prenom} ${p.nom}`.trim(), keyboard: true });
      m.rni = p;
      m.on('click', () => this.openSelection([p]));
      markers.push(m);
    }
    this.cluster.addLayers(markers);
  }

  /** BR-CAR-4 : couleur du cluster — priorité Alerte puis Disponible. */
  private clusterIcon(c: Leaflet.MarkerCluster): Leaflet.DivIcon {
    const children = c.getAllChildMarkers().map((m) => (m as Marker).rni!).filter(Boolean);
    let color = NO_PLANNING_COLOR;
    for (const pos of CLUSTER_COLOR_PRIORITY) {
      const hit = children.find((p) => p.id_planning && p.id_pos_service === pos);
      if (hit) {
        color = hit.color;
        break;
      }
    }
    if (color === NO_PLANNING_COLOR) color = children.find((p) => p.id_planning)?.color ?? NO_PLANNING_COLOR;
    const n = c.getChildCount();
    const size = n < 10 ? 34 : n < 50 ? 40 : 46;
    return L.divIcon({
      className: 'rni-cluster',
      iconSize: [size, size],
      html: `<div style="width:${size}px;height:${size}px;background:${color};box-shadow:0 0 0 4px ${color}55" class="flex items-center justify-center rounded-full border-2 border-white text-sm font-bold text-white">${n}</div>`,
    });
  }

  toggleFilter(id: number): void {
    const s = new Set(this.filters());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.filters.set(s);
    this.redraw();
  }

  toggleAll(): void {
    const all = this.ref.positions().map((p) => p.id_pos_service);
    this.filters.set(this.filters().size === all.length ? new Set() : new Set(all));
    this.redraw();
  }

  openSelection(list: PersonnelPointProperties[]): void {
    this.selection.set(list);
    this.selIndex.set(0);
  }

  closeSelection(): void {
    this.selection.set([]);
  }

  protected neo(p: PersonnelPointProperties) {
    return dedupeNeo(p.numero_neo_1, p.numero_neo_2);
  }

  protected coordsOf(p: PersonnelPointProperties): string {
    const c = this.coords.get(p.id_user);
    return c ? `${c[1].toFixed(5)}, ${c[0].toFixed(5)}` : '—';
  }

  protected tel(n: string | null): string {
    return (n ?? '').replace(/[^\d+]/g, '');
  }

  // ---------------------------------------------------------------------------
  // Gestion de crise (BR-CAR-5..7)
  // ---------------------------------------------------------------------------

  onCriseAddress(c: GeocodeCandidate | null): void {
    if (c) void this.setCrise(c.y, c.x, c.address);
  }

  startClickMode(): void {
    this.criseMode.set(true);
    this.toasts.info('Placement du point de crise', 'Cliquez sur la carte pour positionner la crise.');
  }

  async setCrise(lat: number, lng: number, label: string): Promise<void> {
    this.clearCrise();
    this.crise.set({ lat, lng, label });
    this.criseMarker = L.marker([lat, lng], { icon: criseIcon(), zIndexOffset: 1000, title: 'Point de crise' })
      .bindTooltip(label, { direction: 'top', offset: [0, -34] })
      .addTo(this.map);
    this.map.setView([lat, lng], 10);
    this.isoLoading.set(true);
    try {
      const fc = await firstValueFrom(this.geo.isochrones(lng, lat));
      const sorted = [...fc.features].sort((a, b) => b.properties.timebreak - a.properties.timebreak);
      this.isoLayer = L.geoJSON(sorted as unknown as GeoJSON.FeatureCollection, {
        interactive: false,
        style: () => ({ color: '#1d4ed8', weight: 1.5, fillColor: '#3b82f6', fillOpacity: 0.12 }),
      });
      this.isoVisible.set(true);
      this.isoLayer.addTo(this.map);
    } catch {
      /* notifié */
    } finally {
      this.isoLoading.set(false);
    }
  }

  toggleIso(): void {
    if (!this.isoLayer) return;
    if (this.isoVisible()) this.isoLayer.remove();
    else this.isoLayer.addTo(this.map);
    this.isoVisible.set(!this.isoVisible());
  }

  clearCrise(): void {
    this.criseMarker?.remove();
    this.isoLayer?.remove();
    this.criseMarker = null;
    this.isoLayer = null;
    this.crise.set(null);
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  async exportPng(): Promise<void> {
    try {
      await exportElementToPng(this.wrapperEl().nativeElement, `carte_rni_${localDateIso(new Date())}.png`);
    } catch {
      this.toasts.error('Export impossible', 'Le fond cartographique n’autorise pas la capture (CORS).');
    }
  }

  protected readonly PosService = PosService;
}

function personIcon(p: PersonnelPointProperties): Leaflet.DivIcon {
  const color = p.color;
  const ring = p.adresse_type === 'localisation' ? 'outline:2px dashed #0f172a;outline-offset:2px;' : '';
  const glyph = p.adresse_type === 'localisation' ? '📱' : p.adresse_type === 'temporaire' ? '•' : '';
  return L.divIcon({
    className: 'rni-marker rni-person',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div style="width:22px;height:22px;background:${color};${ring}" class="flex items-center justify-center rounded-full border-2 border-white text-[10px] text-white shadow">${glyph}</div>`,
  });
}

function criseIcon(): Leaflet.DivIcon {
  return L.divIcon({
    className: 'rni-marker',
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    html: `<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true"><path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.7 23.3 0 15 0z" fill="#dc2626" stroke="#fff" stroke-width="2"/><circle cx="15" cy="15" r="5.5" fill="#fff"/></svg>`,
  });
}
