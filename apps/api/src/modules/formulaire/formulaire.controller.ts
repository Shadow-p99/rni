import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { Profil } from '@rni/shared';
import { CurrentUser, type RniUser } from '../../common/auth/current-user.js';
import { Profiles } from '../../common/auth/decorators.js';
import { FormulaireService } from './formulaire.service.js';

/** BR-FOR-1 appliqué côté serveur (dette §9.3) : profils 2, 5, 6 exclus, y compris en lecture. */
@Controller('formulaire')
@Profiles(Profil.GIGN, Profil.REFERENT, Profil.REFERENT_ADJOINT, Profil.NEGOCIATEUR)
export class FormulaireController {
  constructor(private readonly service: FormulaireService) {}

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
  create(@CurrentUser() user: RniUser, @Body() body: Record<string, unknown>) {
    return this.service.create(user, body);
  }

  @Put(':id')
  update(@CurrentUser() user: RniUser, @Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.update(user, id, body);
  }

  @Put(':id/close')
  close(@CurrentUser() user: RniUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.close(user, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: RniUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(user, id);
  }
}
