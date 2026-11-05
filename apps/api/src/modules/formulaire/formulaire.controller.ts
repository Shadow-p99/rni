import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { Droit } from '@rni/shared';
import { CurrentUser, type RniUser } from '../../common/auth/current-user.js';
import { RequireDroit } from '../../common/auth/decorators.js';
import { FormulaireConfigService } from './formulaire-config.service.js';
import { FormulaireService } from './formulaire.service.js';

/**
 * BR-FOR-1 appliqué côté serveur (dette §9.3) : droit `formulaire.voir` exigé, y compris en
 * lecture ; chaque action a son droit (Administration › Droits), la portée est contrôlée par le service.
 */
@Controller('formulaire')
@RequireDroit(Droit.FORMULAIRE_VOIR)
export class FormulaireController {
  constructor(
    private readonly service: FormulaireService,
    private readonly config: FormulaireConfigService,
  ) {}

  /** Structure de la fiche (libellés, champs obligatoires, types de crise) : paramétrée en base. */
  @Get('config')
  structure() {
    return this.config.config();
  }

  @Get()
  list(
    @CurrentUser() user: RniUser,
    @Query('region') region?: string,
    @Query('closed') closed?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.list(user, {
      region: region ? Number(region) : undefined,
      closed: closed === 'true' ? true : closed === 'false' ? false : undefined,
      from: from || undefined,
      to: to || undefined,
    });
  }

  @Get(':id')
  get(@CurrentUser() user: RniUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.get(user, id);
  }

  @Post()
  @RequireDroit(Droit.FORMULAIRE_CREER)
  create(@CurrentUser() user: RniUser, @Body() body: Record<string, unknown>) {
    return this.service.create(user, body);
  }

  @Put(':id')
  @RequireDroit(Droit.FORMULAIRE_MODIFIER)
  update(@CurrentUser() user: RniUser, @Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.update(user, id, body);
  }

  @Put(':id/close')
  @RequireDroit(Droit.FORMULAIRE_CLOTURER)
  close(@CurrentUser() user: RniUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.close(user, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireDroit(Droit.FORMULAIRE_SUPPRIMER)
  remove(@CurrentUser() user: RniUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(user, id);
  }
}
