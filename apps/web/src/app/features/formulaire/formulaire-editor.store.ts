import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormulaireDto, GeocodeCandidate } from '@rni/shared';
import { FormulaireApi } from '../../core/api/formulaire.api';
import { AuthService } from '../../core/auth/auth.service';
import { AppError } from '../../core/errors/app-error';
import { ToastService } from '../../core/notifications/toast.service';
import { ActionState, AsyncState } from '../../core/state/async-state';
import { addressOf, buildFormulaireForm, toFormValue, toPayload } from './formulaire-form';

/** Édition d'une fiche de crise : chargement, validation, enregistrement, clôture, suppression. */
@Injectable()
export class FormulaireEditorStore {
  private readonly api = inject(FormulaireApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  readonly fiche = new AsyncState<FormulaireDto | null>(null);
  readonly action = new ActionState();
  readonly form = buildFormulaireForm();
  readonly submitted = signal(false);
  /** Adresse terrain : texte saisi et candidat retenu (obligatoire). */
  readonly addressText = signal('');
  readonly address = signal<GeocodeCandidate | null>(null);
  private readonly addressDirty = signal(false);

  readonly current = this.fiche.data;
  readonly isNew = computed(() => !this.current());
  readonly closed = computed(() => !!this.current()?.is_closed);
  readonly isAuthor = computed(() => !this.current() || this.current()!.id_user === this.auth.user()?.id_user);
  /** Texte saisi ne correspondant à aucun candidat du géocodeur. */
  readonly addressInvalid = computed(() => !!this.addressText() && !this.address());
  readonly addressMissing = computed(() => this.submitted() && !this.address());

  async load(id: number): Promise<void> {
    const f = await this.fiche.load(() => this.api.get(id, { silent: true }));
    if (f) this.apply(f);
  }

  private apply(f: FormulaireDto): void {
    this.fiche.set(f);
    this.form.reset(toFormValue(f));
    const a = addressOf(f);
    this.address.set(a);
    this.addressText.set(a?.address ?? (f['terrain_adresse'] as string | null) ?? '');
    this.addressDirty.set(false);
    if (f.is_closed) this.form.disable();
    else this.form.enable();
  }

  setAddressText(text: string): void {
    this.addressText.set(text);
    this.addressDirty.set(true);
  }

  setAddress(c: GeocodeCandidate | null): void {
    this.address.set(c);
    this.addressDirty.set(true);
  }

  hasUnsavedChanges(): boolean {
    return !this.closed() && (this.form.dirty || this.addressDirty());
  }

  /** Enregistre (création ou mise à jour). Renvoie la fiche, ou `null` si invalide / en échec. */
  async save(): Promise<FormulaireDto | null> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.address()) {
      this.toasts.warning('Fiche incomplète', 'Tous les champs sont obligatoires : renseignez au moins le nom ou le prénom et une adresse proposée.');
      return null;
    }
    const body = toPayload(this.form.getRawValue(), this.address());
    const f = this.current();
    const r = await this.action.run(() => (f ? this.api.update(f.id_formulaire, body, { silent: true }) : this.api.create(body, { silent: true })));
    if (!r.ok) return null;
    this.apply(r.value);
    this.toasts.success('Fiche enregistrée');
    if (!f) void this.router.navigate(['/formulaire', r.value.id_formulaire], { replaceUrl: true });
    return r.value;
  }

  /** BR-FOR-5 / BR-FOR-6 : clôture par l'auteur, après enregistrement. */
  async close(): Promise<boolean> {
    const f = this.current();
    if (!f) return false;
    if (this.hasUnsavedChanges()) {
      this.toasts.warning('Modifications non enregistrées', 'Enregistrez la fiche avant de la clôturer.');
      return false;
    }
    const r = await this.action.run(() => this.api.close(f.id_formulaire, { silent: true }));
    if (!r.ok) return false;
    this.apply(r.value);
    this.toasts.success('Fiche clôturée');
    return true;
  }

  async remove(): Promise<boolean> {
    const f = this.current();
    if (!f) return false;
    const r = await this.action.run(() => this.api.remove(f.id_formulaire, { silent: true }));
    if (!r.ok) return false;
    this.form.markAsPristine();
    this.addressDirty.set(false);
    this.toasts.success('Fiche supprimée');
    void this.router.navigateByUrl('/formulaire');
    return true;
  }

  /** Erreur de chargement non récupérable (fiche supprimée, hors périmètre…). */
  readonly fatal = computed<AppError | null>(() => {
    const e = this.fiche.error();
    return e && (e.kind === 'not-found' || e.kind === 'forbidden') ? e : null;
  });
}
