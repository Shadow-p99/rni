import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AdminDashboardDto, AppLogDto, AppLogLevel, AppLogPageDto, AppLogQuery, ConnectedUserDto, DashboardHourDto, DashboardRouteDto } from '@rni/shared';
import { CacheNotifyService } from '../../common/cache/cache-notify.service.js';
import { CacheService } from '../../common/cache/cache.service.js';
import { logSink } from '../../common/logging/log-sink.js';
import { LogSettingsService } from '../../common/logging/log-settings.service.js';
import { LOG_LEVELS } from '../../common/runtime/logger.js';
import { LifecycleService } from '../../common/runtime/lifecycle.service.js';
import { APP_CONFIG, type AppConfig } from '../../config/configuration.js';
import { Db } from '../../database/db.service.js';
import { ParamService } from '../external/param.service.js';

const VERSION = (() => {
  try {
    return (JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as { version: string }).version;
  } catch {
    return '0.0.0';
  }
})();

/** Début de la journée en cours, heure de Paris (les compteurs « du jour » en dépendent). */
const DAY_START = `(date_trunc('day', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris')`;

const LOG_COLUMNS = `id_log::int AS id_log, to_char(horodatage AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS horodatage,
  niveau, contexte, message, pile, request_id, nigend, pid, hote`;

interface MetricsTotals {
  nb: number;
  nb_4xx: number;
  nb_5xx: number;
  nb_lentes: number;
  total_ms: number;
  lt100: number;
  lt300: number;
  lt1000: number;
  lt3000: number;
}

/** Borne supérieure approchée du 95e centile à partir de la répartition des durées. */
export function p95(t: Pick<MetricsTotals, 'nb' | 'lt100' | 'lt300' | 'lt1000' | 'lt3000'>): number | null {
  if (!t.nb) return null;
  const target = t.nb * 0.95;
  let acc = 0;
  for (const [count, bound] of [
    [t.lt100, 100],
    [t.lt300, 300],
    [t.lt1000, 1000],
    [t.lt3000, 3000],
  ] as const) {
    acc += count;
    if (acc >= target) return bound;
  }
  return null;
}

const int = (v: unknown) => Number(v ?? 0) || 0;

/**
 * Tableau de bord d'administration : activité, performances et erreurs de **toutes** les instances
 * (données en base, alimentées par chaque processus), état du processus qui répond, indicateurs
 * métier. Résultat mutualisé 15 s entre les administrateurs.
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly db: Db,
    private readonly params: ParamService,
    private readonly cache: CacheService,
    private readonly notify: CacheNotifyService,
    private readonly logs: LogSettingsService,
    private readonly lifecycle: LifecycleService,
  ) {}

  dashboard(): Promise<AdminDashboardDto> {
    return this.cache.wrap('admin:dashboard', 15_000, () => this.build());
  }

  private async build(): Promise<AdminDashboardDto> {
    const t0 = Date.now();
    const windowMin = Math.min(Math.max(int(await this.params.get('rni.dashboard.active_minutes')) || 5, 1), 120);

    const totals = (where: string) =>
      this.db.one<MetricsTotals>(
        `SELECT COALESCE(sum(nb),0)::int AS nb, COALESCE(sum(nb_4xx),0)::int AS nb_4xx, COALESCE(sum(nb_5xx),0)::int AS nb_5xx,
                COALESCE(sum(nb_lentes),0)::int AS nb_lentes, COALESCE(sum(duree_totale_ms),0)::bigint AS total_ms,
                COALESCE(sum(nb_lt100),0)::int AS lt100, COALESCE(sum(nb_lt300),0)::int AS lt300,
                COALESCE(sum(nb_lt1000),0)::int AS lt1000, COALESCE(sum(nb_lt3000),0)::int AS lt3000
           FROM t_request_metrics WHERE ${where}`,
      );

    const [day, hour, last5, levels, hours, routes, connected, todayUsers, lastErrors, metier, profils, base, journal] = await Promise.all([
      totals(`minute >= ${DAY_START}`),
      totals(`minute >= now() - interval '1 hour'`),
      totals(`minute >= date_trunc('minute', now()) - interval '5 minutes'`),
      this.db.select<{ niveau: string; nb: number }>(
        `SELECT niveau, count(*)::int AS nb FROM t_app_logs WHERE horodatage >= ${DAY_START} AND niveau IN ('fatal','error','warn') GROUP BY niveau`,
      ),
      this.db.select<{ heure: string; nb: number; nb_4xx: number; nb_5xx: number; total: number; max_ms: number }>(
        `SELECT to_char(h.heure AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS heure,
                COALESCE(sum(m.nb),0)::int AS nb, COALESCE(sum(m.nb_4xx),0)::int AS nb_4xx, COALESCE(sum(m.nb_5xx),0)::int AS nb_5xx,
                COALESCE(sum(m.duree_totale_ms),0)::bigint AS total, COALESCE(max(m.duree_max_ms),0)::int AS max_ms
           FROM generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') AS h(heure)
           LEFT JOIN t_request_metrics m ON m.minute >= h.heure AND m.minute < h.heure + interval '1 hour'
          GROUP BY h.heure ORDER BY h.heure`,
      ),
      this.db.select<MetricsTotals & { methode: string; route: string; max_ms: number }>(
        `SELECT methode, route, sum(nb)::int AS nb, sum(nb_5xx)::int AS nb_5xx, sum(duree_totale_ms)::bigint AS total_ms,
                max(duree_max_ms)::int AS max_ms, sum(nb_lt100)::int AS lt100, sum(nb_lt300)::int AS lt300,
                sum(nb_lt1000)::int AS lt1000, sum(nb_lt3000)::int AS lt3000
           FROM t_request_metrics WHERE minute >= ${DAY_START}
          GROUP BY methode, route ORDER BY sum(duree_totale_ms) DESC LIMIT 10`,
      ),
      this.db.select<ConnectedUserDto>(
        `SELECT a.nigend, u.grade, u.nom, u.prenom, u.libelle_profil, u.libelle_region,
                to_char(a.derniere_activite AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS derniere_activite,
                a.derniere_route, CASE WHEN a.jour = (now() AT TIME ZONE 'Europe/Paris')::date THEN a.nb_requetes_jour ELSE 0 END AS nb_requetes_jour
           FROM t_user_activity a LEFT JOIN v_user_detail u ON u.nigend = a.nigend
          WHERE a.derniere_activite >= now() - make_interval(mins => :w)
          ORDER BY a.derniere_activite DESC LIMIT 100`,
        { w: windowMin },
      ),
      this.db.one<{ nb: number; connectes: number }>(
        `SELECT count(*) FILTER (WHERE jour = (now() AT TIME ZONE 'Europe/Paris')::date)::int AS nb,
                count(*) FILTER (WHERE derniere_activite >= now() - make_interval(mins => :w))::int AS connectes
           FROM t_user_activity`,
        { w: windowMin },
      ),
      this.db.select<AppLogDto>(`SELECT ${LOG_COLUMNS} FROM t_app_logs WHERE niveau IN ('fatal','error') ORDER BY id_log DESC LIMIT 10`),
      this.db.one<{ crees: number; modifies: number; comptes: number; fiches_ouvertes: number; fiches_jour: number }>(
        `SELECT (SELECT count(*) FROM planning WHERE created_at >= ${DAY_START})::int AS crees,
                (SELECT count(*) FROM planning WHERE updated_at >= ${DAY_START} AND created_at < ${DAY_START})::int AS modifies,
                (SELECT count(*) FROM ref_user WHERE NOT bool_user_inactif)::int AS comptes,
                (SELECT count(*) FROM t_formulaire WHERE NOT is_closed)::int AS fiches_ouvertes,
                (SELECT count(*) FROM t_formulaire WHERE created_at >= ${DAY_START})::int AS fiches_jour`,
      ),
      this.db.select<{ libelle: string; nb: number }>(
        `SELECT p.libelle, count(u.id_user)::int AS nb FROM ref_profil p
           LEFT JOIN ref_user u ON u.id_profil = p.id_profil AND NOT u.bool_user_inactif
           LEFT JOIN t_profil_classement c ON c.id_profil = p.id_profil
          GROUP BY p.id_profil, p.libelle, c.classement ORDER BY COALESCE(c.classement, 99)`,
      ),
      this.db.one<{ nom: string; taille: number; connexions: number; version: string; migration: string | null }>(
        `SELECT current_database() AS nom, (pg_database_size(current_database()) / 1048576.0)::numeric(12,1)::float AS taille,
                (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND application_name LIKE 'rni-api%')::int AS connexions,
                split_part(current_setting('server_version'), ' ', 1) AS version,
                (SELECT max(version) FROM t_schema_migrations) AS migration`,
      ),
      this.db.one<{ lignes: number; plus_ancien: string | null }>(
        `SELECT (SELECT reltuples::bigint FROM pg_class WHERE relname = 't_app_logs')::int AS lignes,
                (SELECT to_char(min(horodatage) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM t_app_logs) AS plus_ancien`,
      ),
    ]);

    const d = day!;
    const h = hour!;
    const byLevel = Object.fromEntries(levels.map((l) => [l.niveau, l.nb]));
    const avg = (t: MetricsTotals) => (t.nb ? Math.round(int(t.total_ms) / t.nb) : null);
    const totalDayMs = int(d.total_ms);
    const stats = this.cache.stats();
    const s = this.logs.settings;
    const mem = process.memoryUsage();

    const out: AdminDashboardDto = {
      genere_le: new Date().toISOString(),
      fenetre_connexion_min: windowMin,
      kpis: {
        connectes: todayUsers?.connectes ?? connected.length,
        utilisateurs_jour: todayUsers?.nb ?? 0,
        requetes_jour: d.nb,
        requetes_par_minute: Math.round((last5!.nb / 5) * 10) / 10,
        erreurs_jour: (byLevel['error'] ?? 0) + (byLevel['fatal'] ?? 0),
        erreurs_5xx_jour: d.nb_5xx,
        journal_erreurs_jour: (byLevel['error'] ?? 0) + (byLevel['fatal'] ?? 0),
        avertissements_jour: byLevel['warn'] ?? 0,
        refus_jour: d.nb_4xx,
        lentes_jour: d.nb_lentes,
        seuil_lent_ms: s.slowMs,
        temps_moyen_jour_ms: avg(d),
        temps_moyen_heure_ms: avg(h),
        p95_jour_ms: p95(d),
        disponibilite_jour: d.nb ? Math.round((1 - d.nb_5xx / d.nb) * 10_000) / 100 : null,
      },
      heures: hours.map<DashboardHourDto>((r) => ({
        heure: r.heure,
        nb: r.nb,
        nb_4xx: r.nb_4xx,
        nb_5xx: r.nb_5xx,
        moyenne_ms: r.nb ? Math.round(int(r.total) / r.nb) : null,
        max_ms: r.max_ms,
      })),
      routes: routes.map<DashboardRouteDto>((r) => ({
        methode: r.methode,
        route: r.route.replace(`/${this.cfg.prefix}`, '') || '/',
        nb: r.nb,
        nb_5xx: r.nb_5xx,
        moyenne_ms: r.nb ? Math.round(int(r.total_ms) / r.nb) : 0,
        max_ms: r.max_ms,
        p95_ms: p95(r),
        part_temps: totalDayMs ? Math.round((int(r.total_ms) / totalDayMs) * 1000) / 10 : 0,
      })),
      connectes: connected.map((c) => ({ ...c, derniere_route: c.derniere_route?.replace(`/${this.cfg.prefix}`, '') ?? null })),
      dernieres_erreurs: lastErrors,
      metier: {
        plannings_crees_jour: metier?.crees ?? 0,
        plannings_modifies_jour: metier?.modifies ?? 0,
        comptes_actifs: metier?.comptes ?? 0,
        comptes_par_profil: profils.filter((p) => p.nb > 0),
        fiches_ouvertes: metier?.fiches_ouvertes ?? 0,
        fiches_creees_jour: metier?.fiches_jour ?? 0,
      },
      systeme: {
        version: VERSION,
        environnement: this.cfg.env,
        node: process.version,
        pid: process.pid,
        hote: hostname(),
        demarre_le: this.lifecycle.startedAt.toISOString(),
        workers: this.cfg.runtime.workers,
        memoire_mo: { rss: Math.round(mem.rss / 1048576), tas: Math.round(mem.heapUsed / 1048576) },
        cache: { entrees: stats.entries, taille_mo: stats.sizeMb, taux_succes: stats.hitRate, ecoute: this.notify.connected },
        journalisation: { niveau: s.level, source: s.levelSource, niveau_base: logSink.level, contextes: s.contexts, sql: s.sql },
        base: {
          nom: base?.nom ?? '',
          taille_mo: base?.taille ?? 0,
          connexions_api: base?.connexions ?? 0,
          version: base?.version ?? null,
          migration: base?.migration ?? null,
        },
        journal: { lignes: Math.max(journal?.lignes ?? 0, 0), plus_ancien: journal?.plus_ancien ?? null },
      },
    };
    this.logger.debug(`Tableau de bord calculé en ${Date.now() - t0} ms (${d.nb} requête(s) aujourd'hui, ${connected.length} connecté(s))`);
    return out;
  }

  /** Journal filtré, du plus récent au plus ancien (pagination par identifiant). */
  async journal(q: AppLogQuery): Promise<AppLogPageDto> {
    const limit = Math.min(Math.max(int(q.limite) || 100, 1), 500);
    const where: string[] = [];
    const rep: Record<string, unknown> = { limit: limit + 1 };
    if (q.niveau && (LOG_LEVELS as readonly string[]).includes(q.niveau)) {
      // Niveau minimal : ce niveau et les plus graves
      rep['niveaux'] = LOG_LEVELS.slice(0, LOG_LEVELS.indexOf(q.niveau as AppLogLevel) + 1);
      where.push('niveau IN (:niveaux)');
    }
    if (q.contexte) (where.push('contexte = :contexte'), (rep['contexte'] = q.contexte.slice(0, 80)));
    if (q.request_id) (where.push('request_id = :rid'), (rep['rid'] = q.request_id.slice(0, 128)));
    if (q.nigend) (where.push('nigend = :nigend'), (rep['nigend'] = q.nigend.slice(0, 8)));
    if (q.q?.trim()) {
      where.push(`message ILIKE :q ESCAPE '\\'`);
      rep['q'] = `%${q.q.trim().slice(0, 200).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    }
    if (q.avant != null && int(q.avant) > 0) (where.push('id_log < :avant'), (rep['avant'] = int(q.avant)));
    const [rows, contextes] = await Promise.all([
      this.db.select<AppLogDto>(
        `SELECT ${LOG_COLUMNS} FROM t_app_logs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id_log DESC LIMIT :limit`,
        rep,
      ),
      this.cache.wrap('admin:journal:contextes', 60_000, () =>
        this.db.select<{ contexte: string; nb: number }>(
          `SELECT contexte, count(*)::int AS nb FROM t_app_logs
            WHERE horodatage >= now() - interval '1 day' AND contexte IS NOT NULL
            GROUP BY contexte ORDER BY count(*) DESC LIMIT 60`,
        ),
      ),
    ]);
    const more = rows.length > limit;
    const items = more ? rows.slice(0, limit) : rows;
    return { items, contextes, suivant: more ? items[items.length - 1].id_log : null };
  }
}
