import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { AdminController } from '../../modules/admin/admin.controller.js';
import { ParametrageController } from '../../modules/admin/parametrage.controller.js';
import { FormulaireController } from '../../modules/formulaire/formulaire.controller.js';
import { PlanningController } from '../../modules/planning/planning.controller.js';
import { UsersController } from '../../modules/users/users.controller.js';
import { ANY_PROFILE_KEY, DROIT_KEY, PUBLIC_KEY } from './decorators.js';

const CONTROLLERS = [AdminController, ParametrageController, FormulaireController, PlanningController, UsersController];

describe('routes d’écriture : droit déclaré', () => {
  it('chaque POST / PUT / DELETE exige un droit (sinon refus par l’AuthGuard)', () => {
    const missing: string[] = [];
    for (const ctrl of CONTROLLERS) {
      for (const name of Object.getOwnPropertyNames(ctrl.prototype)) {
        const handler = (ctrl.prototype as Record<string, unknown>)[name];
        if (typeof handler !== 'function' || name === 'constructor') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (method == null || method === RequestMethod.GET) continue;
        const declared = [DROIT_KEY, ANY_PROFILE_KEY, PUBLIC_KEY].some((k) => Reflect.getMetadata(k, handler) ?? Reflect.getMetadata(k, ctrl));
        if (!declared) missing.push(`${ctrl.name}.${name} (${Reflect.getMetadata(PATH_METADATA, handler)})`);
      }
    }
    expect(missing).toEqual([]);
  });
});
