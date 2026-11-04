import { Component, DestroyRef, computed, inject, input, output, signal, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  CRENEAU_LIBELLES,
  Creneau,
  GEOCODER_PLANNING_MIN_CHARS,
  GeocodeCandidate,
  PlanningDto,
  RESTRICTED_POSITIONS,
  UserDto,
  allowedPositionsFor,
  computeInsertion,
  minPlanningDate,
  validatePlageBounds,
} from '@rni/shared';
import { Subject, catchError, debounceTime, firstValueFrom, of, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { PlanningApi, UsersApi } from '../../core/data.service';
import { ReferentielService } from '../../core/referentiel.service';
import { ToastService } from '../../core/toast.service';
import { AddressAutocomplete } from '../../shared/address-autocomplete';
import { ConfirmService } from '../../shared/confirm';
import { Modal } from '../../shared/modal';

export interface PlanningFormInit {
  /** Plage existante (modification / insertion / suppression). */
  planning?: PlanningDto | null;
  /** Personnel présélectionné (création). */
  user?: { nigend: string; label: string } | null;
  date?: string;
  creneau?: Creneau;
}

type Mode = 'edit' | 'insert';

/** Modale de saisie d'un créneau de planning (§5.2) et d'insertion (§5.3). */
@Component({
  selector: 'rni-planning-form',
  imports: [Modal, FormsModule, AddressAutocomplete],
  template: `
    <rni-modal [open]="true" [title]="title()" size="md" (closed)="closed.emit()">
      @if (existing() && !readOnly()) {
        <div class="mb-4 inline-flex rounded-md border border-slate-300 p-0.5 text-sm">
          <button type="button" class="rounded px-3 py-1" [class.bg-rni-700]="mode() === 'edit'" [class.text-white]="mode() === 'edit'" (click)="setMode('edit')">Modifier la plage</button>
          <button type="button" class="rounded px-3 py-1" [class.bg-rni-700]="mode() === 'insert'" [class.text-white]="mode() === 'insert'" (click)="setMode('insert')">Insérer une période</button>
        </div>
      }
      @if (readOnly()) {
        <p class="mb-3 rounded-md bg-amber-50 p-2 text-sm text-amber-800">{{ readOnlyReason() }}</p>
      }
      @if (mode() === 'insert') {
        <p class="mb-3 rounded-md bg-rni-100 p-2 text-xs text-rni-900">
          La période insérée doit être incluse dans la plage initiale
          ({{ fmt(existing()!.date_debut) }} {{ crLabel(existing()!.id_creneaux_debut) }} → {{ fmt(existing()!.date_fin) }} {{ crLabel(existing()!.id_creneaux_fin) }})
          ; la plage sera découpée automatiquement.
        </p>
      }

      <form class="grid grid-cols-1 gap-3 sm:grid-cols-2" (ngSubmit)="submit()" id="planning-form">
        <div class="sm:col-span-2">
          <label class="label" for="pf-user">Personnel</label>
          @if (existing() || fixedUser() || selfOnly()) {
            <input id="pf-user" class="input" [value]="userLabel()" disabled />
          } @else {
            <div class="relative">
              <input id="pf-user" class="input" placeholder="Nigend, nom ou prénom…" autocomplete="off" [ngModel]="userQuery()" name="userQuery" (ngModelChange)="onUserQuery($event)" />
              @if (userCandidates().length && !nigend()) {
                <ul class="absolute z-[1500] mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg">
                  @for (u of userCandidates(); track u.id_user) {
                    <li><button type="button" class="block w-full px-3 py-1.5 text-left hover:bg-rni-100" (click)="pickUser(u)">{{ u.nigend }} — {{ u.prenom }} {{ u.nom }} <span class="text-xs text-slate-500">({{ u.libelle_unite }})</span></button></li>
                  }
                </ul>
              }
            </div>
          }
        </div>

        <div>
          <label class="label" for="pf-d1">Date de début</label>
          <input id="pf-d1" type="date" class="input" name="d1" [min]="minDate" [(ngModel)]="dateDebut" [disabled]="readOnly()" required />
        </div>
        <div>
          <label class="label" for="pf-c1">Créneau de début</label>
          <select id="pf-c1" class="input" name="c1" [(ngModel)]="creneauDebut" [disabled]="readOnly()">
            <option [ngValue]="1">{{ creneaux[1] }}</option>
            <option [ngValue]="2">{{ creneaux[2] }}</option>
          </select>
        </div>
        <div>
          <label class="label" for="pf-d2">Date de fin</label>
          <input id="pf-d2" type="date" class="input" name="d2" [min]="dateDebut || minDate" [(ngModel)]="dateFin" [disabled]="readOnly()" required />
        </div>
        <div>
          <label class="label" for="pf-c2">Créneau de fin</label>
          <select id="pf-c2" class="input" name="c2" [(ngModel)]="creneauFin" [disabled]="readOnly()">
            <option [ngValue]="1">{{ creneaux[1] }}</option>
            <option [ngValue]="2">{{ creneaux[2] }}</option>
          </select>
        </div>
        <div class="sm:col-span-2">
          <label class="label" for="pf-pos">Position de service</label>
          <select id="pf-pos" class="input" name="pos" [(ngModel)]="position" [disabled]="readOnly()" required>
            <option [ngValue]="null" disabled>Choisir…</option>
            @for (p of positions(); track p.id_pos_service) {
              <option [ngValue]="p.id_pos_service">{{ p.libelle }}</option>
            }
          </select>
        </div>
        <div class="sm:col-span-2">
          <label class="label">Adresse temporaire <span class="font-normal normal-case text-slate-400">(vide = adresse de l'unité)</span></label>
          <rni-address-autocomplete [minChars]="geoMin" [disabled]="readOnly()" [(text)]="adresse" (selected)="onAddress($event)" placeholder="Saisir au moins 6 caractères…" />
          @if (adresse && !addressCandidate && adresse !== initialAddress) {
            <p class="field-error">Sélectionnez une adresse proposée, sinon l'adresse de l'unité sera utilisée.</p>
          }
        </div>
        @if (error()) {
          <p class="rounded-md bg-red-50 p-2 text-sm text-red-700 sm:col-span-2">{{ error() }}</p>
        }
      </form>

      <ng-container footer>
        @if (existing() && !readOnly() && mode() === 'edit') {
          <button type="button" class="btn-danger mr-auto" (click)="remove()" [disabled]="saving()">Supprimer</button>
        }
        <button type="button" class="btn-secondary" (click)="closed.emit()">Annuler</button>
        @if (!readOnly()) {
          <button type="submit" form="planning-form" class="btn-primary" [disabled]="saving()">{{ mode() === 'insert' ? 'Insérer' : 'Enregistrer' }}</button>
        }
      </ng-container>
    </rni-modal>
  `,
})
export class PlanningForm implements OnInit {
  private readonly api = inject(PlanningApi);
  private readonly usersApi = inject(UsersApi);
  private readonly auth = inject(AuthService);
  private readonly ref = inject(ReferentielService);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly destroyRef = inject(DestroyRef);

  readonly init = input<PlanningFormInit>({});
  readonly closed = output<void>();
  readonly saved = output<void>();

  protected readonly creneaux = CRENEAU_LIBELLES;
  protected readonly minDate = minPlanningDate();
  protected readonly geoMin = GEOCODER_PLANNING_MIN_CHARS;
  protected readonly mode = signal<Mode>('edit');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly existing = computed(() => this.init().planning ?? null);
  protected readonly fixedUser = computed(() => this.init().user ?? null);
  protected readonly selfOnly = computed(() => this.auth.profil() === 4);
  protected readonly nigend = signal<string | null>(null);
  protected readonly userLabel = signal('');
  protected readonly userQuery = signal('');
  protected readonly userCandidates = signal<UserDto[]>([]);
  private readonly userQuery$ = new Subject<string>();

  protected dateDebut = '';
  protected creneauDebut: number = Creneau.JOUR;
  protected dateFin = '';
  protected creneauFin: number = Creneau.NUIT;
  protected position: number | null = null;
  protected adresse = '';
  protected initialAddress = '';
  protected addressCandidate: GeocodeCandidate | null = null;

  /** BR-PLA-3 : positions actives, restreintes pour les profils ∉ {1, 3, 7}. */
  protected readonly positions = computed(() => {
    const allowed = allowedPositionsFor(this.auth.profil() ?? 0);
    return this.ref.activePositions().filter((p) => allowed.includes(p.id_pos_service));
  });

  protected readonly readOnly = computed(() => !!this.readOnlyReason());
  protected readonly readOnlyReason = computed(() => {
    if (!this.auth.canWritePlanning()) return 'Votre profil est en consultation.';
    const e = this.existing();
    if (e && this.auth.profil() === 4 && RESTRICTED_POSITIONS.includes(e.id_pos_service)) {
      return 'Les positions Alerte et Formateur ne peuvent être modifiées que par un référent ou le GIGN.';
    }
    return null;
  });

  protected readonly title = computed(() => (this.existing() ? 'Plage de planning' : 'Nouveau créneau de planning'));

  constructor() {
    this.userQuery$
      .pipe(
        debounceTime(250),
        switchMap((q) => (q.trim().length >= 2 ? this.usersApi.search(q).pipe(catchError(() => of([]))) : of([]))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((list) => this.userCandidates.set(list));
  }

  ngOnInit(): void {
    const i = this.init();
    const e = i.planning;
    if (e) {
      this.nigend.set(e.nigend);
      this.userLabel.set(i.user?.label ?? e.nigend);
      this.dateDebut = e.date_debut;
      this.creneauDebut = e.id_creneaux_debut;
      this.dateFin = e.date_fin;
      this.creneauFin = e.id_creneaux_fin;
      this.position = e.id_pos_service;
      this.adresse = this.initialAddress = e.adresse_temp ?? '';
    } else {
      if (i.user) {
        this.nigend.set(i.user.nigend);
        this.userLabel.set(i.user.label);
      } else if (this.auth.profil() === 4) {
        // Un négociateur ne saisit que son propre planning
        const u = this.auth.user()!;
        this.nigend.set(u.nigend);
        this.userLabel.set(`${u.nigend} — ${u.prenom} ${u.nom}`);
      }
      this.dateDebut = this.dateFin = i.date ?? '';
      this.creneauDebut = i.creneau ?? Creneau.JOUR;
      this.creneauFin = i.creneau ?? Creneau.NUIT;
    }
  }

  setMode(m: Mode): void {
    this.mode.set(m);
    this.error.set(null);
    const e = this.existing()!;
    if (m === 'insert') {
      this.position = null;
      this.adresse = '';
      this.addressCandidate = null;
    } else {
      this.dateDebut = e.date_debut;
      this.creneauDebut = e.id_creneaux_debut;
      this.dateFin = e.date_fin;
      this.creneauFin = e.id_creneaux_fin;
      this.position = e.id_pos_service;
      this.adresse = this.initialAddress;
    }
  }

  onUserQuery(q: string): void {
    this.userQuery.set(q);
    this.nigend.set(null);
    this.userQuery$.next(q);
  }

  pickUser(u: UserDto): void {
    this.nigend.set(u.nigend);
    this.userQuery.set(`${u.nigend} — ${u.prenom} ${u.nom}`);
    this.userCandidates.set([]);
  }

  onAddress(c: GeocodeCandidate | null): void {
    this.addressCandidate = c;
  }

  protected fmt(d: string): string {
    return d.split('-').reverse().join('/');
  }

  protected crLabel(c: number): string {
    return c === 1 ? 'Jour' : 'Nuit';
  }

  private body() {
    const e = this.existing();
    const keepAddress = !!e && this.adresse === this.initialAddress && this.mode() === 'edit';
    const c = this.addressCandidate;
    return {
      nigend: this.nigend() ?? '',
      date_debut: this.dateDebut,
      id_creneaux_debut: Number(this.creneauDebut),
      date_fin: this.dateFin,
      id_creneaux_fin: Number(this.creneauFin),
      id_pos_service: Number(this.position),
      adresse_temp: c ? c.address : keepAddress ? (e!.adresse_temp ?? null) : null,
      x_adresse_temp: c ? c.x : keepAddress ? (e!.x_adresse_temp ?? null) : null,
      y_adresse_temp: c ? c.y : keepAddress ? (e!.y_adresse_temp ?? null) : null,
    };
  }

  async submit(): Promise<void> {
    this.error.set(null);
    if (!this.nigend()) return this.error.set('Sélectionnez un personnel.');
    if (this.position == null) return this.error.set('Choisissez une position de service.');
    const body = this.body();
    const v = validatePlageBounds(body);
    if (v) return this.error.set(v.message);
    const e = this.existing();
    if (this.mode() === 'insert' && e) {
      const r = computeInsertion(e, body);
      if (!r.ok) return this.error.set(r.violation.message);
    }
    this.saving.set(true);
    try {
      if (this.mode() === 'insert' && e) {
        await firstValueFrom(this.api.insert({ ...body, id_planning: e.id_planning }));
        this.toasts.success('Période insérée', 'La plage initiale a été découpée.');
      } else if (e) {
        await firstValueFrom(this.api.update(e.id_planning, body));
        this.toasts.success('Plage modifiée');
      } else {
        await firstValueFrom(this.api.create(body));
        this.toasts.success('Créneau enregistré');
      }
      this.saved.emit();
    } catch {
      /* erreur notifiée par l'intercepteur */
    } finally {
      this.saving.set(false);
    }
  }

  async remove(): Promise<void> {
    const e = this.existing();
    if (!e) return;
    const ok = await this.confirm.ask(
      'Supprimer la plage',
      `Supprimer définitivement la plage du ${this.fmt(e.date_debut)} au ${this.fmt(e.date_fin)} ?`,
      { confirmLabel: 'Supprimer', danger: true },
    );
    if (!ok) return;
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.remove(e.id_planning));
      this.toasts.success('Plage supprimée');
      this.saved.emit();
    } catch {
      /* notifié */
    } finally {
      this.saving.set(false);
    }
  }
}
