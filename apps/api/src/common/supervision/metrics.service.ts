import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { localParts } from '@rni/shared';
import { Op, UniqueConstraintError } from 'sequelize';
import { RequestMetric, UserActivity } from '../../database/models/index.js';
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

const OPTS = { logging: false } as const;

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
      for (const a of aggs) await this.addMetric(a);
      const today = localParts(new Date(), 'Europe/Paris').date;
      for (const [nigend, u] of activity) await this.addActivity(nigend, u, today);
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

  /**
   * Ajout atomique aux compteurs de la minute (plusieurs workers écrivent la même ligne) :
   * incrément, sinon création ; création concurrente → nouvel incrément.
   */
  private async addMetric(a: Agg, retry = true): Promise<void> {
    const where = { minute: a.minute, route: a.route, methode: a.methode };
    const by = {
      nb: a.nb,
      nb_4xx: a.nb_4xx,
      nb_5xx: a.nb_5xx,
      nb_lentes: a.nb_lentes,
      duree_totale_ms: a.total,
      nb_lt100: a.lt100,
      nb_lt300: a.lt300,
      nb_lt1000: a.lt1000,
      nb_lt3000: a.lt3000,
    };
    if (await this.increment(RequestMetric, by, where)) {
      await RequestMetric.update({ duree_max_ms: a.max }, { where: { ...where, duree_max_ms: { [Op.lt]: a.max } }, ...OPTS });
      return;
    }
    try {
      await RequestMetric.create({ ...where, ...by, duree_max_ms: a.max }, OPTS);
    } catch (e) {
      if (retry && e instanceof UniqueConstraintError) return this.addMetric(a, false);
      throw e;
    }
  }

  /** Activité d'un utilisateur : compteur du jour (remis à zéro au changement de jour), dernière page. */
  private async addActivity(nigend: string, u: Activity, today: string, retry = true): Promise<void> {
    const sameDay = await this.increment(UserActivity, { nb_requetes_jour: u.count }, { nigend, jour: today });
    if (!sameDay) {
      const [newDay] = await UserActivity.update({ jour: today, nb_requetes_jour: u.count }, { where: { nigend, jour: { [Op.lt]: today } }, ...OPTS });
      if (!newDay) {
        try {
          await UserActivity.create({ nigend, jour: today, nb_requetes_jour: u.count, derniere_activite: u.last, derniere_route: u.route.slice(0, 256) }, OPTS);
          return;
        } catch (e) {
          if (retry && e instanceof UniqueConstraintError) return this.addActivity(nigend, u, today, false);
          throw e;
        }
      }
    }
    await UserActivity.update(
      { derniere_activite: u.last, derniere_route: u.route.slice(0, 256) },
      { where: { nigend, derniere_activite: { [Op.lt]: u.last } }, ...OPTS },
    );
  }

  /** `Model.increment` : nombre de lignes modifiées (0 si la ligne n'existe pas encore). */
  private async increment(model: typeof RequestMetric | typeof UserActivity, by: Record<string, number>, where: Record<string, unknown>): Promise<number> {
    // PostgreSQL : [[lignes modifiées, nombre]]
    const result = (await (model as typeof RequestMetric).increment(by, { where: where as never, ...OPTS })) as unknown as [[unknown[], number]];
    return Number(result?.[0]?.[1] ?? 0);
  }
}
