import { Signal, WritableSignal, computed, signal } from '@angular/core';
import { Observable, firstValueFrom, isObservable } from 'rxjs';
import { AppError, toAppError } from '../errors/app-error';

/**
 * État asynchrone d'une donnée chargée depuis l'API : `data`, `loading`, `error`.
 * Une seule requête « gagnante » : un chargement plus récent invalide les précédents.
 */
export class AsyncState<T> {
  private readonly initial: T;
  private readonly _data: WritableSignal<T>;
  private readonly _loading = signal(false);
  private readonly _error = signal<AppError | null>(null);
  private seq = 0;
  private last: (() => Observable<T> | Promise<T>) | null = null;

  private readonly loadedOnce = signal(false);
  readonly data: Signal<T>;
  readonly loading: Signal<boolean> = this._loading.asReadonly();
  readonly error: Signal<AppError | null> = this._error.asReadonly();
  /** Premier chargement en cours (aucune donnée encore affichable). */
  readonly pending = computed(() => this._loading() && !this.loadedOnce());

  constructor(initial: T) {
    this.initial = initial;
    this._data = signal<T>(initial);
    this.data = this._data.asReadonly();
  }

  /** Charge la donnée ; l'erreur est conservée dans `error` (et renvoyée normalisée). */
  async load(source: () => Observable<T> | Promise<T>): Promise<T | null> {
    const id = ++this.seq;
    this.last = source;
    this._loading.set(true);
    this._error.set(null);
    try {
      const s = source();
      const value = isObservable(s) ? await firstValueFrom(s) : await s;
      if (id === this.seq) {
        this._data.set(value);
        this.loadedOnce.set(true);
      }
      return value;
    } catch (e) {
      if (id === this.seq) this._error.set(toAppError(e));
      return null;
    } finally {
      if (id === this.seq) this._loading.set(false);
    }
  }

  /** Relance le dernier chargement (bouton « Réessayer »). */
  reload(): Promise<T | null> {
    return this.last ? this.load(this.last) : Promise.resolve(null);
  }

  set(value: T): void {
    this._data.set(value);
  }

  update(fn: (v: T) => T): void {
    this._data.update(fn);
  }

  reset(): void {
    this.seq++;
    this._data.set(this.initial);
    this._error.set(null);
    this._loading.set(false);
    this.loadedOnce.set(false);
  }
}

/**
 * Exécution d'une action (enregistrement, suppression…) : `busy` pendant l'appel, `error` en cas d'échec.
 * Renvoie `true` si l'action a réussi.
 */
export class ActionState {
  private readonly _busy = signal(false);
  private readonly _error = signal<AppError | null>(null);
  readonly busy = this._busy.asReadonly();
  readonly error = this._error.asReadonly();

  async run<R>(fn: () => Observable<R> | Promise<R>): Promise<{ ok: true; value: R } | { ok: false; error: AppError }> {
    if (this._busy()) return { ok: false, error: new AppError('unexpected', 'Action déjà en cours') };
    this._busy.set(true);
    this._error.set(null);
    try {
      const s = fn();
      const value = isObservable(s) ? await firstValueFrom(s) : await s;
      return { ok: true, value };
    } catch (e) {
      const error = toAppError(e);
      this._error.set(error);
      return { ok: false, error };
    } finally {
      this._busy.set(false);
    }
  }

  clear(): void {
    this._error.set(null);
  }
}
