import { Component, inject, input, model, output } from '@angular/core';
import { ErrorCode, GeocodeCandidate } from '@rni/shared';
import { Observable, catchError, of, throwError } from 'rxjs';
import { GeoApi } from '../../core/api/geo.api';
import { AppError } from '../../core/errors/app-error';
import { Typeahead } from './typeahead';

/**
 * Saisie d'adresse assistée par le géocodeur Facade : les coordonnées ne sont retenues que si
 * l'utilisateur choisit un candidat. « Aucune adresse » (RNI-3001) est un cas normal.
 */
@Component({
  selector: 'rni-address-autocomplete',
  imports: [Typeahead],
  template: `
    <rni-typeahead
      [search]="search"
      [display]="label"
      [minChars]="minChars()"
      [placeholder]="placeholder()"
      [ariaLabel]="placeholder()"
      [disabled]="disabled()"
      [invalid]="invalid()"
      emptyText="Aucune adresse trouvée."
      [(text)]="text"
      (selected)="selected.emit($event)"
    />
  `,
})
export class AddressAutocomplete {
  private readonly geo = inject(GeoApi);
  readonly minChars = input(6);
  readonly placeholder = input('Saisir une adresse…');
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly text = model('');
  readonly selected = output<GeocodeCandidate | null>();

  protected readonly label = (c: GeocodeCandidate) => c.address;
  protected readonly search = (q: string): Observable<GeocodeCandidate[]> =>
    this.geo.geocode(q).pipe(
      catchError((e: AppError) => (e.code === ErrorCode.AUCUNE_ADRESSE ? of([]) : throwError(() => e))),
    );
}
