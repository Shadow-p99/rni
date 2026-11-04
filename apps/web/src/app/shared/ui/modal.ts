import { Component, HostListener, OnDestroy, effect, input, output } from '@angular/core';

/** Pile des fenêtres ouvertes : Échap ne ferme que la plus récente. */
const stack: Modal[] = [];

@Component({
  selector: 'rni-modal',
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-[2000] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-2 sm:p-6" (click)="onBackdrop($event)">
        <div
          class="card my-4 w-full shadow-xl"
          [class.max-w-md]="size() === 'sm'"
          [class.max-w-2xl]="size() === 'md'"
          [class.max-w-4xl]="size() === 'lg'"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="title()"
          (click)="$event.stopPropagation()"
        >
          <header class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 class="text-base font-semibold text-slate-800">{{ title() }}</h2>
            <button type="button" class="btn-ghost px-2" (click)="close()" [disabled]="locked()" aria-label="Fermer">✕</button>
          </header>
          <div class="px-4 py-4">
            <ng-content />
          </div>
          <footer class="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
            <ng-content select="[footer]" />
          </footer>
        </div>
      </div>
    }
  `,
})
export class Modal implements OnDestroy {
  readonly open = input(false);
  readonly title = input('');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly closeOnBackdrop = input(true);
  /** Empêche la fermeture (enregistrement en cours). */
  readonly locked = input(false);
  readonly closed = output<void>();

  constructor() {
    effect(() => {
      const i = stack.indexOf(this);
      if (this.open() && i < 0) stack.push(this);
      if (!this.open() && i >= 0) stack.splice(i, 1);
    });
  }

  ngOnDestroy(): void {
    const i = stack.indexOf(this);
    if (i >= 0) stack.splice(i, 1);
  }

  close(): void {
    if (!this.locked()) this.closed.emit();
  }

  onBackdrop(e: MouseEvent): void {
    if (this.closeOnBackdrop() && e.target === e.currentTarget) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open() && stack[stack.length - 1] === this) this.close();
  }
}
