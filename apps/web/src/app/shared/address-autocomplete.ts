import { Component, DestroyRef, ElementRef, HostListener, inject, input, model, output, signal } from '@angular/core';
import type { GeocodeCandidate } from '@rni/shared';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GeoApi } from '../core/data.service';

/**
 * Saisie d'adresse assistée par le géocodeur Facade : la valeur n'est retenue (coordonnées)
 * que si l'utilisateur sélectionne un candidat.
 */
@Component({
  selector: 'rni-address-autocomplete',
  template: `
    <div class="relative">
      <input
        type="text"
        class="input"
        [class.input-error]="invalid()"
        [placeholder]="placeholder()"
        [value]="text()"
        [disabled]="disabled()"
        (input)="onInput($any($event.target).value)"
        (focus)="open.set(candidates().length > 0)"
        (keydown.enter)="$event.preventDefault(); pickFirst()"
        autocomplete="off"
        [attr.aria-label]="placeholder()"
      />
      @if (loading()) {
        <span class="absolute top-2 right-2 text-xs text-slate-400">…</span>
      }
      @if (open() && candidates().length) {
        <ul class="absolute z-[1500] mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg">
          @for (c of candidates(); track $index) {
            <li>
              <button type="button" class="block w-full px-3 py-1.5 text-left hover:bg-rni-100" (click)="pick(c)">{{ c.address }}</button>
            </li>
          }
        </ul>
      }
      @if (noResult()) {
        <p class="field-error">Aucune adresse trouvée.</p>
      }
    </div>
  `,
})
export class AddressAutocomplete {
  private readonly geo = inject(GeoApi);
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly minChars = input(6);
  readonly placeholder = input('Saisir une adresse…');
  readonly disabled = input(false);
  readonly invalid = input(false);
  /** Texte saisi (liaison bidirectionnelle). */
  readonly text = model('');
  readonly selected = output<GeocodeCandidate | null>();

  protected readonly candidates = signal<GeocodeCandidate[]>([]);
  protected readonly open = signal(false);
  protected readonly loading = signal(false);
  protected readonly noResult = signal(false);
  private readonly query$ = new Subject<string>();

  constructor() {
    this.query$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((q) => {
          if (q.trim().length < this.minChars()) return of([] as GeocodeCandidate[]);
          this.loading.set(true);
          return this.geo.geocode(q).pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((res) => {
        this.loading.set(false);
        this.candidates.set(res ?? []);
        this.noResult.set(res === null);
        this.open.set(!!res?.length);
      });
  }

  onInput(v: string): void {
    this.text.set(v);
    this.selected.emit(null);
    this.query$.next(v);
  }

  pick(c: GeocodeCandidate): void {
    this.text.set(c.address);
    this.open.set(false);
    this.noResult.set(false);
    this.selected.emit(c);
  }

  pickFirst(): void {
    const c = this.candidates()[0];
    if (c) this.pick(c);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (!this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }
}
