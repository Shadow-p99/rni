import type { Portee } from '@rni/shared';
import { PlanningService } from './planning.service.js';
import type { RniUser } from '../../common/auth/current-user.js';

const svc = Object.create(PlanningService.prototype) as PlanningService;
/** Utilisateur dont le profil a le droit planning.ecrire avec la portée donnée (`null` = refusé). */
const me = (portee: Portee | null, id_user = 1, id_region = 11) =>
  ({ id_profil: 99, id_user, id_region, droits: portee ? { 'planning.ecrire': portee } : {} }) as unknown as RniUser;

describe('PlanningService.assertCanWrite (BR-PLA-7, portée du droit planning.ecrire)', () => {
  it('toutes les régions : tout le monde', () => {
    expect(() => svc.assertCanWrite(me('national'), { id_user: 9, id_region: 84 })).not.toThrow();
  });
  it('sa région uniquement', () => {
    expect(() => svc.assertCanWrite(me('region'), { id_user: 9, id_region: 11 })).not.toThrow();
    expect(() => svc.assertCanWrite(me('region'), { id_user: 9, id_region: 84 })).toThrow();
    expect(() => svc.assertCanWrite(me('region', 1, null as unknown as number), { id_user: 9, id_region: 11 })).toThrow();
  });
  it('lui-même uniquement', () => {
    expect(() => svc.assertCanWrite(me('soi', 5), { id_user: 5, id_region: 11 })).not.toThrow();
    expect(() => svc.assertCanWrite(me('soi', 5), { id_user: 6, id_region: 11 })).toThrow();
  });
  it('sans le droit : refus', () => {
    expect(() => svc.assertCanWrite(me(null), { id_user: 1, id_region: 11 })).toThrow();
  });
});
