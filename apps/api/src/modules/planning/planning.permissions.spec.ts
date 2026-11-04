import { PlanningService } from './planning.service.js';
import type { RniUser } from '../../common/auth/current-user.js';

const svc = Object.create(PlanningService.prototype) as PlanningService;
const me = (id_profil: number, id_user = 1, id_region = 11) => ({ id_profil, id_user, id_region }) as RniUser;

describe('PlanningService.assertCanWrite (BR-PLA-7)', () => {
  it('GIGN : tout le monde', () => {
    expect(() => svc.assertCanWrite(me(1), { id_user: 9, id_region: 84 })).not.toThrow();
  });
  it('référent / référent adjoint : sa région uniquement', () => {
    expect(() => svc.assertCanWrite(me(3), { id_user: 9, id_region: 11 })).not.toThrow();
    expect(() => svc.assertCanWrite(me(7), { id_user: 9, id_region: 84 })).toThrow();
  });
  it('négociateur : lui-même uniquement', () => {
    expect(() => svc.assertCanWrite(me(4, 5), { id_user: 5, id_region: 11 })).not.toThrow();
    expect(() => svc.assertCanWrite(me(4, 5), { id_user: 6, id_region: 11 })).toThrow();
  });
  it('profils de consultation : refus', () => {
    for (const p of [2, 5, 6]) expect(() => svc.assertCanWrite(me(p), { id_user: 1, id_region: 11 })).toThrow();
  });
});
