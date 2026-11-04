import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/configuration.js';

/**
 * Familles de données mises en cache. Une écriture invalide une étiquette : toutes les entrées
 * qui la portent sont supprimées.
 */
export const CacheTag = {
  /** Référentiels (positions, créneaux, profils, grades, départements, régions). */
  REFERENTIEL: 'referentiel',
  /** Comptes RNI (`ref_user`) : identité, profil, région, unité, téléphones. */
  USERS: 'users',
  /** Plannings (`planning`). */
  PLANNING: 'planning',
  /** Paramétrage (`t_param_app`, `t_perimetre_profil`). */
  PARAM: 'param',
  /** Réponses des services externes (Facade, GEOLOC, REMOP). */
  EXTERNAL: 'external',
} as const;
export type CacheTag = (typeof CacheTag)[keyof typeof CacheTag];

/** Durées de vie (ms). Elles bornent aussi l'effet des écritures faites hors API (imports SQL…). */
export const CacheTtl = {
  REFERENTIEL: 60 * 60_000,
  PARAM: 60_000,
  USER: 30_000,
  PLANNING: 5 * 60_000,
  /** Carte : positions GEOLOC en quasi temps réel. */
  LIVE: 15_000,
  EXTERNAL: 10 * 60_000,
  EXTERNAL_LONG: 60 * 60_000,
} as const;

/**
 * Réponse JSON **déjà sérialisée**, avec son ETag : sur un succès du cache, ni sérialisation ni
 * calcul d'empreinte ; un client à jour reçoit `304 Not Modified` (cf. JsonPayloadInterceptor).
 */
export class JsonPayload {
  private constructor(
    readonly body: string,
    readonly etag: string,
  ) {}

  static of(value: unknown): JsonPayload {
    const body = JSON.stringify(value);
    return new JsonPayload(body, `W/"${createHash('sha1').update(body).digest('base64url')}"`);
  }
}

interface Entry {
  value: unknown;
  expires: number;
  tags: readonly CacheTag[];
  /** Taille estimée en mémoire (octets). */
  bytes: number;
  /** Génération de chaque étiquette au moment du chargement (invalidation pendant un chargement). */
  gens: number[];
}

export interface CacheStats {
  enabled: boolean;
  entries: number;
  maxEntries: number;
  /** Mémoire estimée occupée / plafond (Mo). */
  sizeMb: number;
  maxMb: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  invalidations: Record<string, number>;
  byPrefix: Record<string, number>;
}

/**
 * Cache applicatif **en mémoire**, propre à chaque processus (invalidation partagée : CacheNotifyService) :
 * - `wrap(clé, ttl, chargeur, étiquettes)` : lecture ou chargement ; les chargements concurrents
 *   d'une même clé sont mutualisés (une seule requête SQL / un seul appel externe) ;
 * - `invalidate(étiquette)` après chaque écriture ;
 * - taille bornée (LRU), expiration par entrée ;
 * - une erreur du chargeur n'est jamais mise en cache.
 * `CACHE_ENABLED=false` désactive tout (chaque appel exécute le chargeur).
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, { promise: Promise<unknown>; tags: readonly CacheTag[] }>();
  private readonly generations = new Map<CacheTag, number>();
  private readonly enabled: boolean;
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private bytes = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private readonly invalidations: Record<string, number> = {};
  private readonly listeners: ((tags: readonly CacheTag[]) => void)[] = [];

  constructor(@Optional() @Inject(APP_CONFIG) cfg?: AppConfig) {
    this.enabled = cfg?.cache.enabled ?? true;
    this.maxEntries = cfg?.cache.maxEntries ?? 5000;
    this.maxBytes = (cfg?.cache.maxMb ?? 128) * 1024 * 1024;
  }

  async wrap<T>(key: string, ttlMs: number, load: () => Promise<T>, tags: readonly CacheTag[] = []): Promise<T> {
    if (!this.enabled || ttlMs <= 0) return load();
    const now = Date.now();
    const e = this.entries.get(key);
    if (e && e.expires > now && this.fresh(e)) {
      // LRU : l'entrée lue passe en fin d'ordre d'insertion
      this.entries.delete(key);
      this.entries.set(key, e);
      this.hits++;
      return e.value as T;
    }
    if (e) this.remove(key);
    const pending = this.inflight.get(key);
    if (pending) {
      this.hits++;
      return pending.promise as Promise<T>;
    }
    this.misses++;
    const gens = tags.map((t) => this.generations.get(t) ?? 0);
    // eslint-disable-next-line prefer-const
    let p!: Promise<T>;
    p = (async () => {
      try {
        // Toujours asynchrone : `p` est enregistré avant toute fin (même en cas d'exception immédiate)
        const t0 = Date.now();
        const value = await Promise.resolve().then(load);
        this.logger.verbose(`Chargé ${key} en ${Date.now() - t0} ms`);
        const entry: Entry = { value, expires: Date.now() + ttlMs, tags, gens, bytes: sizeOf(value) };
        // Invalidé pendant le chargement : la valeur sert cet appel mais n'est pas conservée.
        if (this.fresh(entry)) this.store(key, entry);
        return value;
      } finally {
        if (this.inflight.get(key)?.promise === p) this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, { promise: p, tags });
    return p;
  }

  /** Comme `wrap`, la valeur étant conservée sérialisée (grosses réponses : calendrier, carte). */
  wrapJson(key: string, ttlMs: number, load: () => Promise<unknown>, tags: readonly CacheTag[] = []): Promise<JsonPayload> {
    return this.wrap(key, ttlMs, async () => JsonPayload.of(await load()), tags);
  }

  /**
   * Abonnement aux invalidations (locales, ou reçues d'un autre processus par la notification
   * PostgreSQL) : ex. relecture des paramètres de journalisation quand `t_param_app` change.
   */
  onInvalidate(listener: (tags: readonly CacheTag[]) => void): void {
    this.listeners.push(listener);
  }

  private emit(tags: readonly CacheTag[]): void {
    for (const l of this.listeners) {
      try {
        l(tags);
      } catch (e) {
        this.logger.warn(`Abonné à l'invalidation en erreur : ${(e as Error).message}`);
      }
    }
  }

  /** Supprime toutes les entrées portant l'une des étiquettes. */
  invalidate(...tags: CacheTag[]): void {
    for (const t of tags) {
      this.generations.set(t, (this.generations.get(t) ?? 0) + 1);
      this.invalidations[t] = (this.invalidations[t] ?? 0) + 1;
    }
    for (const [k, e] of this.entries) if (e.tags.some((t) => tags.includes(t))) this.remove(k);
    // Les chargements en cours ne doivent plus être partagés avec les nouveaux appelants.
    for (const [k, f] of this.inflight) if (f.tags.some((t) => tags.includes(t))) this.inflight.delete(k);
    this.logger.verbose(`Invalidation : ${tags.join(', ')} (${this.entries.size} entrée(s) restante(s))`);
    this.emit(tags);
  }

  /** Supprime une entrée (ou toutes celles dont la clé commence par `prefix*`). */
  delete(key: string): void {
    if (key.endsWith('*')) {
      const prefix = key.slice(0, -1);
      for (const k of this.entries.keys()) if (k.startsWith(prefix)) this.remove(k);
      for (const k of this.inflight.keys()) if (k.startsWith(prefix)) this.inflight.delete(k);
    } else {
      this.remove(key);
      this.inflight.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
    this.inflight.clear();
    for (const t of Object.values(CacheTag)) this.generations.set(t, (this.generations.get(t) ?? 0) + 1);
    this.logger.debug('Cache vidé.');
    this.emit(Object.values(CacheTag));
  }

  stats(): CacheStats {
    const byPrefix: Record<string, number> = {};
    for (const k of this.entries.keys()) {
      const p = k.split(':')[0];
      byPrefix[p] = (byPrefix[p] ?? 0) + 1;
    }
    const total = this.hits + this.misses;
    return {
      enabled: this.enabled,
      entries: this.entries.size,
      maxEntries: this.maxEntries,
      sizeMb: Math.round((this.bytes / 1048576) * 10) / 10,
      maxMb: Math.round(this.maxBytes / 1048576),
      hits: this.hits,
      misses: this.misses,
      hitRate: total ? Math.round((this.hits / total) * 1000) / 1000 : 0,
      evictions: this.evictions,
      invalidations: { ...this.invalidations },
      byPrefix,
    };
  }

  private fresh(e: Entry): boolean {
    return e.tags.every((t, i) => (this.generations.get(t) ?? 0) === e.gens[i]);
  }

  private remove(key: string): void {
    const e = this.entries.get(key);
    if (!e) return;
    this.entries.delete(key);
    this.bytes -= e.bytes;
  }

  private store(key: string, entry: Entry): void {
    // Une réponse hors norme (> 1/4 du plafond) n'est pas conservée : elle évincerait tout le reste.
    if (entry.bytes > this.maxBytes / 4) return;
    this.remove(key);
    this.entries.set(key, entry);
    this.bytes += entry.bytes;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      this.remove(this.entries.keys().next().value as string);
      this.evictions++;
    }
  }
}

/** Estimation de l'empreinte mémoire d'une valeur (UTF-16 : 2 octets par caractère). */
function sizeOf(value: unknown): number {
  if (value instanceof JsonPayload) return value.body.length * 2 + 128;
  if (value instanceof Map) return value.size * 256 + 128;
  try {
    return (JSON.stringify(value)?.length ?? 16) * 2 + 128;
  } catch {
    return 4096;
  }
}

/** Clé stable d'une liste de régions (`null` = national). */
export function regionsKey(regions: readonly number[] | null | undefined): string {
  return regions == null ? 'nat' : [...regions].sort((a, b) => a - b).join(',') || 'none';
}
