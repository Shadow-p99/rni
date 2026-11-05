import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { MessageDto, MessageType, ParamAppDto } from '@rni/shared';
import { ParametrageApi } from '../../../core/api/parametrage.api';
import { ConfigService } from '../../../core/config/config.service';
import { ToastService } from '../../../core/notifications/toast.service';
import { HasUnsavedChanges } from '../../../core/platform/unsaved-changes.guard';
import { ActionState, AsyncState } from '../../../core/state/async-state';
import { AsyncView } from '../../../shared/ui/async-view';
import { ErrorPanel } from '../../../shared/ui/error-panel';
import { PageHeader } from '../../../shared/ui/page-header';

/**
 * Administration › Paramètres : valeurs de `t_param_app` (URL des services, jetons, permanence,
 * jours glissants du planning, couleur « sans planning »…) et libellés des messages d'erreur.
 * Les secrets ne sont jamais affichés : seule une nouvelle valeur peut être saisie.
 */
@Component({
  selector: 'rni-parametres-page',
  imports: [FormsModule, RouterLink, PageHeader, AsyncView, ErrorPanel],
  template: `
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-3 p-3 desk:p-4">
      <rni-page-header title="Administration — paramètres" subtitle="Paramètres applicatifs et messages affichés aux utilisateurs">
        <input class="input max-w-64" type="search" placeholder="Rechercher…" [ngModel]="q()" (ngModelChange)="q.set($event)" aria-label="Rechercher un paramètre" />
        <div actions class="flex gap-1">
          <button type="button" [class]="tab() === 'params' ? 'btn-primary' : 'btn-secondary'" (click)="tab.set('params')">Paramètres</button>
          <button type="button" [class]="tab() === 'messages' ? 'btn-primary' : 'btn-secondary'" (click)="tab.set('messages')">Messages</button>
        </div>
      </rni-page-header>
      <rni-error-panel [error]="action.error()" />

      @if (tab() === 'params') {
        <p class="card p-3 text-xs text-slate-600">
          Effet immédiat sur l'API (toutes les instances). Les paramètres « client » sont relus par les navigateurs à leur prochain chargement.
          Chaque modification est tracée (sans la valeur des secrets).
        </p>
        <rni-async-view class="card" [loading]="params.loading()" [pending]="params.pending()" [error]="params.error()" (retry)="loadParams()">
          <ul class="divide-y divide-slate-100">
            @for (p of filteredParams(); track p.cle) {
              <li class="grid grid-cols-1 gap-2 px-3 py-2.5 desk:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] desk:items-center">
                <div class="min-w-0">
                  <code class="text-xs font-semibold break-all text-slate-800">{{ p.cle }}</code>
                  @if (p.is_front) {
                    <span class="chip ml-1 bg-sky-100 text-sky-800">client</span>
                  }
                  @if (p.secret) {
                    <span class="chip ml-1 bg-amber-100 text-amber-800">secret</span>
                  }
                  @if (p.description) {
                    <span class="block text-xs text-slate-500">{{ p.description }}</span>
                  }
                </div>
                @if (p.gere_par) {
                  <div class="text-sm">
                    <span class="text-slate-700">{{ p.valeur || '—' }}</span>
                    <a class="ml-2 text-xs text-rni-700 hover:underline" routerLink="../journalisation">Réglé dans « {{ p.gere_par }} »</a>
                  </div>
                  <span></span>
                } @else {
                  <input
                    class="input"
                    [type]="p.secret ? 'password' : 'text'"
                    autocomplete="off"
                    [placeholder]="p.secret ? 'Nouvelle valeur (la valeur actuelle n’est pas affichée)' : ''"
                    [ngModel]="value(p)"
                    (ngModelChange)="setValue(p, $event)"
                    [attr.aria-label]="p.cle"
                    [class.!border-amber-500]="isChanged(p)"
                  />
                  <span class="flex justify-end gap-1">
                    @if (isChanged(p)) {
                      <button type="button" class="btn-ghost" (click)="reset(p)">Annuler</button>
                      <button type="button" class="btn-primary" (click)="saveParam(p)" [disabled]="action.busy()">Enregistrer</button>
                    }
                  </span>
                }
              </li>
            } @empty {
              <li class="px-3 py-6 text-center text-sm text-slate-500">Aucun paramètre ne correspond.</li>
            }
          </ul>
        </rni-async-view>
      } @else {
        <rni-async-view class="card" [loading]="messages.loading()" [pending]="messages.pending()" [error]="messages.error()" (retry)="loadMessages()">
          <ul class="divide-y divide-slate-100">
            @for (m of filteredMessages(); track m.code_message) {
              @let d = messageDraft(m);
              <li class="grid grid-cols-1 gap-2 px-3 py-2.5 desk:grid-cols-[8rem_minmax(0,1fr)_10rem_auto] desk:items-center">
                <code class="text-xs font-semibold">{{ m.code_message }}</code>
                <input class="input" maxlength="512" [ngModel]="d.libelle" (ngModelChange)="setMessage(m, { libelle: $event })" [attr.aria-label]="'Libellé ' + m.code_message" />
                <select class="input" [ngModel]="d.type" (ngModelChange)="setMessage(m, { type: $event })" [attr.aria-label]="'Type ' + m.code_message">
                  @for (t of types; track t) {
                    <option [ngValue]="t">{{ t }}</option>
                  }
                </select>
                <span class="flex justify-end gap-1">
                  @if (messageChanged(m)) {
                    <button type="button" class="btn-ghost" (click)="resetMessage(m)">Annuler</button>
                    <button type="button" class="btn-primary" (click)="saveMessage(m)" [disabled]="action.busy() || !d.libelle.trim()">Enregistrer</button>
                  }
                </span>
              </li>
            }
          </ul>
        </rni-async-view>
      }
    </div>
  `,
})
export class ParametresPage implements HasUnsavedChanges {
  private readonly api = inject(ParametrageApi);
  private readonly toasts = inject(ToastService);
  private readonly config = inject(ConfigService);
  protected readonly params = new AsyncState<ParamAppDto[]>([]);
  protected readonly messages = new AsyncState<MessageDto[]>([]);
  protected readonly action = new ActionState();
  protected readonly tab = signal<'params' | 'messages'>('params');
  protected readonly q = signal('');
  protected readonly types: MessageType[] = ['ERREUR', 'AVERTISSEMENT', 'INFO'];
  private readonly paramDraft = signal<Map<string, string>>(new Map());
  private readonly msgDraft = signal<Map<string, MessageDto>>(new Map());

  private readonly match = (...texts: (string | null | undefined)[]) => {
    const q = this.q().trim().toLocaleLowerCase('fr');
    return !q || texts.some((t) => t?.toLocaleLowerCase('fr').includes(q));
  };
  protected readonly filteredParams = computed(() => this.params.data().filter((p) => this.match(p.cle, p.description, p.secret ? '' : p.valeur)));
  protected readonly filteredMessages = computed(() => this.messages.data().filter((m) => this.match(m.code_message, m.libelle)));

  constructor() {
    void this.loadParams();
    void this.loadMessages();
  }

  loadParams(): Promise<unknown> {
    return this.params.load(() => this.api.params({ silent: true }));
  }

  loadMessages(): Promise<unknown> {
    return this.messages.load(() => this.api.messages({ silent: true }));
  }

  protected value(p: ParamAppDto): string {
    return this.paramDraft().get(p.cle) ?? (p.secret ? '' : (p.valeur ?? ''));
  }

  protected isChanged(p: ParamAppDto): boolean {
    return this.paramDraft().has(p.cle);
  }

  protected setValue(p: ParamAppDto, v: string): void {
    const d = new Map(this.paramDraft());
    if (!p.secret && v === (p.valeur ?? '')) d.delete(p.cle);
    else if (p.secret && !v) d.delete(p.cle);
    else d.set(p.cle, v);
    this.paramDraft.set(d);
    this.action.clear();
  }

  protected reset(p: ParamAppDto): void {
    const d = new Map(this.paramDraft());
    d.delete(p.cle);
    this.paramDraft.set(d);
  }

  protected async saveParam(p: ParamAppDto): Promise<void> {
    const valeur = this.paramDraft().get(p.cle);
    if (valeur == null) return;
    const r = await this.action.run(() => this.api.updateParam({ cle: p.cle, valeur }, { silent: true }));
    if (!r.ok) return;
    this.params.set(r.value);
    this.reset(p);
    if (p.is_front) void this.config.load();
    this.toasts.success('Paramètre enregistré', p.cle);
  }

  protected messageDraft(m: MessageDto): MessageDto {
    return this.msgDraft().get(m.code_message) ?? m;
  }

  protected messageChanged(m: MessageDto): boolean {
    return this.msgDraft().has(m.code_message);
  }

  protected setMessage(m: MessageDto, patch: Partial<MessageDto>): void {
    const next = { ...this.messageDraft(m), ...patch };
    const d = new Map(this.msgDraft());
    if (next.libelle === m.libelle && next.type === m.type) d.delete(m.code_message);
    else d.set(m.code_message, next);
    this.msgDraft.set(d);
    this.action.clear();
  }

  protected resetMessage(m: MessageDto): void {
    const d = new Map(this.msgDraft());
    d.delete(m.code_message);
    this.msgDraft.set(d);
  }

  protected async saveMessage(m: MessageDto): Promise<void> {
    const dto = this.msgDraft().get(m.code_message);
    if (!dto) return;
    const r = await this.action.run(() => this.api.updateMessage(dto, { silent: true }));
    if (!r.ok) return;
    this.messages.set(r.value);
    this.resetMessage(m);
    this.toasts.success('Message enregistré', m.code_message);
  }

  hasUnsavedChanges(): boolean {
    return this.paramDraft().size > 0 || this.msgDraft().size > 0;
  }
}
