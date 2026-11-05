import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { Droit } from '@rni/shared';
import { CurrentUser, type RniUser } from '../../common/auth/current-user.js';
import { AllowUnknownUser, AnyProfile, RequireDroit } from '../../common/auth/decorators.js';
import { ActivateLocationBody, CreateUserBody, InfoDeviceBody, UpdateUserBody, UserListQueryParams } from './users.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  /** BR-AUTH-2 : renvoie `false` (et non 401) pour un utilisateur inconnu — utilisé par les gardes. */
  @Get('isUser')
  @AllowUnknownUser()
  @Header('Content-Type', 'application/json')
  isUser(@CurrentUser() user: RniUser | null): string {
    return JSON.stringify(!!user);
  }

  /** BR-AUTH-5 : accès à la gestion du personnel (droit `gestion.acces`). */
  @Get('isAdmin')
  @AllowUnknownUser()
  @Header('Content-Type', 'application/json')
  isAdmin(@CurrentUser() user: RniUser | null): string {
    return JSON.stringify(!!user && !!user.droits[Droit.GESTION_ACCES]);
  }

  @Get('me')
  me(@CurrentUser() user: RniUser) {
    return this.service.me(user);
  }

  @Get()
  @RequireDroit(Droit.GESTION_ACCES)
  list(@CurrentUser() user: RniUser, @Query() query: UserListQueryParams) {
    return this.service.list(user, query);
  }

  @Get('search')
  @RequireDroit(Droit.PLANNING_ECRIRE)
  search(@CurrentUser() user: RniUser, @Query('q') q: string) {
    return this.service.planningCandidates(user, q);
  }

  @Get('rpsi')
  @RequireDroit(Droit.GESTION_ACCES)
  rpsi(@CurrentUser() user: RniUser, @Query('q') q: string) {
    return this.service.searchRpsi(user, q);
  }

  @Post()
  @RequireDroit(Droit.GESTION_ACCES)
  create(@CurrentUser() user: RniUser, @Body() body: CreateUserBody) {
    return this.service.create(user, body);
  }

  /** §7.4 : accessible à tous les profils (bypassPutUserForLocation). */
  @Put('infoDeviceUser')
  @AnyProfile()
  infoDevice(@CurrentUser() user: RniUser, @Body() body: InfoDeviceBody) {
    return this.service.infoDevice(user, body.geoloc_id_geoloc ?? null);
  }

  @Put('activateLocation')
  @AnyProfile()
  activateLocation(@CurrentUser() user: RniUser, @Body() body: ActivateLocationBody) {
    return this.service.activateLocation(user, body.isIndispo, body.value);
  }

  @Get(':id')
  @RequireDroit(Droit.GESTION_ACCES)
  get(@Param('id', ParseIntPipe) id: number) {
    return this.service.getDetail(id);
  }

  @Put(':id')
  @RequireDroit(Droit.GESTION_ACCES)
  update(@CurrentUser() user: RniUser, @Param('id', ParseIntPipe) id: number, @Body() body: UpdateUserBody) {
    return this.service.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireDroit(Droit.GESTION_ACCES)
  remove(@CurrentUser() user: RniUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(user, id);
  }
}
