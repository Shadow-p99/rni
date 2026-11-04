import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, type RniUser } from '../../common/auth/current-user.js';
import { BusinessException } from '../../common/business.exception.js';
import { InsertPlanningBody, PlanningBody, PlanningUpdateBody } from './planning.dto.js';
import { PlanningService } from './planning.service.js';

const optInt = (v?: string) => (v == null || v === '' ? undefined : Number(v));

/** `positions=1,4,0` → [1, 4, 0] (0 = sans planning). */
function parsePositions(v?: string): number[] | undefined {
  if (!v) return undefined;
  const list = v.split(',').map((x) => Number(x.trim()));
  if (list.some((n) => !Number.isInteger(n) || n < 0 || n > 99)) throw BusinessException.invalid('Paramètre positions invalide (ex. 1,4,0).');
  return [...new Set(list)];
}

@Controller('planning')
export class PlanningController {
  constructor(private readonly service: PlanningService) {}

  /** Calendrier mensuel par région. */
  @Get('timetable')
  timetable(
    @CurrentUser() user: RniUser,
    @Query('month') month: string,
    @Query('region') region?: string,
    @Query('q') q?: string,
    @Query('positions') positions?: string,
  ) {
    return this.service.timetable(user, month, optInt(region), { q: q?.slice(0, 200), positions: parsePositions(positions) });
  }

  /** Points des personnels pour la carte (périmètre appliqué côté API). */
  @Get('geojson')
  geojson(@CurrentUser() user: RniUser) {
    return this.service.geojson(user);
  }

  @Get('byDateAndIdRegion/:date')
  byDateAndRegion(@CurrentUser() user: RniUser, @Param('date') date: string, @Query('region') region?: string) {
    return this.service.byDate(user, date, { region: optInt(region) });
  }

  @Get('byNigendAndDate/:nigend/:date')
  byNigendAndDate(@CurrentUser() user: RniUser, @Param('nigend') nigend: string, @Param('date') date: string) {
    return this.service.byDate(user, date, { nigend });
  }

  @Get('byPositionAndDate/:idPosition/:date')
  byPositionAndDate(@CurrentUser() user: RniUser, @Param('idPosition', ParseIntPipe) idPosition: number, @Param('date') date: string) {
    return this.service.byDate(user, date, { id_pos_service: idPosition });
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.service.get(id);
  }

  @Post()
  create(@CurrentUser() user: RniUser, @Body() body: PlanningBody) {
    return this.service.create(user, body);
  }

  /** Scission d'une plage existante (BR-PLA-9/10). */
  @Post('insert')
  insert(@CurrentUser() user: RniUser, @Body() body: InsertPlanningBody) {
    return this.service.insert(user, body);
  }

  @Put(':id')
  update(@CurrentUser() user: RniUser, @Param('id', ParseIntPipe) id: number, @Body() body: PlanningUpdateBody) {
    return this.service.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: RniUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(user, id);
  }
}
