import { Component, Injectable, inject, signal } from '@angular/core';
import { Modal } from './modal';

interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

/** Boîte de confirmation modale (`await confirm.ask(...)`). */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly current = signal<ConfirmRequest | null>(null);

  ask(title: string, message: string, opts: { confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
    return new Promise((resolve) =>
      this.current.set({ title, message, confirmLabel: opts.confirmLabel ?? 'Confirmer', danger: opts.danger ?? false, resolve }),
    );
  }

  answer(ok: boolean): void {
    this.current()?.resolve(ok);
    this.current.set(null);
  }
}

@Component({
  selector: 'rni-confirm-host',
  imports: [Modal],
  template: `
    @let c = confirm.current();
    <rni-modal [open]="!!c" [title]="c?.title ?? ''" size="sm" (closed)="confirm.answer(false)">
      <p class="text-sm whitespace-pre-line text-slate-700">{{ c?.message }}</p>
      <ng-container footer>
        <button type="button" class="btn-secondary" (click)="confirm.answer(false)">Annuler</button>
        <button type="button" [class]="c?.danger ? 'btn-danger' : 'btn-primary'" (click)="confirm.answer(true)">{{ c?.confirmLabel }}</button>
      </ng-container>
    </rni-modal>
  `,
})
export class ConfirmHost {
  protected readonly confirm = inject(ConfirmService);
}
