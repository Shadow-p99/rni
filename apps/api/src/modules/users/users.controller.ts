import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ADMIN_PROFILS, Profil, isAdminProfil } from '@rni/shared';
import { CurrentUser, type RniUser } from '../../common/auth/current-user.js';
import { ALL_PROFILES, AllowUnknownUser, Profiles } from '../../common/auth/decorators.js';
import { ActivateLocationBody, CreateUserBody, InfoDeviceBody, UpdateUserBody } from './users.dto.js';
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

  /** BR-AUTH-5 : profils 1, 3, 7. */
  @Get('isAdmin')
  @AllowUnknownUser()
  @Header('Content-Type', 'application/json')
  isAdmin(@CurrentUser() user: RniUser | null): string {
    return JSON.stringify(!!user && isAdminProfil(user.id_profil));
  }

  @Get('me')
  me(@CurrentUser() user: RniUser) {
    return this.service.me(user);
  }

  @Get()
  @Profiles(...ADMIN_PROFILS)
  list(@CurrentUser() user: RniUser, @Query('region') region?: string) {
    return this.service.list(user, region ? Number(region) : undefined);
  }

  @Get('search')
  @Profiles(...ADMIN_PROFILS, Profil.NEGOCIATEUR)
  search(@CurrentUser() user: RniUser, @Query('q') q: string) {
    return this.service.planningCandidates(user, q);
  }

  @Get('rpsi')
  @Profiles(...ADMIN_PROFILS)
  rpsi(@CurrentUser() user: RniUser, @Query('q') q: string) {
    return this.service.searchRpsi(user, q);
  }

  @Post()
  @Profiles(...ADMIN_PROFILS)
  create(@CurrentUser() user: RniUser, @Body() body: CreateUserBody) {
    return this.service.create(user, body);
  }

  /** §7.4 : accessible à tous les profils (bypassPutUserForLocation). */
  @Put('infoDeviceUser')
  @Profiles(...ALL_PROFILES)
  infoDevice(@CurrentUser() user: RniUser, @Body() body: InfoDeviceBody) {
    return this.service.infoDevice(user, body.geoloc_id_geoloc ?? null);
  }

  @Put('activateLocation')
  @Profiles(...ALL_PROFILES)
  activateLocation(@CurrentUser() user: RniUser, @Body() body: ActivateLocationBody) {
    return this.service.activateLocation(user, body.isIndispo, body.value);
  }

  @Get(':id')
  @Profiles(...ADMIN_PROFILS)
  get(@Param('id', ParseIntPipe) id: number) {
    return this.service.getDetail(id);
  }

  @Put(':id')
  @Profiles(...ADMIN_PROFILS)
  update(@CurrentUser() user: RniUser, @Param('id', ParseIntPipe) id: number, @Body() body: UpdateUserBody) {
    return this.service.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Profiles(...ADMIN_PROFILS)
  remove(@CurrentUser() user: RniUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(user, id);
  }
}
