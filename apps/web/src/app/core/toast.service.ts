import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

/** Notifications en haut à droite (équivalent ng-zorro). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  show(kind: ToastKind, title: string, message?: string, durationMs = kind === 'error' ? 8000 : 4500): void {
    const id = ++this.seq;
    this.toasts.update((t) => [...t, { id, kind, title, message }].slice(-5));
    setTimeout(() => this.dismiss(id), durationMs);
  }

  success(title: string, message?: string) {
    this.show('success', title, message);
  }
  info(title: string, message?: string) {
    this.show('info', title, message);
  }
  warning(title: string, message?: string) {
    this.show('warning', title, message);
  }
  error(title: string, message?: string) {
    this.show('error', title, message);
  }

  dismiss(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}
