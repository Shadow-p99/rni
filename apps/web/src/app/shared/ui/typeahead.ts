import { Component, DestroyRef, ElementRef, HostListener, computed, inject, input, model, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, debounceTime, map, of, switchMap, tap } from 'rxjs';

export interface TypeaheadBadge {
  label: string;
  tone: 'neutral' | 'warning' | 'info';
}

let seq = 0;

/**
 * Champ de saisie avec suggestions (générique) :
 * recherche différée, annulation des requêtes obsolètes, navigation clavier (↑ ↓ Entrée Échap),
 * états « chargement », « aucun résultat » et « recherche indisponible ».
 * La valeur n'est retenue que lorsqu'une suggestion est choisie (`selected`).
 */
@Component({
  selector: 'rni-typeahead',
  host: { class: 'block' },
  template: `
    <div class="relative">
      <input
        type="text"
        class="input pr-7"
        [id]="inputId()"
        [class.input-error]="invalid() || !!error()"
        [placeholder]="placeholder()"
        [value]="text()"
        [disabled]="disabled()"
        autocomplete="off"
        role="combobox"
        [attr.aria-label]="ariaLabel() || placeholder()"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="listId"
        [attr.aria-activedescendant]="active() >= 0 ? listId + '-' + active() : null"
        (input)="onInput($any($event.target).value)"
        (focus)="open.set(results().length > 0)"
        (keydown)="onKey($event)"
      />
      @if (loading()) {
        <span class="absolute top-2 right-2 size-4 animate-spin rounded-full border-2 border-slate-300 border-t-rni-600" aria-hidden="true"></span>
      }
      @if (open() && results().length) {
        <ul [id]="listId" role="listbox" class="absolute z-[1500] mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg">
          @for (item of results(); track $index; let i = $index) {
            <li [id]="listId + '-' + i" role="option" [attr.aria-selected]="i === active()">
              <button type="button" class="block w-full px-3 py-1.5 text-left hover:bg-rni-100" [class.bg-rni-100]="i === active()" (mousedown)="$event.preventDefault()" (click)="pick(item)">
                {{ display()(item) }}
                @if (describe()?.(item); as d) {
                  <span class="text-xs text-slate-500">({{ d }})</span>
                }
                @if (badge()?.(item); as b) {
                  <span class="chip ml-1" [class]="badgeClass[b.tone]">{{ b.label }}</span>
                }
              </button>
            </li>
          }
        </ul>
      }
    </div>
    @if (error()) {
      <p class="field-error">{{ error() }}</p>
    } @else if (noResult()) {
      <p class="mt-1 text-xs text-slate-500">{{ emptyText() }}</p>
    } @else if (hint() && !text()) {
      <p class="mt-1 text-xs text-slate-500">{{ hint() }}</p>
    }
  `,
})
export class Typeahead<T> {
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Fonction de recherche (appelée après `minChars` caractères et 300 ms d'inactivité). */
  readonly search = input.required<(q: string) => Observable<T[]>>();
  readonly display = input<(item: T) => string>((i) => String(i));
  readonly describe = input<((item: T) => string | null | undefined) | null>(null);
  readonly badge = input<((item: T) => TypeaheadBadge | null) | null>(null);
  readonly minChars = input(2);
  readonly placeholder = input('');
  readonly ariaLabel = input('');
  readonly inputId = input(`rni-typeahead-${++seq}`);
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly hint = input('');
  readonly emptyText = input('Aucun résultat.');
  /** Texte saisi (liaison bidirectionnelle). */
  readonly text = model('');
  readonly selected = output<T | null>();

  protected readonly listId = `rni-ta-list-${seq}`;
  protected readonly results = signal<T[]>([]);
  protected readonly open = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly searched = signal(false);
  protected readonly active = signal(-1);
  protected readonly noResult = computed(() => this.searched() && !this.loading() && !this.results().length && this.text().trim().length >= this.minChars());
  protected readonly badgeClass = { neutral: 'bg-slate-100 text-slate-600', warning: 'bg-amber-100 text-amber-800', info: 'bg-rni-100 text-rni-800' };
  private readonly query$ = new Subject<string>();

  constructor() {
    this.query$
      .pipe(
        debounceTime(300),
        tap(() => {
          this.error.set(null);
          this.searched.set(false);
        }),
        switchMap((q) => {
          if (q.trim().length < this.minChars()) return of({ items: [] as T[], failed: false, searched: false });
          this.loading.set(true);
          return this.search()(q.trim()).pipe(
            map((items) => ({ items, failed: false, searched: true })),
            catchError(() => of({ items: [] as T[], failed: true, searched: true })),
          );
        }),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(({ items, failed, searched }) => {
        this.loading.set(false);
        this.results.set(items);
        this.searched.set(searched && !failed);
        this.error.set(failed ? 'La recherche est momentanément indisponible.' : null);
        this.active.set(items.length ? 0 : -1);
        this.open.set(items.length > 0);
      });
  }

  onInput(v: string): void {
    this.text.set(v);
    this.selected.emit(null);
    this.query$.next(v);
  }

  pick(item: T): void {
    this.text.set(this.display()(item));
    this.open.set(false);
    this.results.set([]);
    this.searched.set(false);
    this.selected.emit(item);
  }

  /** Vide le champ (ex. après une sélection). */
  clear(): void {
    this.text.set('');
    this.results.set([]);
    this.open.set(false);
    this.searched.set(false);
  }

  onKey(e: KeyboardEvent): void {
    const n = this.results().length;
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      this.open.set(true);
      this.active.set((this.active() + 1) % n);
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      this.active.set((this.active() - 1 + n) % n);
    } else if (e.key === 'Enter' && this.open() && this.active() >= 0) {
      e.preventDefault();
      this.pick(this.results()[this.active()]);
    } else if (e.key === 'Escape' && this.open()) {
      e.stopPropagation();
      this.open.set(false);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (!this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }
}
