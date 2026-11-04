import { Component, computed, input } from '@angular/core';
import type { AppLogLevel } from '@rni/shared';

const STYLE: Record<AppLogLevel, { label: string; cls: string }> = {
  fatal: { label: 'FATAL', cls: 'bg-red-700 text-white' },
  error: { label: 'ERREUR', cls: 'bg-red-50 text-red-800 ring-1 ring-red-200' },
  warn: { label: 'ALERTE', cls: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' },
  log: { label: 'INFO', cls: 'bg-rni-100 text-rni-900' },
  debug: { label: 'DEBUG', cls: 'bg-slate-100 text-slate-600' },
  verbose: { label: 'DÉTAIL', cls: 'bg-slate-50 text-slate-500 ring-1 ring-slate-200' },
};

/** Niveau d'une ligne de journal : texte + couleur (jamais la couleur seule). */
@Component({
  selector: 'rni-log-level-badge',
  host: { class: 'inline-flex' },
  template: `<span class="inline-block w-14 rounded px-1 py-px text-center text-[10px] font-semibold tracking-wide" [class]="style().cls">{{ style().label }}</span>`,
})
export class LogLevelBadge {
  readonly level = input.required<AppLogLevel>();
  protected readonly style = computed(() => STYLE[this.level()] ?? STYLE.log);
}

export const LOG_LEVEL_OPTIONS: { value: AppLogLevel; label: string }[] = [
  { value: 'error', label: 'Erreurs' },
  { value: 'warn', label: 'Alertes et erreurs' },
  { value: 'log', label: 'Infos et plus graves' },
  { value: 'debug', label: 'Tout (debug)' },
];
