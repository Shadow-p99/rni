import { Body, Controller, Delete, Get, HttpCode, Put, Query } from '@nestjs/common';
import type { AuditQuery } from '@rni/shared';
import { LOG_CONTEXT_PATTERN, LOG_DB_THRESHOLDS, LOG_DURATIONS, LOG_THRESHOLDS, MAX_LOG_CONTEXTS, type AppLogLevel, type LogContextLevel, type LogSettingsUpdateDto, type LogThreshold } from '@rni/shared';
import { NoAudit } from '../../common/auth/decorators.js';
import { DashboardService } from './dashboard.service.js';
import { AuditQueryService } from './audit-query.service.js';
import { Droit, PERIMETRES, PERIMETRE_MODULES, type Perimetre, type PerimetreModule, type PerimetreUpdateDto } from '@rni/shared';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, Matches, Max, Min, ValidateNested } from 'class-validator';
import { AdminLogService } from '../../common/admin-log.service.js';
import { CurrentUser, type RniUser } from '../../common/auth/current-user.js';
import { RequireDroit } from '../../common/auth/decorators.js';
import { PerimetreService } from '../../common/auth/perimetre.service.js';
import { BusinessException } from '../../common/business.exception.js';
import { CacheNotifyService } from '../../common/cache/cache-notify.service.js';
import { CacheService, CacheTag } from '../../common/cache/cache.service.js';
import { LogSettingsService } from '../../common/logging/log-settings.service.js';

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

class LogContextItem implements LogContextLevel {
  @Matches(LOG_CONTEXT_PATTERN, { message: 'Contexte invalide (lettres, chiffres, . _ -).' })
  contexte: string;

  @IsIn(LOG_THRESHOLDS)
  niveau: LogThreshold;
}

class LogSettingsBody implements LogSettingsUpdateDto {
  @IsIn(['', ...LOG_THRESHOLDS])
  level: LogThreshold | '';

  @IsArray()
  @ArrayMaxSize(MAX_LOG_CONTEXTS)
  @ValidateNested({ each: true })
  @Type(() => LogContextItem)
  contexts: LogContextItem[];

  @IsBoolean()
  sql: boolean;

  @IsInt()
  @Min(50)
  @Max(600_000)
  slow_ms: number;

  @IsIn(LOG_DB_THRESHOLDS)
  db_level: LogThreshold;

  @IsInt()
  @Min(1)
  @Max(3650)
  retention_days: number;

  @IsInt()
  @Min(1)
  @Max(3650)
  metrics_retention_days: number;

  @IsOptional()
  @IsIn(LOG_DURATIONS.filter((d) => d != null))
  duree_min: number | null;
}

/** Administration (super administrateur) : périmètres de visualisation par profil et par module. */
@Controller('admin')
@RequireDroit(Droit.ADMIN_ACCES)
export class AdminController {
  constructor(
    private readonly perimetre: PerimetreService,
    private readonly adminLog: AdminLogService,
    private readonly cache: CacheService,
    private readonly notify: CacheNotifyService,
    private readonly logs: LogSettingsService,
    private readonly dashboardService: DashboardService,
    private readonly audit: AuditQueryService,
  ) {}

  /**
   * Audit des requêtes (t_admin_log_splunk) : qui a appelé quoi, quand, avec quel résultat.
   * Non audité lui-même (consultation fréquente, pas d'action métier).
   */
  @Get('audit')
  @NoAudit()
  auditSearch(@Query() q: AuditQuery) {
    return this.audit.search(q);
  }

  /** Tableau de bord : activité, performances, erreurs, utilisateurs connectés, état du système. */
  @Get('dashboard')
  @NoAudit()
  dashboard() {
    return this.dashboardService.dashboard();
  }

  /** Journal applicatif conservé en base, filtré (niveau minimal, contexte, texte, requête, nigend). */
  @Get('journal')
  @NoAudit()
  journal(
    @Query('niveau') niveau?: AppLogLevel,
    @Query('contexte') contexte?: string,
    @Query('q') q?: string,
    @Query('request_id') request_id?: string,
    @Query('nigend') nigend?: string,
    @Query('avant') avant?: string,
    @Query('limite') limite?: string,
  ) {
    return this.dashboardService.journal({ niveau, contexte, q, request_id, nigend, avant: avant ? Number(avant) : undefined, limite: limite ? Number(limite) : undefined });
  }

  /** Réglages de journalisation : valeurs enregistrées, appliquées, par défaut, contextes connus. */
  @Get('logs')
  @NoAudit()
  logSettings() {
    return this.logs.describe();
  }

  /**
   * Modifie les réglages de journalisation : appliqués immédiatement par toutes les instances
   * (notification PostgreSQL) ; tracé (auteur, valeurs avant / après).
   */
  @Put('logs')
  async updateLogSettings(@CurrentUser() user: RniUser, @Body() body: LogSettingsBody) {
    const { before, after } = await this.logs.update({ ...body, duree_min: body.duree_min ?? null }, user.nigend);
    const changes = (Object.keys(after) as (keyof typeof after)[])
      .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
      .map((k) => `${k}: ${JSON.stringify(before[k])} → ${JSON.stringify(after[k])}`);
    this.adminLog.trace('admin.logs', user.nigend, { modifications: changes, duree_min: body.duree_min ?? null });
    return this.logs.describe();
  }

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
