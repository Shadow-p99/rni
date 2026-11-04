import { Injectable, computed, inject, signal } from '@angular/core';
import { LOG_CONTEXT_PATTERN, MAX_LOG_CONTEXTS, type LogContextLevel, type LogSettingsDto, type LogSettingsValues, type LogThreshold } from '@rni/shared';
import { AdminApi } from '../../../core/api/admin.api';
import { ToastService } from '../../../core/notifications/toast.service';
import { ActionState, AsyncState } from '../../../core/state/async-state';

export interface LogDraft extends LogSettingsValues {
  /** Validité des réglages verbeux (minutes) ; null = permanent. */
  duree_min: number | null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Le brouillon active-t-il un réglage verbeux (soumis à la durée de validité) ? */
export function isVerbose(d: Pick<LogDraft, 'level' | 'contexts' | 'sql'>): boolean {
  return !!d.level || d.contexts.length > 0 || d.sql;
}

/** Erreurs de saisie bloquantes (le serveur valide aussi). */
export function draftErrors(d: LogDraft): string[] {
  const out: string[] = [];
  const names = new Set<string>();
  d.contexts.forEach((c, i) => {
    const n = c.contexte.trim();
    if (!LOG_CONTEXT_PATTERN.test(n)) out.push(`Ligne ${i + 1} : nom de contexte invalide (lettres, chiffres, . _ -).`);
    else if (names.has(n)) out.push(`Ligne ${i + 1} : le contexte ${n} est déjà réglé.`);
    names.add(n);
  });
  if (d.contexts.length > MAX_LOG_CONTEXTS) out.push(`${MAX_LOG_CONTEXTS} contextes au plus.`);
  if (!Number.isInteger(d.slow_ms) || d.slow_ms < 50 || d.slow_ms > 600_000) out.push('Seuil de lenteur : entre 50 et 600 000 ms.');
  for (const [v, label] of [
    [d.retention_days, 'Conservation du journal'],
    [d.metrics_retention_days, 'Conservation des métriques'],
  ] as const) {
    if (!Number.isInteger(v) || v < 1 || v > 3650) out.push(`${label} : entre 1 et 3 650 jours.`);
  }
  return out;
}

/** Réglages de journalisation (super administrateur) : lecture, brouillon, enregistrement. */
@Injectable()
export class LogSettingsStore {
  private readonly api = inject(AdminApi);
  private readonly toasts = inject(ToastService);

  readonly data = new AsyncState<LogSettingsDto | null>(null);
  readonly save = new ActionState();
  readonly draft = signal<LogDraft | null>(null);

  /** Valeurs enregistrées sous forme de brouillon (référence pour « modifié »). */
  private readonly saved = computed<LogDraft | null>(() => {
    const d = this.data.data();
    if (!d) return null;
    const { expires_at, expire, ...values } = d.enregistre;
    const remaining = expires_at && !expire ? Math.round((new Date(expires_at).getTime() - Date.now()) / 60_000) : null;
    // Durée proposée : celle qui reste la plus proche, sinon permanent
    const duree = remaining == null ? null : ([15, 60, 240].find((m) => remaining <= m) ?? 240);
    return { ...values, contexts: values.contexts.map((c) => ({ ...c })), duree_min: isVerbose(values) ? duree : null };
  });

  readonly dirty = computed(() => {
    const d = this.draft();
    const s = this.saved();
    if (!d || !s) return false;
    const { duree_min: _a, ...dv } = d;
    const { duree_min: _b, ...sv } = s;
    return !same(dv, sv) || (isVerbose(d) && d.duree_min !== s.duree_min);
  });
  readonly errors = computed(() => (this.draft() ? draftErrors(this.draft()!) : []));

  async load(): Promise<void> {
    const v = await this.data.load(() => this.api.logSettings({ silent: true }));
    if (v) this.reset();
  }

  reset(): void {
    const s = this.saved();
    this.draft.set(s ? { ...s, contexts: s.contexts.map((c) => ({ ...c })) } : null);
    this.save.clear();
  }

  patch(p: Partial<LogDraft>): void {
    const d = this.draft();
    if (d) this.draft.set({ ...d, ...p });
  }

  addContext(contexte = '', niveau: LogThreshold = 'debug'): void {
    const d = this.draft();
    if (d) this.draft.set({ ...d, contexts: [...d.contexts, { contexte, niveau }] });
  }

  updateContext(i: number, p: Partial<LogContextLevel>): void {
    const d = this.draft();
    if (d) this.draft.set({ ...d, contexts: d.contexts.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  }

  removeContext(i: number): void {
    const d = this.draft();
    if (d) this.draft.set({ ...d, contexts: d.contexts.filter((_, j) => j !== i) });
  }

  async submit(): Promise<boolean> {
    const d = this.draft();
    if (!d || this.errors().length) return false;
    const dto = { ...d, contexts: d.contexts.map((c) => ({ contexte: c.contexte.trim(), niveau: c.niveau })), duree_min: isVerbose(d) ? d.duree_min : null };
    const r = await this.save.run(() => this.api.updateLogSettings(dto, { silent: true }));
    if (!r.ok) return false;
    this.data.set(r.value);
    this.reset();
    const until = r.value.enregistre.expires_at;
    this.toasts.success(
      'Réglages de journalisation enregistrés',
      `Appliqués à toutes les instances${until ? `, jusqu'à ${new Date(until).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}.`,
    );
    return true;
  }
}
