import { Injectable, computed, inject, signal } from '@angular/core';
import { DEFAULT_CRISES, FORMULAIRE_FIELDS, SECTIONS, type FormulaireConfigDto, type SectionId } from '@rni/shared';
import { firstValueFrom } from 'rxjs';
import { FormulaireApi } from '../api/formulaire.api';

/** Structure livrée (repli si l'API ne répond pas). */
export const DEFAULT_FORMULAIRE_CONFIG: FormulaireConfigDto = {
  crises: DEFAULT_CRISES.map((libelle, i) => ({ id_type_crise: i + 1, libelle, ordre: (i + 1) * 10, is_actif: true })),
  sections: SECTIONS.map((s, i) => ({ ...s, ordre: (i + 1) * 10 })),
  champs: FORMULAIRE_FIELDS.map((f, i) => ({ ...f, ordre: i })),
};

/**
 * Structure de la fiche de crise paramétrée en base (Administration › Fiche de crise) : types de
 * crise, libellés et ordre des sections et des champs, champs obligatoires, sections imprimables.
 */
@Injectable({ providedIn: 'root' })
export class FormulaireConfigService {
  private readonly api = inject(FormulaireApi);
  readonly config = signal<FormulaireConfigDto>(DEFAULT_FORMULAIRE_CONFIG);

  readonly sections = computed(() => [...this.config().sections].sort((a, b) => a.ordre - b.ordre));
  readonly champs = computed(() => [...this.config().champs].sort((a, b) => a.ordre - b.ordre));
  readonly crisesActives = computed(() => this.config().crises.filter((c) => c.is_actif).map((c) => c.libelle));

  sectionLibelle(id: SectionId): string {
    return this.config().sections.find((s) => s.id === id)?.libelle ?? id;
  }

  /** Relue à chaque entrée dans le module (un réglage récent est pris en compte) ; repli silencieux. */
  async load(): Promise<void> {
    try {
      this.config.set(await firstValueFrom(this.api.config({ silent: true })));
    } catch {
      /* structure précédente conservée */
    }
  }
}
