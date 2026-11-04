import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../../config/configuration.js';
import { pgClientConfig } from '../../database/migrator.js';
import { CacheService, CacheTag } from './cache.service.js';

export const CACHE_CHANNEL = 'rni_cache';
const TAGS = new Set<string>(Object.values(CacheTag));

/**
 * Invalidation du cache **partagée entre processus** (workers du cluster, instances sur plusieurs
 * serveurs) : une connexion dédiée écoute le canal PostgreSQL `rni_cache`, alimenté par les
 * déclencheurs de la migration 2.4.0 à chaque écriture validée — y compris hors API (import RPSI,
 * script SQL). Coupure de la connexion : cache vidé (des notifications ont pu être perdues), puis
 * reconnexion avec attente croissante ; les durées de vie bornent l'écart dans l'intervalle.
 */
@Injectable()
export class CacheNotifyService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CacheNotifyService.name);
  private client: pg.Client | null = null;
  private stopped = false;
  private retryMs = 1000;
  private timer: NodeJS.Timeout | null = null;
  /** Écoute active (exposé dans les statistiques du cache). */
  connected = false;
  received = 0;

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly cache: CacheService,
  ) {}

  get enabled(): boolean {
    return this.cfg.cache.enabled && this.cfg.cache.notify;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.enabled) await this.connect();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.client?.end().catch(() => undefined);
  }

  /** Diffuse une invalidation à tous les processus (actions d'exploitation). */
  async broadcast(payload: { tags?: CacheTag[]; clear?: boolean }): Promise<void> {
    if (!this.enabled || !this.client || !this.connected) return;
    await this.client.query('SELECT pg_notify($1, $2)', [CACHE_CHANNEL, JSON.stringify(payload)]).catch((e: Error) => {
      this.logger.warn(`Diffusion de l'invalidation impossible : ${e.message}`);
    });
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const client = new pg.Client({ ...pgClientConfig(this.cfg.db), application_name: 'rni-api-cache', keepAlive: true });
    client.on('notification', (n) => this.onNotification(n.payload));
    client.on('error', (e) => this.onLost(client, e));
    client.on('end', () => this.onLost(client));
    try {
      await client.connect();
      await client.query(`LISTEN ${CACHE_CHANNEL}`);
      this.client = client;
      if (this.retryMs > 1000) {
        // Reconnexion : des écritures ont pu passer sans notification
        this.cache.clear();
        this.logger.log('Écoute des invalidations rétablie (cache vidé par précaution).');
      } else {
        this.logger.log(`Écoute des invalidations du cache (canal ${CACHE_CHANNEL}).`);
      }
      this.connected = true;
      this.retryMs = 1000;
    } catch (e) {
      await client.end().catch(() => undefined);
      this.onLost(client, e as Error);
    }
  }

  private onLost(client: pg.Client, e?: Error): void {
    if (this.client && this.client !== client) return;
    if (this.stopped || this.timer) return;
    this.connected = false;
    this.client = null;
    this.logger.warn(`Écoute des invalidations interrompue${e ? ` (${e.message})` : ''} : nouvelle tentative dans ${this.retryMs / 1000} s.`);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.connect();
    }, this.retryMs);
    this.timer.unref();
    this.retryMs = Math.min(this.retryMs * 2, 30_000);
  }

  private onNotification(payload: string | undefined): void {
    this.received++;
    try {
      const p = JSON.parse(payload ?? '{}') as { tags?: string[]; clear?: boolean };
      if (p.clear) return this.cache.clear();
      const tags = (p.tags ?? []).filter((t): t is CacheTag => TAGS.has(t));
      if (tags.length) this.cache.invalidate(...tags);
    } catch {
      this.logger.warn(`Notification de cache illisible : ${payload}`);
    }
  }
}
