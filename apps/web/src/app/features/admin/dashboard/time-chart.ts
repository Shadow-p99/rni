import { Component, ElementRef, OnDestroy, afterNextRender, computed, inject, input, signal } from '@angular/core';

export interface ChartPoint {
  /** Libellé de l'abscisse (ex. « 14:00 »). */
  label: string;
  value: number | null;
  /** Lignes de l'infobulle (« Requêtes : 1 284 »…). */
  details: string[];
}

const H = 180;
const PAD = { top: 12, right: 8, bottom: 22, left: 44 };

/** Graduation « ronde » : 1, 2, 2,5 ou 5 × 10^k, 4 intervalles environ. */
export function niceScale(max: number): { top: number; step: number } {
  if (!(max > 0)) return { top: 1, step: 0.25 };
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return { top: Math.ceil(max / step) * step, step };
}

/**
 * Série temporelle unique (colonnes ou ligne) en SVG : marques fines, grille discrète, infobulle au
 * survol de toute la bande (cible plus large que la marque). Une seule série par graphique, donc
 * pas de légende : le titre nomme la mesure.
 */
@Component({
  selector: 'rni-time-chart',
  host: { class: 'relative block select-none' },
  template: `
    <svg [attr.width]="width()" [attr.height]="h" role="img" [attr.aria-label]="ariaLabel()" class="block overflow-visible">
      <!-- grille et graduations -->
      @for (t of ticks(); track t.v) {
        <line [attr.x1]="pad.left" [attr.x2]="width() - pad.right" [attr.y1]="t.y" [attr.y2]="t.y" class="stroke-slate-200" stroke-width="1" />
        <text [attr.x]="pad.left - 6" [attr.y]="t.y + 3" text-anchor="end" class="fill-slate-500 text-[10px] tabular-nums">{{ t.label }}</text>
      }
      @for (p of geometry(); track $index) {
        @if (p.showLabel) {
          <text [attr.x]="p.cx" [attr.y]="h - 6" text-anchor="middle" class="fill-slate-500 text-[10px] tabular-nums">{{ p.label }}</text>
        }
      }
      @if (kind() === 'columns') {
        @for (p of geometry(); track $index) {
          @if (p.value) {
            <path [attr.d]="p.bar" [attr.fill]="color()" [attr.opacity]="hover() === null || hover() === $index ? 1 : 0.55" />
          }
        }
      } @else {
        @if (hover() !== null) {
          <line [attr.x1]="geometry()[hover()!].cx" [attr.x2]="geometry()[hover()!].cx" [attr.y1]="pad.top" [attr.y2]="h - pad.bottom" class="stroke-slate-300" stroke-width="1" />
        }
        <path [attr.d]="linePath()" fill="none" [attr.stroke]="color()" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        @for (p of geometry(); track $index) {
          @if (p.value != null && (hover() === $index || $last)) {
            <circle [attr.cx]="p.cx" [attr.cy]="p.y" r="4" [attr.fill]="color()" stroke="white" stroke-width="2" />
          }
        }
      }
      <!-- cibles de survol : toute la bande -->
      @for (p of geometry(); track $index) {
        <rect [attr.x]="p.x0" [attr.y]="pad.top" [attr.width]="p.band" [attr.height]="h - pad.top - pad.bottom" fill="transparent" (pointerenter)="hover.set($index)" (pointerleave)="hover.set(null)" />
      }
    </svg>
    @if (hover() !== null) {
      @let p = geometry()[hover()!];
      <div
        class="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md"
        [style.left.px]="tooltipLeft(p.cx)"
        [style.top.px]="0"
        role="status"
      >
        <div class="mb-0.5 font-semibold text-slate-800">{{ p.label }}</div>
        @for (d of points()[hover()!].details; track d) {
          <div class="tabular-nums text-slate-600">{{ d }}</div>
        }
      </div>
    }
  `,
})
export class TimeChart implements OnDestroy {
  readonly points = input.required<ChartPoint[]>();
  readonly kind = input<'columns' | 'line'>('columns');
  readonly color = input('#2546a8');
  readonly ariaLabel = input('');
  /** Mise en forme des graduations (ms, nombres…). */
  readonly format = input<(v: number) => string>((v) => String(v));
  /** Une étiquette d'abscisse toutes les N valeurs. */
  readonly labelEvery = input(3);

  protected readonly h = H;
  protected readonly pad = PAD;
  protected readonly hover = signal<number | null>(null);
  protected readonly width = signal(640);
  private readonly host = inject(ElementRef<HTMLElement>);
  private observer: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      const el = this.host.nativeElement as HTMLElement;
      this.width.set(Math.max(240, el.clientWidth));
      if (typeof ResizeObserver === 'undefined') return;
      this.observer = new ResizeObserver(([e]) => this.width.set(Math.max(240, Math.floor(e.contentRect.width))));
      this.observer.observe(el);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private readonly scale = computed(() => niceScale(Math.max(0, ...this.points().map((p) => p.value ?? 0))));

  protected readonly ticks = computed(() => {
    const { top, step } = this.scale();
    const out: { v: number; y: number; label: string }[] = [];
    for (let v = 0; v <= top + step / 2; v += step) out.push({ v, y: this.y(v), label: this.format()(v) });
    return out;
  });

  private y(v: number): number {
    return PAD.top + (1 - v / this.scale().top) * (H - PAD.top - PAD.bottom);
  }

  protected readonly geometry = computed(() => {
    const pts = this.points();
    const inner = this.width() - PAD.left - PAD.right;
    const band = inner / Math.max(1, pts.length);
    const bw = Math.min(24, Math.max(2, band - 2)); // ≤ 24 px, 2 px d'air entre colonnes
    const base = this.y(0);
    return pts.map((p, i) => {
      const x0 = PAD.left + i * band;
      const cx = x0 + band / 2;
      const y = p.value == null ? base : this.y(p.value);
      const r = Math.min(4, bw / 2, base - y);
      const left = cx - bw / 2;
      // Colonne : coins arrondis (4 px) côté valeur, carrés à la base
      const bar = `M${left},${base} V${y + r} Q${left},${y} ${left + r},${y} H${left + bw - r} Q${left + bw},${y} ${left + bw},${y + r} V${base} Z`;
      return { label: p.label, value: p.value, x0, band, cx, y, bar, showLabel: i % this.labelEvery() === 0 };
    });
  });

  protected readonly linePath = computed(() => {
    let d = '';
    let pen = false;
    for (const p of this.geometry()) {
      if (p.value == null) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${p.cx},${p.y} `;
      pen = true;
    }
    return d.trim();
  });

  protected tooltipLeft(cx: number): number {
    // À gauche du curseur dans la moitié droite, à droite sinon (ne masque pas la colonne survolée)
    return cx > this.width() / 2 ? Math.max(0, cx - 200) : cx + 12;
  }
}
