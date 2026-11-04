import { Body, Controller, Get, Put } from '@nestjs/common';
import { PERIMETRES, PERIMETRE_MODULES, Profil, type Perimetre, type PerimetreModule, type PerimetreUpdateDto } from '@rni/shared';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsIn, IsInt, ValidateNested } from 'class-validator';
import { AdminLogService } from '../../common/admin-log.service.js';
import { CurrentUser, type RniUser } from '../../common/auth/current-user.js';
import { Profiles } from '../../common/auth/decorators.js';
import { PerimetreService } from '../../common/auth/perimetre.service.js';

class PerimetreItem {
  @IsInt()
  id_profil: number;

  @IsIn(PERIMETRE_MODULES)
  module: PerimetreModule;

  @IsIn(PERIMETRES)
  perimetre: Perimetre;
}

class PerimetreUpdateBody implements PerimetreUpdateDto {
  @ValidateNested({ each: true })
  @Type(() => PerimetreItem)
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  items: PerimetreItem[];
}

/** Administration (super administrateur) : périmètres de visualisation par profil et par module. */
@Controller('admin')
@Profiles(Profil.SUPER_ADMIN)
export class AdminController {
  constructor(
    private readonly perimetre: PerimetreService,
    private readonly adminLog: AdminLogService,
  ) {}

  @Get('perimetres')
  perimetres() {
    return this.perimetre.matrix();
  }

  /** Applicable immédiatement (cache de 30 s au plus) ; tracé (BR-SEC-3). */
  @Put('perimetres')
  async update(@CurrentUser() user: RniUser, @Body() body: PerimetreUpdateBody) {
    const result = await this.perimetre.update(body, user.nigend);
    this.adminLog.trace('admin.perimetres', user.nigend, { items: body.items });
    return result;
  }
}
