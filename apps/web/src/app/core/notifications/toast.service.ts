import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'info' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  action?: ToastAction;
  /** Clé de dédoublonnage : un même message n'est pas empilé plusieurs fois. */
  key: string;
}

export interface ToastOptions {
  action?: ToastAction;
  durationMs?: number;
  /** 0 = notification persistante (fermeture manuelle). */
  sticky?: boolean;
}

/** Notifications en haut à droite. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  show(kind: ToastKind, title: string, message?: string, opts: ToastOptions = {}): void {
    const key = `${kind}|${title}|${message ?? ''}`;
    if (this.toasts().some((t) => t.key === key)) return;
    const id = ++this.seq;
    this.toasts.update((t) => [...t, { id, kind, title, message, action: opts.action, key }].slice(-5));
    if (!opts.sticky) setTimeout(() => this.dismiss(id), opts.durationMs ?? (kind === 'error' ? 8000 : 4500));
  }

  success(title: string, message?: string): void {
    this.show('success', title, message);
  }
  info(title: string, message?: string): void {
    this.show('info', title, message);
  }
  warning(title: string, message?: string): void {
    this.show('warning', title, message);
  }
  error(title: string, message?: string, opts?: ToastOptions): void {
    this.show('error', title, message, opts);
  }

  dismiss(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}
