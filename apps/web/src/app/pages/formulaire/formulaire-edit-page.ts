import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  CRISES,
  FORMULAIRE_FIELDS,
  FieldDef,
  FormulaireDto,
  GeocodeCandidate,
  NOTE_MAX,
  NOTE_MIN,
  SECTIONS,
  SectionId,
} from '@rni/shared';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { FormulaireApi } from '../../core/data.service';
import { ToastService } from '../../core/toast.service';
import { AddressAutocomplete } from '../../shared/address-autocomplete';
import { ConfirmService } from '../../shared/confirm';
import { Modal } from '../../shared/modal';
import { nameValidator, phoneValidator } from '../../shared/validators';
import { exportFormulairePdf } from './formulaire-pdf';

/** Fiche de crise : création, suivi, clôture, export PDF (§6). */
@Component({
  selector: 'rni-formulaire-edit-page',
  imports: [ReactiveFormsModule, FormsModule, RouterLink, DatePipe, AddressAutocomplete, Modal],
  templateUrl: './formulaire-edit-page.html',
})
export class FormulaireEditPage {
  private readonly api = inject(FormulaireApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly auth = inject(AuthService);

  /** Paramètre de route `:id` (`new` pour une création). */
  readonly id = input<string>('new');

  protected readonly sections = SECTIONS;
  protected readonly crises = CRISES;
  protected readonly noteMin = NOTE_MIN;
  protected readonly noteMax = NOTE_MAX;
  protected readonly fiche = signal<FormulaireDto | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly open = signal<Set<SectionId>>(new Set(['profil', 'situation', 'terrain', 'auteur']));
  protected readonly pdfDialog = signal(false);
  protected pdfSections: Record<string, boolean> = { situation: true, terrain: true, auteur: true };

  /** Adresse terrain : doit correspondre à un candidat du géocodeur. */
  protected readonly address = signal<{ text: string; candidate: GeocodeCandidate | null }>({ text: '', candidate: null });
  protected addressText = '';

  protected readonly form = new FormGroup<Record<string, FormControl>>({}, { validators: nameValidator });

  protected readonly isNew = computed(() => this.id() === 'new');
  protected readonly closed = computed(() => !!this.fiche()?.is_closed);
  protected readonly isAuthor = computed(() => !this.fiche() || this.fiche()!.id_user === this.auth.user()?.id_user);

  constructor() {
    for (const def of FORMULAIRE_FIELDS) {
      const validators = [];
      if (def.required && def.kind !== 'address') validators.push(Validators.required);
      if (def.kind === 'phone') validators.push(phoneValidator);
      if (def.kind === 'note') validators.push(Validators.min(NOTE_MIN), Validators.max(NOTE_MAX), Validators.pattern(/^\d+$/));
      const initial = def.kind === 'note' ? 0 : def.kind === 'select' ? 'Aucun' : '';
      this.form.addControl(def.key, new FormControl(initial, validators));
    }
    effect(() => {
      const id = this.id();
      if (id && id !== 'new') void this.load(Number(id));
    });
  }

  fields(section: SectionId): FieldDef[] {
    return FORMULAIRE_FIELDS.filter((f) => f.section === section);
  }

  toggle(s: SectionId): void {
    const set = new Set(this.open());
    if (set.has(s)) set.delete(s);
    else set.add(s);
    this.open.set(set);
  }

  invalid(key: string): boolean {
    const c = this.form.get(key);
    return !!c && c.invalid && (c.touched || this.submitted());
  }

  protected addressInvalid = computed(() => {
    const a = this.address();
    return !!a.text && !a.candidate;
  });

  private async load(id: number): Promise<void> {
    this.loading.set(true);
    try {
      const f = await firstValueFrom(this.api.get(id));
      this.apply(f);
    } catch {
      void this.router.navigateByUrl('/formulaire');
    } finally {
      this.loading.set(false);
    }
  }

  private apply(f: FormulaireDto): void {
    this.fiche.set(f);
    const patch: Record<string, unknown> = {};
    for (const def of FORMULAIRE_FIELDS) patch[def.key] = f[def.key] ?? (def.kind === 'note' ? 0 : '');
    this.form.patchValue(patch);
    const text = (f['terrain_adresse'] as string | null) ?? '';
    this.addressText = text;
    this.address.set({
      text,
      candidate: text && f['terrain_x'] != null ? { address: text, x: Number(f['terrain_x']), y: Number(f['terrain_y']), score: 100 } : null,
    });
    if (f.is_closed) this.form.disable();
    else this.form.enable();
    this.form.markAsPristine();
  }

  onAddressText(text: string): void {
    this.address.set({ text, candidate: null });
  }

  onAddress(c: GeocodeCandidate | null): void {
    if (c) this.address.set({ text: c.address, candidate: c });
  }

  private payload(): Record<string, unknown> {
    const v = this.form.getRawValue() as Record<string, unknown>;
    const a = this.address();
    return {
      ...v,
      terrain_adresse: a.candidate ? a.candidate.address : null,
      terrain_x: a.candidate?.x ?? null,
      terrain_y: a.candidate?.y ?? null,
      ...Object.fromEntries(FORMULAIRE_FIELDS.filter((d) => d.kind === 'note').map((d) => [d.key, Number(v[d.key] || 0)])),
    };
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.addressInvalid() || !this.address().candidate) {
      this.toasts.warning('Fiche incomplète', 'Tous les champs sont obligatoires ; renseignez au moins le nom ou le prénom et une adresse proposée.');
      return;
    }
    this.saving.set(true);
    try {
      const f = this.fiche();
      const saved = f ? await firstValueFrom(this.api.update(f.id_formulaire, this.payload())) : await firstValueFrom(this.api.create(this.payload()));
      this.apply(saved);
      this.toasts.success('Fiche enregistrée');
      if (!f) void this.router.navigate(['/formulaire', saved.id_formulaire], { replaceUrl: true });
    } catch {
      /* notifié */
    } finally {
      this.saving.set(false);
    }
  }

  async close(): Promise<void> {
    const f = this.fiche();
    if (!f) return;
    if (this.form.dirty) {
      this.toasts.warning('Modifications non enregistrées', 'Enregistrez la fiche avant de la clôturer.');
      return;
    }
    const ok = await this.confirm.ask('Clôturer la fiche', 'Une fiche clôturée ne peut plus être modifiée. Confirmer la clôture ?', { confirmLabel: 'Clôturer', danger: true });
    if (!ok) return;
    try {
      this.apply(await firstValueFrom(this.api.close(f.id_formulaire)));
      this.toasts.success('Fiche clôturée');
    } catch {
      /* notifié */
    }
  }

  async remove(): Promise<void> {
    const f = this.fiche();
    if (!f) return;
    const ok = await this.confirm.ask('Supprimer la fiche', 'La fiche sera définitivement supprimée.', { confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    try {
      await firstValueFrom(this.api.remove(f.id_formulaire));
      this.toasts.success('Fiche supprimée');
      void this.router.navigateByUrl('/formulaire');
    } catch {
      /* notifié */
    }
  }

  async exportPdf(): Promise<void> {
    const f = this.fiche();
    if (!f) return;
    const chosen = (Object.keys(this.pdfSections) as SectionId[]).filter((k) => this.pdfSections[k]);
    this.pdfDialog.set(false);
    await exportFormulairePdf(f, chosen);
  }
}
