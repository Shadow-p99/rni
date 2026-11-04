import { Component, inject } from '@angular/core';
import { ToastService } from '../../core/notifications/toast.service';

/** Pile de notifications (haut droite), avec action optionnelle (« Réessayer », « Recharger »). */
@Component({
  selector: 'rni-toasts',
  template: `
    <div class="pointer-events-none fixed top-16 right-3 z-[3000] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
      @for (t of toasts.toasts(); track t.id) {
        <div
          class="pointer-events-auto rounded-lg border-l-4 bg-white p-3 shadow-lg"
          [class.border-green-600]="t.kind === 'success'"
          [class.border-blue-600]="t.kind === 'info'"
          [class.border-amber-500]="t.kind === 'warning'"
          [class.border-red-600]="t.kind === 'error'"
          [attr.role]="t.kind === 'error' ? 'alert' : 'status'"
        >
          <div class="flex items-start gap-2">
            <div class="flex-1">
              <p class="text-sm font-semibold text-slate-800">{{ t.title }}</p>
              @if (t.message) {
                <p class="mt-0.5 text-xs text-slate-600">{{ t.message }}</p>
              }
              @if (t.action; as a) {
                <button type="button" class="mt-1.5 text-xs font-semibold text-rni-700 underline-offset-2 hover:underline" (click)="a.run(); toasts.dismiss(t.id)">
                  {{ a.label }}
                </button>
              }
            </div>
            <button type="button" class="text-slate-400 hover:text-slate-700" (click)="toasts.dismiss(t.id)" aria-label="Fermer">✕</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class Toasts {
  protected readonly toasts = inject(ToastService);
}
