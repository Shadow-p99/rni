import { Component, computed, input } from '@angular/core';

export type TileTone = 'neutral' | 'good' | 'warning' | 'critical';

const ICON: Record<TileTone, string> = { neutral: '', good: '✓', warning: '!', critical: '✕' };
const TONE: Record<TileTone, string> = {
  neutral: '',
  good: 'bg-green-50 text-green-800',
  warning: 'bg-amber-50 text-amber-800',
  critical: 'bg-red-50 text-red-800',
};

/**
 * Indicateur chiffré : libellé, valeur, précision. L'état (bon / à surveiller / critique) est porté
 * par une pastille avec icône **et** texte : jamais par la seule couleur.
 */
@Component({
  selector: 'rni-stat-tile',
  host: { class: 'card flex min-w-0 flex-col gap-1 p-3' },
  template: `
    <div class="flex items-start justify-between gap-2">
      <span class="text-xs font-medium text-slate-500">{{ label() }}</span>
      @if (tone() !== 'neutral' && status()) {
        <span class="chip shrink-0 gap-1 px-1.5 py-0 text-[11px] font-medium" [class]="toneClass()">
          <span aria-hidden="true">{{ icon() }}</span>{{ status() }}
        </span>
      }
    </div>
    <span class="text-2xl font-semibold tabular-nums text-slate-900" [attr.data-testid]="testId()">{{ value() }}</span>
    @if (hint()) {
      <span class="line-clamp-2 text-xs text-slate-500" [title]="hint()">{{ hint() }}</span>
    }
  `,
})
export class StatTile {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly hint = input('');
  readonly tone = input<TileTone>('neutral');
  /** Texte de la pastille d'état (« Normal », « Élevé »…). */
  readonly status = input('');
  readonly testId = input<string | null>(null);

  protected readonly icon = computed(() => ICON[this.tone()]);
  protected readonly toneClass = computed(() => TONE[this.tone()]);
}
