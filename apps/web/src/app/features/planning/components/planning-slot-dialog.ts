import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CRENEAU_LIBELLES,
  Creneau,
  GEOCODER_PLANNING_MIN_CHARS,
  GeocodeCandidate,
  PlanningDto,
  PlageBounds,
  PlanningInputDto,
  Profil,
  RESTRICTED_POSITIONS,
  UserDto,
  allowedPositionsFor,
  computeInsertion,
  plageSlots,
  toSlot,
  minPlanningDate,
  validatePlageBounds,
} from '@rni/shared';
import { PlanningApi } from '../../../core/api/planning.api';
import { UsersApi } from '../../../core/api/users.api';
import { AuthService } from '../../../core/auth/auth.service';
import { AppError } from '../../../core/errors/app-error';
import { ToastService } from '../../../core/notifications/toast.service';
import { ReferentielService } from '../../../core/referentiel/referentiel.service';
import { ActionState } from '../../../core/state/async-state';
import { AddressAutocomplete } from '../../../shared/ui/address-autocomplete';
import { ConfirmService } from '../../../shared/ui/confirm';
import { ErrorPanel } from '../../../shared/ui/error-panel';
import { Field } from '../../../shared/ui/field';
import { Modal } from '../../../shared/ui/modal';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { Typeahead } from '../../../shared/ui/typeahead';

export interface PlanningFormInit {
  /** Plage existante (modification / insertion / suppression). */
  planning?: PlanningDto | null;
  /** Personnel présélectionné (création depuis une case). */
  user?: { nigend: string; label: string } | null;
  date?: string;
  creneau?: Creneau;
  /** Période pré-remplie (sélection par glisser). */
  range?: PlageBounds;
  /**
   * Demi-journée cliquée dans une plage existante : la fenêtre s'ouvre sur « Ce créneau »
   * (modification de ce seul créneau, le reste de la plage est conservé).
   */
  slot?: { date: string; creneau: Creneau };
}

type Mode = 'edit' | 'insert';

const fmt = (d: string) => d.split('-').reverse().join('/');
const cr = (c: number) => (c === Creneau.JOUR ? 'Jour' : 'Nuit');

/** Saisie d'un créneau de planning (§5.2) et insertion dans une plage existante (§5.3). */
@Component({
  selector: 'rni-planning-slot-dialog',
  imports: [Modal, FormsModule, AddressAutocomplete, Typeahead, Segmented, Field, ErrorPanel],
  template: `
    <rni-modal [open]="true" [title]="existing() ? 'Plage de planning' : 'Nouveau créneau de planning'" [locked]="action.busy()" (closed)="closed.emit()">
      @if (existing() && !readOnlyReason()) {
        <rni-segmented class="mb-4" label="Action" [options]="modes()" [value]="mode()" (valueChange)="setMode($event)" />
      }
      @if (readOnlyReason(); as reason) {
        <p class="mb-3 rounded-md bg-amber-50 p-2 text-sm text-amber-800">{{ reason }}</p>
      }
      @if (mode() === 'insert' && existing(); as e) {
        <p class="mb-3 rounded-md bg-rni-100 p-2 text-xs text-rni-900">
          @if (slot(); as s) {
            Seul le créneau du {{ fmt(s.date) }} ({{ cr(s.creneau) }}) sera modifié ; le reste de la plage
            ({{ fmt(e.date_debut) }} {{ cr(e.id_creneaux_debut) }} → {{ fmt(e.date_fin) }} {{ cr(e.id_creneaux_fin) }}) est conservé.
            Vous pouvez étendre la période dans les limites de la plage.
          } @else {
            La période insérée doit être incluse dans la plage initiale ({{ fmt(e.date_debut) }} {{ cr(e.id_creneaux_debut) }} → {{ fmt(e.date_fin) }} {{ cr(e.id_creneaux_fin) }}) ; la plage sera découpée automatiquement.
          }
        </p>
      }

      <form class="grid grid-cols-1 gap-3 sm:grid-cols-2" id="planning-slot-form" (ngSubmit)="submit()">
        <rni-field class="sm:col-span-2" label="Personnel" for="pf-user">
          @if (personLocked()) {
            <input id="pf-user" class="input" [value]="userLabel()" disabled />
          } @else {
            <rni-typeahead inputId="pf-user" placeholder="Nigend, nom ou prénom…" [search]="searchUsers" [display]="userDisplay" [describe]="userUnit" emptyText="Aucun personnel planifiable ne correspond." (selected)="pickUser($event)" />
          }
        </rni-field>
        <rni-field label="Date de début" for="pf-d1">
          <input id="pf-d1" type="date" class="input" name="d1" [min]="minDate" [(ngModel)]="dateDebut" [disabled]="!!readOnlyReason()" required />
        </rni-field>
        <rni-field label="Créneau de début" for="pf-c1">
          <select id="pf-c1" class="input" name="c1" [(ngModel)]="creneauDebut" [disabled]="!!readOnlyReason()">
            <option [ngValue]="1">{{ creneaux[1] }}</option>
            <option [ngValue]="2">{{ creneaux[2] }}</option>
          </select>
        </rni-field>
        <rni-field label="Date de fin" for="pf-d2">
          <input id="pf-d2" type="date" class="input" name="d2" [min]="dateDebut || minDate" [(ngModel)]="dateFin" [disabled]="!!readOnlyReason()" required />
        </rni-field>
        <rni-field label="Créneau de fin" for="pf-c2">
          <select id="pf-c2" class="input" name="c2" [(ngModel)]="creneauFin" [disabled]="!!readOnlyReason()">
            <option [ngValue]="1">{{ creneaux[1] }}</option>
            <option [ngValue]="2">{{ creneaux[2] }}</option>
          </select>
        </rni-field>
        <rni-field class="sm:col-span-2" label="Position de service" for="pf-pos">
          <select id="pf-pos" class="input" name="pos" [(ngModel)]="position" [disabled]="!!readOnlyReason()" required>
            <option [ngValue]="null" disabled>Choisir…</option>
            @for (p of positions(); track p.id_pos_service) {
              <option [ngValue]="p.id_pos_service">{{ p.libelle }}</option>
            }
          </select>
        </rni-field>
        <rni-field class="sm:col-span-2" label="Adresse temporaire" note="(vide = adresse de l'unité)" [error]="addressWarning()">
          <rni-address-autocomplete [minChars]="geoMin" [disabled]="!!readOnlyReason()" [(text)]="adresse" (selected)="candidate.set($event)" placeholder="Saisir au moins 6 caractères…" />
        </rni-field>
        <rni-error-panel class="sm:col-span-2" [error]="validation() ?? action.error()" />
      </form>

      <ng-container footer>
        @if (existing() && !readOnlyReason() && mode() === 'edit') {
          <button type="button" class="btn-danger mr-auto" (click)="remove()" [disabled]="action.busy()">Supprimer</button>
        }
        <button type="button" class="btn-secondary" (click)="closed.emit()" [disabled]="action.busy()">Annuler</button>
        @if (!readOnlyReason()) {
          <button type="submit" form="planning-slot-form" class="btn-primary" [disabled]="action.busy()">
            {{ action.busy() ? 'Enregistrement…' : mode() === 'insert' && !slot() ? 'Insérer' : 'Enregistrer' }}
          </button>
        }
      </ng-container>
    </rni-modal>
  `,
})
export class PlanningSlotDialog implements OnInit {
  private readonly api = inject(PlanningApi);
  private readonly usersApi = inject(UsersApi);
  private readonly auth = inject(AuthService);
  private readonly ref = inject(ReferentielService);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly init = input<PlanningFormInit>({});
  readonly closed = output<void>();
  readonly saved = output<void>();

  protected readonly creneaux = CRENEAU_LIBELLES;
  protected readonly minDate = minPlanningDate();
  protected readonly geoMin = GEOCODER_PLANNING_MIN_CHARS;
  protected readonly fmt = fmt;
  protected readonly cr = cr;
  /** Demi-journée cliquée, si elle fait partie d'une plage de plusieurs créneaux. */
  protected readonly slot = computed(() => {
    const e = this.existing();
    const s = this.init().slot;
    if (!e || !s) return null;
    const { start, end } = plageSlots(e);
    const k = toSlot(s.date, s.creneau);
    return start !== end && k >= start && k <= end ? s : null;
  });

  protected readonly modes = computed<SegmentOption<Mode>[]>(() => {
    const s = this.slot();
    return s
      ? [
          { value: 'insert', label: `Ce créneau (${fmt(s.date).slice(0, 5)} ${cr(s.creneau)})` },
          { value: 'edit', label: 'Toute la plage' },
        ]
      : [
          { value: 'edit', label: 'Modifier la plage' },
          { value: 'insert', label: 'Insérer une période' },
        ];
  });

  protected readonly action = new ActionState();
  protected readonly validation = signal<AppError | null>(null);
  protected readonly mode = signal<Mode>('edit');
  protected readonly nigend = signal<string | null>(null);
  protected readonly userLabel = signal('');
  protected readonly candidate = signal<GeocodeCandidate | null>(null);

  protected dateDebut = '';
  protected creneauDebut: number = Creneau.JOUR;
  protected dateFin = '';
  protected creneauFin: number = Creneau.NUIT;
  protected position: number | null = null;
  protected adresse = '';
  private initialAddress = '';

  protected readonly existing = computed(() => this.init().planning ?? null);
  /** Personnel non modifiable : plage existante, case du planning ou négociateur (lui-même). */
  protected readonly personLocked = computed(() => !!this.existing() || !!this.init().user || this.auth.profil() === Profil.NEGOCIATEUR);

  /** BR-PLA-3 : positions actives, restreintes pour les profils ∉ {1, 3, 7}. */
  protected readonly positions = computed(() => {
    const allowed = allowedPositionsFor(this.auth.profil() ?? 0);
    return this.ref.activePositions().filter((p) => allowed.includes(p.id_pos_service));
  });

  protected readonly readOnlyReason = computed(() => {
    if (!this.auth.canWritePlanning()) return 'Votre profil est en consultation.';
    const e = this.existing();
    if (e && this.auth.profil() === Profil.NEGOCIATEUR && RESTRICTED_POSITIONS.includes(e.id_pos_service)) {
      return 'Les positions Alerte et Formateur ne peuvent être modifiées que par un référent ou le GIGN.';
    }
    return null;
  });

  protected readonly searchUsers = (q: string) => this.usersApi.search(q);
  protected readonly userDisplay = (u: UserDto) => `${u.nigend} — ${u.prenom} ${u.nom}`;
  protected readonly userUnit = (u: UserDto) => u.libelle_unite;

  ngOnInit(): void {
    const i = this.init();
    const e = i.planning;
    if (e) {
      this.nigend.set(e.nigend);
      this.userLabel.set(i.user?.label ?? e.nigend);
      this.fill(e);
      // Clic sur une demi-journée d'une plage de plusieurs créneaux : modification de ce créneau seul
      if (this.slot() && !this.readOnlyReason()) this.setMode('insert');
      return;
    }
    if (i.user) {
      this.nigend.set(i.user.nigend);
      this.userLabel.set(i.user.label);
    } else if (this.auth.profil() === Profil.NEGOCIATEUR) {
      const u = this.auth.user()!;
      this.nigend.set(u.nigend);
      this.userLabel.set(`${u.nigend} — ${u.prenom} ${u.nom}`);
    }
    if (i.range) {
      this.dateDebut = i.range.date_debut;
      this.creneauDebut = i.range.id_creneaux_debut;
      this.dateFin = i.range.date_fin;
      this.creneauFin = i.range.id_creneaux_fin;
      return;
    }
    this.dateDebut = this.dateFin = i.date ?? '';
    this.creneauDebut = i.creneau ?? Creneau.JOUR;
    this.creneauFin = i.creneau ?? Creneau.NUIT;
  }

  private fill(e: PlanningDto): void {
    this.dateDebut = e.date_debut;
    this.creneauDebut = e.id_creneaux_debut;
    this.dateFin = e.date_fin;
    this.creneauFin = e.id_creneaux_fin;
    this.position = e.id_pos_service;
    this.adresse = this.initialAddress = e.adresse_temp ?? '';
    this.candidate.set(null);
  }

  /** Adresse saisie sans candidat retenu : l'adresse de l'unité sera utilisée. */
  protected addressWarning(): string | null {
    return this.adresse && !this.candidate() && this.adresse !== this.initialAddress
      ? "Sélectionnez une adresse proposée, sinon l'adresse de l'unité sera utilisée."
      : null;
  }

  setMode(m: Mode): void {
    this.mode.set(m);
    this.validation.set(null);
    this.action.clear();
    const e = this.existing()!;
    if (m === 'insert') {
      const s = this.slot();
      if (s) {
        this.dateDebut = this.dateFin = s.date;
        this.creneauDebut = this.creneauFin = s.creneau;
      }
      this.position = null;
      this.adresse = '';
      this.candidate.set(null);
    } else {
      this.fill(e);
    }
  }

  pickUser(u: UserDto | null): void {
    this.nigend.set(u?.nigend ?? null);
  }

  private body(): PlanningInputDto {
    const e = this.existing();
    const c = this.candidate();
    const keep = !!e && this.mode() === 'edit' && this.adresse === this.initialAddress;
    return {
      nigend: this.nigend() ?? '',
      date_debut: this.dateDebut,
      id_creneaux_debut: Number(this.creneauDebut),
      date_fin: this.dateFin,
      id_creneaux_fin: Number(this.creneauFin),
      id_pos_service: Number(this.position),
      adresse_temp: c ? c.address : keep ? (e!.adresse_temp ?? null) : null,
      x_adresse_temp: c ? c.x : keep ? (e!.x_adresse_temp ?? null) : null,
      y_adresse_temp: c ? c.y : keep ? (e!.y_adresse_temp ?? null) : null,
    };
  }

  private invalid(message: string): void {
    this.validation.set(new AppError('business', 'Saisie incomplète ou invalide', message, undefined, undefined, 'AVERTISSEMENT'));
  }

  async submit(): Promise<void> {
    this.validation.set(null);
    if (!this.nigend()) return this.invalid('Sélectionnez un personnel.');
    if (this.position == null) return this.invalid('Choisissez une position de service.');
    const body = this.body();
    const v = validatePlageBounds(body);
    if (v) return this.invalid(v.message);
    const e = this.existing();
    const insert = this.mode() === 'insert' && !!e;
    if (insert) {
      const r = computeInsertion(e, body);
      if (!r.ok) return this.invalid(r.violation.message);
    }
    // Création : plannings existants sur la période → confirmation d'écrasement
    let ecraser = false;
    if (!e) {
      const ov = await this.action.run(() => this.api.overlaps(body, { silent: true }));
      if (!ov.ok) return;
      if (ov.value.length) {
        if (this.auth.profil() === Profil.NEGOCIATEUR && ov.value.some((p) => RESTRICTED_POSITIONS.includes(p.id_pos_service))) {
          return this.invalid('La période contient une plage Alerte ou Formateur, que seul un référent ou le GIGN peut écraser.');
        }
        if (!(await this.confirmOverwrite(ov.value))) return;
        ecraser = true;
      }
    }
    const r = await this.action.run<unknown>(() =>
      insert
        ? this.api.insert({ ...body, id_planning: e!.id_planning }, { silent: true })
        : e
          ? this.api.update(e.id_planning, body, { silent: true })
          : this.api.create({ ...body, ecraser }, { silent: true }),
    );
    if (!r.ok) return;
    this.toasts.success(
      insert ? (this.slot() ? 'Créneau modifié' : 'Période insérée') : e ? 'Plage modifiée' : ecraser ? 'Créneau enregistré, plannings existants écrasés' : 'Créneau enregistré',
      insert ? 'Le reste de la plage est conservé.' : undefined,
    );
    this.saved.emit();
  }

  /** Alerte d'écrasement : liste les plannings existants qui seront remplacés sur la période. */
  private confirmOverwrite(existing: PlanningDto[]): Promise<boolean> {
    const lines = existing
      .slice(0, 6)
      .map((p) => `• du ${fmt(p.date_debut)} (${cr(p.id_creneaux_debut)}) au ${fmt(p.date_fin)} (${cr(p.id_creneaux_fin)}) — ${this.ref.libelle(p.id_pos_service)}`);
    if (existing.length > 6) lines.push(`• … et ${existing.length - 6} autre(s)`);
    return this.confirm.ask(
      'Plannings existants sur la période',
      `${existing.length === 1 ? 'Le planning suivant sera écrasé' : `Les ${existing.length} plannings suivants seront écrasés`} ` +
        `sur la période du ${fmt(this.dateDebut)} (${cr(this.creneauDebut)}) au ${fmt(this.dateFin)} (${cr(this.creneauFin)}) :\n\n` +
        `${lines.join('\n')}\n\nLes parties en dehors de cette période sont conservées.`,
      { confirmLabel: 'Écraser et enregistrer', danger: true },
    );
  }

  async remove(): Promise<void> {
    const e = this.existing();
    if (!e) return;
    const ok = await this.confirm.ask('Supprimer la plage', `Supprimer définitivement la plage du ${fmt(e.date_debut)} au ${fmt(e.date_fin)} ?`, {
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    const r = await this.action.run(() => this.api.remove(e.id_planning, { silent: true }));
    if (!r.ok) return;
    this.toasts.success('Plage supprimée');
    this.saved.emit();
  }
}
