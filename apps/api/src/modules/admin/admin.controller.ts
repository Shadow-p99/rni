import { Body, Controller, Delete, Get, HttpCode, Put, Query } from '@nestjs/common';
import { PERIMETRES, PERIMETRE_MODULES, Profil, type Perimetre, type PerimetreModule, type PerimetreUpdateDto } from '@rni/shared';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsIn, IsInt, ValidateNested } from 'class-validator';
import { AdminLogService } from '../../common/admin-log.service.js';
import { CurrentUser, type RniUser } from '../../common/auth/current-user.js';
import { Profiles } from '../../common/auth/decorators.js';
import { PerimetreService } from '../../common/auth/perimetre.service.js';
import { BusinessException } from '../../common/business.exception.js';
import { CacheNotifyService } from '../../common/cache/cache-notify.service.js';
import { CacheService, CacheTag } from '../../common/cache/cache.service.js';

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
    private readonly cache: CacheService,
    private readonly notify: CacheNotifyService,
  ) {}

  /** Exploitation : état du cache applicatif (entrées, taux de succès, invalidations). */
  @Get('cache')
  cacheStats() {
    // Statistiques du processus qui répond (en cluster : un worker parmi d'autres)
    return { ...this.cache.stats(), pid: process.pid, notify: { enabled: this.notify.enabled, connected: this.notify.connected, received: this.notify.received } };
  }

  /**
   * Exploitation : vide le cache (tout, ou une famille `?tag=planning|users|referentiel|param|external`),
   * par exemple après une modification directe en base ou un import RPSI.
   */
  @Delete('cache')
  @HttpCode(200)
  async clearCache(@CurrentUser() user: RniUser, @Query('tag') tag?: string) {
    const tags = Object.values(CacheTag) as string[];
    if (tag != null && !tags.includes(tag)) throw BusinessException.invalid(`Famille inconnue (${tags.join(', ')}).`);
    if (tag) this.cache.invalidate(tag as CacheTag);
    else this.cache.clear();
    // Tous les processus (workers, autres instances) vident aussi leur cache
    await this.notify.broadcast(tag ? { tags: [tag as CacheTag] } : { clear: true });
    this.adminLog.trace('admin.cache.clear', user.nigend, { tag: tag ?? 'tout' });
    return this.cache.stats();
  }

  @Get('perimetres')
  perimetres() {
    return this.perimetre.matrix();
  }

  /** Applicable immédiatement (cache invalidé) ; tracé (BR-SEC-3). */
  @Put('perimetres')
  async update(@CurrentUser() user: RniUser, @Body() body: PerimetreUpdateBody) {
    const result = await this.perimetre.update(body, user.nigend);
    this.adminLog.trace('admin.perimetres', user.nigend, { items: body.items });
    return result;
  }
}
