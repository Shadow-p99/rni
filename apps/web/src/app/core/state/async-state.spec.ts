import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { ActionState, AsyncState } from './async-state';

describe('AsyncState', () => {
  it('charge, expose loading puis data', async () => {
    const s = new AsyncState<number[]>([]);
    const p = s.load(() => of([1, 2]));
    expect(s.loading()).toBe(true);
    await p;
    expect(s.data()).toEqual([1, 2]);
    expect(s.loading()).toBe(false);
    expect(s.error()).toBeNull();
  });
  it('conserve l’erreur normalisée et permet de réessayer', async () => {
    const s = new AsyncState<number>(0);
    let fail = true;
    await s.load(() => (fail ? throwError(() => new HttpErrorResponse({ status: 0 })) : of(42)));
    expect(s.error()?.kind).toBe('network');
    fail = false;
    await s.reload();
    expect(s.error()).toBeNull();
    expect(s.data()).toBe(42);
  });
  it('ignore la réponse d’une requête dépassée', async () => {
    const s = new AsyncState<string>('');
    const slow = new Subject<string>();
    const first = s.load(() => slow);
    await s.load(() => of('récent'));
    slow.next('ancien');
    slow.complete();
    await first;
    expect(s.data()).toBe('récent');
  });
});

describe('ActionState', () => {
  it('renvoie le résultat ou l’erreur, refuse un double envoi', async () => {
    const a = new ActionState();
    const pending = new Subject<number>();
    const p1 = a.run(() => pending);
    expect(a.busy()).toBe(true);
    expect((await a.run(() => of(2))).ok).toBe(false);
    pending.next(1);
    pending.complete();
    expect(await p1).toEqual({ ok: true, value: 1 });
    const r = await a.run(() => throwError(() => new Error('x')));
    expect(r.ok).toBe(false);
    expect(a.error()?.detail).toBe('x');
  });
});
