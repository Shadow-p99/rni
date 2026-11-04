import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Db } from '../../database/db.service.js';
import { currentLogSettings } from '../logging/log-settings.service.js';

interface Agg {
  minute: Date;
  route: string;
  methode: string;
  nb: number;
  nb_4xx: number;
  nb_5xx: number;
  nb_lentes: number;
  total: number;
  max: number;
  lt100: number;
  lt300: number;
  lt1000: number;
  lt3000: number;
}

interface Activity {
  last: Date;
  route: string;
  count: number;
}

const FLUSH_MS = 10_000;

/** Motif de route : `/rni/api/planning/:id` plutôt que chaque identifiant (agrégation bornée). */
export function routePattern(matched: string | undefined, path: string): string {
  if (matched && matched !== '*' && !matched.includes('*')) return matched.slice(0, 256);
  return path
    .split('?')[0]
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(/\/\d{4}-\d{2}-\d{2}(?=\/|$)/g, '/:date')
    .replace(/\/[0-9a-f-]{32,36}(?=\/|$)/gi, '/:uuid')
    .slice(0, 256);
}

/**
 * Métriques des requêtes HTTP et activité des utilisateurs, **agrégées en mémoire** par minute,
 * route et méthode, puis ajoutées en base toutes les 10 s (`INSERT … ON CONFLICT DO UPDATE` qui
 * additionne) : chaque worker et chaque serveur contribue aux mêmes lignes, sans coordination.
 */
@Injectable()
export class MetricsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MetricsService.name);
  private aggs = new Map<string, Agg>();
  private activity = new Map<string, Activity>();
  private timer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> | null = null;

  constructor(private readonly db: Db) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }

  record(methode: string, route: string, status: number, ms: number, nigend: string | null, at = new Date()): void {
    const minute = new Date(Math.floor(at.getTime() / 60_000) * 60_000);
    const key = `${minute.getTime()}|${methode}|${route}`;
    let a = this.aggs.get(key);
    if (!a) {
      a = { minute, route, methode, nb: 0, nb_4xx: 0, nb_5xx: 0, nb_lentes: 0, total: 0, max: 0, lt100: 0, lt300: 0, lt1000: 0, lt3000: 0 };
      this.aggs.set(key, a);
    }
    a.nb++;
    if (status >= 500) a.nb_5xx++;
    else if (status >= 400) a.nb_4xx++;
    if (ms >= currentLogSettings.slowMs) a.nb_lentes++;
    a.total += ms;
    a.max = Math.max(a.max, ms);
    if (ms < 100) a.lt100++;
    else if (ms < 300) a.lt300++;
    else if (ms < 1000) a.lt1000++;
    else if (ms < 3000) a.lt3000++;

    if (nigend) {
      const u = this.activity.get(nigend);
      if (!u) this.activity.set(nigend, { last: at, route, count: 1 });
      else {
        u.count++;
        if (at >= u.last) Object.assign(u, { last: at, route });
      }
    }
  }

  /** Écrit les agrégats en attente (appels concurrents mutualisés ; remis en attente si la base échoue). */
  flush(): Promise<void> {
    this.flushing ??= this.write().finally(() => (this.flushing = null));
    return this.flushing;
  }

  private async write(): Promise<void> {
    const aggs = [...this.aggs.values()];
    const activity = [...this.activity.entries()];
    if (!aggs.length && !activity.length) return;
    this.aggs = new Map();
    this.activity = new Map();
    try {
      if (aggs.length) {
        const values: unknown[] = [];
        const rows = aggs.map((a, i) => {
          values.push(a.minute, a.route, a.methode, a.nb, a.nb_4xx, a.nb_5xx, a.nb_lentes, a.total, a.max, a.lt100, a.lt300, a.lt1000, a.lt3000);
          const o = i * 13;
          return `(${Array.from({ length: 13 }, (_, k) => `$${o + k + 1}`).join(',')})`;
        });
        await this.db.sequelize.query(
          `INSERT INTO t_request_metrics (minute, route, methode, nb, nb_4xx, nb_5xx, nb_lentes, duree_totale_ms, duree_max_ms, nb_lt100, nb_lt300, nb_lt1000, nb_lt3000)
           VALUES ${rows.join(',')}
           ON CONFLICT (minute, route, methode) DO UPDATE SET
             nb = t_request_metrics.nb + EXCLUDED.nb,
             nb_4xx = t_request_metrics.nb_4xx + EXCLUDED.nb_4xx,
             nb_5xx = t_request_metrics.nb_5xx + EXCLUDED.nb_5xx,
             nb_lentes = t_request_metrics.nb_lentes + EXCLUDED.nb_lentes,
             duree_totale_ms = t_request_metrics.duree_totale_ms + EXCLUDED.duree_totale_ms,
             duree_max_ms = GREATEST(t_request_metrics.duree_max_ms, EXCLUDED.duree_max_ms),
             nb_lt100 = t_request_metrics.nb_lt100 + EXCLUDED.nb_lt100,
             nb_lt300 = t_request_metrics.nb_lt300 + EXCLUDED.nb_lt300,
             nb_lt1000 = t_request_metrics.nb_lt1000 + EXCLUDED.nb_lt1000,
             nb_lt3000 = t_request_metrics.nb_lt3000 + EXCLUDED.nb_lt3000`,
          { bind: values, type: QueryTypes.INSERT, logging: false },
        );
      }
      if (activity.length) {
        const values: unknown[] = [];
        const rows = activity.map(([nigend, u], i) => {
          values.push(nigend, u.last, u.route.slice(0, 256), u.count);
          const o = i * 4;
          return `($${o + 1}, $${o + 2}::timestamptz, $${o + 3}, ($${o + 2}::timestamptz AT TIME ZONE 'Europe/Paris')::date, $${o + 4}::int)`;
        });
        await this.db.sequelize.query(
          `INSERT INTO t_user_activity AS t (nigend, derniere_activite, derniere_route, jour, nb_requetes_jour)
           VALUES ${rows.join(',')}
           ON CONFLICT (nigend) DO UPDATE SET
             nb_requetes_jour = CASE WHEN t.jour = EXCLUDED.jour THEN t.nb_requetes_jour + EXCLUDED.nb_requetes_jour ELSE EXCLUDED.nb_requetes_jour END,
             derniere_route = CASE WHEN EXCLUDED.derniere_activite >= t.derniere_activite THEN EXCLUDED.derniere_route ELSE t.derniere_route END,
             jour = GREATEST(t.jour, EXCLUDED.jour),
             derniere_activite = GREATEST(t.derniere_activite, EXCLUDED.derniere_activite)`,
          { bind: values, type: QueryTypes.INSERT, logging: false },
        );
      }
      this.logger.verbose(`Métriques écrites : ${aggs.length} agrégat(s), ${activity.length} utilisateur(s)`);
    } catch (e) {
      // Base indisponible : remise en attente (fusion) pour le prochain essai
      for (const a of aggs) {
        const key = `${a.minute.getTime()}|${a.methode}|${a.route}`;
        const cur = this.aggs.get(key);
        if (!cur) this.aggs.set(key, a);
        else
          Object.assign(cur, {
            nb: cur.nb + a.nb,
            nb_4xx: cur.nb_4xx + a.nb_4xx,
            nb_5xx: cur.nb_5xx + a.nb_5xx,
            nb_lentes: cur.nb_lentes + a.nb_lentes,
            total: cur.total + a.total,
            max: Math.max(cur.max, a.max),
            lt100: cur.lt100 + a.lt100,
            lt300: cur.lt300 + a.lt300,
            lt1000: cur.lt1000 + a.lt1000,
            lt3000: cur.lt3000 + a.lt3000,
          });
      }
      for (const [n, u] of activity) if (!this.activity.has(n)) this.activity.set(n, u);
      this.logger.warn(`Écriture des métriques reportée : ${(e as Error).message}`);
    }
  }
}
