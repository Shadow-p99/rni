import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { localDateIso } from '@rni/shared';
import { ExportService } from '../../core/export/export.service';
import { ToastService } from '../../core/notifications/toast.service';
import { AsyncView } from '../../shared/ui/async-view';
import { ErrorPanel } from '../../shared/ui/error-panel';
import { PositionLegend } from '../../shared/ui/position-legend';
import { CarteStore } from './carte.store';
import { CrisePanel } from './components/crise-panel';
import { FiltersPanel } from './components/filters-panel';
import { LayersPanel } from './components/layers-panel';
import { CartePanel, MapToolbar } from './components/map-toolbar';
import { MapViewComponent } from './components/map-view';
import { PersonnelCard } from './components/personnel-card';

/** Module Carte opérationnelle (§4) : orchestration de la carte, des panneaux et de la fiche. */
@Component({
  selector: 'rni-carte-page',
  imports: [MapViewComponent, MapToolbar, FiltersPanel, LayersPanel, CrisePanel, PersonnelCard, PositionLegend, AsyncView, ErrorPanel],
  providers: [CarteStore],
  template: `
    <div #wrapper class="relative flex-1" style="min-height: calc(100vh - 3.5rem)">
      <rni-map-view
        [view]="store.initialView()"
        [baseLayers]="store.baseLayers()"
        [activeLayer]="store.activeLayer()"
        [points]="store.visible()"
        [crise]="store.crise()"
        [isochrones]="store.isochrones.data()"
        [isoVisible]="store.isoVisible()"
        [placing]="store.placingCrise()"
        (peopleSelect)="store.select($event)"
        (mapClick)="onMapClick($event)"
        (layerFailure)="store.onLayerFailure($event)"
        (renderError)="toasts.error('Affichage impossible', $event)"
      />

      <div class="absolute top-3 left-3 z-[900] flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2 [&>*:not(rni-map-toolbar)]:w-[min(92vw,360px)]">
        <rni-map-toolbar
          class="w-max max-w-[calc(100vw-1.5rem)]"
          [(panel)]="panel"
          [visibleCount]="store.visible().length"
          [totalCount]="store.points.data().length"
          [canCrise]="store.canCrise()"
          [lastUpdate]="store.lastUpdate()"
          [refreshing]="store.points.loading()"
          [exporting]="exporter.busy()"
          [stale]="!!store.staleError()"
          (refresh)="store.refresh()"
          (exportPng)="exportPng()"
        />
        @if (store.points.error(); as e) {
          <div class="card no-print shadow-lg" data-html2canvas-ignore>
            <rni-async-view [error]="e" (retry)="store.refresh()" />
          </div>
        } @else if (store.staleError(); as e) {
          <rni-error-panel class="no-print shadow" data-html2canvas-ignore [error]="e" [retryable]="true" (retry)="store.refresh()" />
        }
        @if (panel()) {
          <div class="card no-print p-3 text-sm shadow-lg" data-html2canvas-ignore>
            @switch (panel()) {
              @case ('filtres') {
                <rni-filters-panel [value]="store.filters()" (positionToggle)="store.toggleFilter($event)" (toggleAll)="store.toggleAllFilters()" />
              }
              @case ('fonds') {
                <rni-layers-panel [layers]="store.baseLayers()" [active]="store.activeLayer()" (layerSelect)="store.setLayer($event)" />
              }
              @case ('crise') {
                <rni-crise-panel
                  [crise]="store.crise()"
                  [placing]="store.placingCrise()"
                  [isoVisible]="store.isoVisible()"
                  [isoLoading]="store.isochrones.loading()"
                  [hasIso]="!!store.isochrones.data()"
                  [isoError]="store.isochrones.error()"
                  (locate)="store.setCrise($event)"
                  (placeByClick)="startPlacing()"
                  (toggleIso)="store.isoVisible.set(!store.isoVisible())"
                  (retryIso)="store.isochrones.reload()"
                  (clear)="store.clearCrise()"
                />
              }
            }
          </div>
        }
      </div>

      @if (store.placingCrise()) {
        <div class="no-print absolute top-3 left-1/2 z-[950] -translate-x-1/2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow" data-html2canvas-ignore role="status">
          Cliquez sur la carte pour placer la crise
          <button type="button" class="ml-2 underline" (click)="store.placingCrise.set(false)">Annuler</button>
        </div>
      }

      <div class="card absolute bottom-14 left-3 z-[800] hidden p-2 shadow sm:block">
        <rni-position-legend [vertical]="true">
          <span class="flex items-center gap-2"><span class="inline-block size-3 rounded-full border border-dashed border-slate-900"></span>Localisé via NEO</span>
          @if (store.crise()) {
            <span class="flex items-center gap-2"><span class="inline-block size-3 rounded-full bg-red-600"></span>Point de crise</span>
            <span class="flex items-center gap-2"><span class="inline-block h-3 w-5 rounded-sm border border-blue-700 bg-blue-500/20"></span>Isochrones</span>
          }
        </rni-position-legend>
      </div>

      @if (store.selection().length) {
        <rni-personnel-card
          class="absolute top-3 right-3 z-[950] max-h-[calc(100%-3rem)] w-[min(92vw,360px)]"
          [people]="store.selection()"
          [(index)]="store.selIndex"
          [coordsOf]="coordsOf"
          (closed)="store.closeSelection()"
        />
      }
    </div>
  `,
})
export class CartePage {
  protected readonly store = inject(CarteStore);
  protected readonly exporter = inject(ExportService);
  protected readonly toasts = inject(ToastService);
  private readonly wrapper = viewChild.required<ElementRef<HTMLElement>>('wrapper');
  protected readonly panel = signal<CartePanel | null>(null);
  private readonly coords = computed(() => new Map(this.store.points.data().map((p) => [p.id_user, p.coords])));
  protected readonly coordsOf = (id: number) => this.coords().get(id) ?? null;

  constructor() {
    this.store.init();
  }

  startPlacing(): void {
    this.store.placingCrise.set(true);
    this.toasts.info('Placement du point de crise', 'Cliquez sur la carte pour positionner la crise.');
  }

  onMapClick(e: { lat: number; lng: number }): void {
    if (this.store.placingCrise()) void this.store.setCrise({ ...e, label: `Point ${e.lat.toFixed(5)}, ${e.lng.toFixed(5)}` });
  }

  exportPng(): void {
    void this.exporter.png(this.wrapper().nativeElement, `carte_rni_${localDateIso(new Date())}.png`);
  }
}
