import { Component, DestroyRef, inject, input, model, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

let seq = 0;

/** Champ de recherche : `value` suit la saisie, `searched` est émis après une pause (300 ms). */
@Component({
  selector: 'rni-search-input',
  host: { class: 'block' },
  template: `
    @if (label()) {
      <label class="label" [for]="id">{{ label() }}</label>
    }
    <div class="relative">
      <span class="pointer-events-none absolute top-1.5 left-2.5 text-slate-400" aria-hidden="true">⌕</span>
      <input [id]="id" class="input pl-7" type="search" [placeholder]="placeholder()" [value]="value()" (input)="onInput($any($event.target).value)" [attr.aria-label]="label() ? null : placeholder()" />
    </div>
  `,
})
export class SearchInput {
  readonly label = input('');
  readonly placeholder = input('Rechercher…');
  readonly debounceMs = input(300);
  readonly value = model('');
  readonly searched = output<string>();
  protected readonly id = `rni-search-${++seq}`;
  private readonly input$ = new Subject<string>();

  constructor() {
    this.input$
      .pipe(debounceTime(this.debounceMs()), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((v) => this.searched.emit(v.trim()));
  }

  onInput(v: string): void {
    this.value.set(v);
    this.input$.next(v);
  }
}
