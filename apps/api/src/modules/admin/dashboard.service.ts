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
import { Op, col, fn, type WhereOptions } from 'sequelize';
import { localParts, startOfLocalDay } from '@rni/shared';
import { Db } from '../../database/db.service.js';
import { AppLog, Formulaire, Planning, ProfilClassement, RefProfil, RefUser, RequestMetric, SchemaMigration, UserActivity, UserDetail } from '../../database/models/index.js';
import { databaseStats } from '../../database/postgres.js';
import { ParamService } from '../external/param.service.js';

const VERSION = (() => {
  try {
    return (JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as { version: string }).version;
  } catch {
    return '0.0.0';
  }
})();

const logDto = (l: AppLog): AppLogDto => ({
  id_log: Number(l.id_log),
  horodatage: new Date(l.horodatage).toISOString(),
  niveau: l.niveau as AppLogLevel,
  contexte: l.contexte,
  message: l.message,
  pile: l.pile,
  request_id: l.request_id,
  nigend: l.nigend,
  pid: l.pid,
  hote: l.hote,
});

/** Agrégats des métriques (sommes nulles → 0). */
const SUMS = (['nb', 'nb_4xx', 'nb_5xx', 'nb_lentes', 'duree_totale_ms', 'nb_lt100', 'nb_lt300', 'nb_lt1000', 'nb_lt3000'] as const).map(
  (c) => [fn('COALESCE', fn('sum', col(c)), 0), c] as [ReturnType<typeof fn>, string],
);

/** ISO sans millisecondes (format historique de l'API). */
const isoS = (d: Date | string) => new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');

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

function totalsOf(r: Record<string, unknown> | null | undefined): MetricsTotals {
  return {
    nb: int(r?.['nb']),
    nb_4xx: int(r?.['nb_4xx']),
    nb_5xx: int(r?.['nb_5xx']),
    nb_lentes: int(r?.['nb_lentes']),
    total_ms: int(r?.['duree_totale_ms']),
    lt100: int(r?.['nb_lt100']),
    lt300: int(r?.['nb_lt300']),
    lt1000: int(r?.['nb_lt1000']),
    lt3000: int(r?.['nb_lt3000']),
  };
}

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
    const now = new Date();
    const dayStart = startOfLocalDay(now);
    const today = localParts(now, 'Europe/Paris').date;
    const activeSince = new Date(now.getTime() - windowMin * 60_000);
    const hourStart = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
    const firstHour = new Date(hourStart.getTime() - 23 * 3_600_000);

    const totals = async (since: Date) =>
      totalsOf((await RequestMetric.findOne({ attributes: SUMS, where: { minute: { [Op.gte]: since } }, raw: true })) as unknown as Record<string, unknown> | null);

    const [day, hour, last5, levels, hourRows, routeRows, activity, todayUsers, connectes, lastErrors, metier, profils, dbStats, version, migration, oldest] =
      await Promise.all([
        totals(dayStart),
        totals(new Date(now.getTime() - 3_600_000)),
        totals(new Date(Math.floor(now.getTime() / 60_000) * 60_000 - 5 * 60_000)),
        AppLog.findAll({
          attributes: ['niveau', [fn('count', col('id_log')), 'nb']],
          where: { horodatage: { [Op.gte]: dayStart }, niveau: { [Op.in]: ['fatal', 'error', 'warn'] } },
          group: ['niveau'],
          raw: true,
        }) as unknown as Promise<{ niveau: string; nb: string }[]>,
        RequestMetric.findAll({
          attributes: [[fn('date_trunc', 'hour', col('minute')), 'heure'], ...SUMS, [fn('max', col('duree_max_ms')), 'max_ms']],
          where: { minute: { [Op.gte]: firstHour } },
          group: [fn('date_trunc', 'hour', col('minute'))],
          raw: true,
        }) as unknown as Promise<Record<string, unknown>[]>,
        RequestMetric.findAll({
          attributes: ['methode', 'route', ...SUMS, [fn('max', col('duree_max_ms')), 'max_ms']],
          where: { minute: { [Op.gte]: dayStart } },
          group: ['methode', 'route'],
          order: [[fn('sum', col('duree_totale_ms')), 'DESC']],
          limit: 10,
          raw: true,
        }) as unknown as Promise<Record<string, unknown>[]>,
        UserActivity.findAll({ where: { derniere_activite: { [Op.gte]: activeSince } }, order: [['derniere_activite', 'DESC']], limit: 100, raw: true }),
        UserActivity.count({ where: { jour: today } }),
        UserActivity.count({ where: { derniere_activite: { [Op.gte]: activeSince } } }),
        AppLog.findAll({ where: { niveau: { [Op.in]: ['fatal', 'error'] } }, order: [['id_log', 'DESC']], limit: 10 }),
        Promise.all([
          Planning.count({ where: { created_at: { [Op.gte]: dayStart } } }),
          Planning.count({ where: { updated_at: { [Op.gte]: dayStart }, created_at: { [Op.lt]: dayStart } } }),
          RefUser.count({ where: { bool_user_inactif: false } }),
          Formulaire.count({ where: { is_closed: false } }),
          Formulaire.count({ where: { created_at: { [Op.gte]: dayStart } } }),
        ]),
        Promise.all([
          RefProfil.findAll({ attributes: ['id_profil', 'libelle'], raw: true }),
          ProfilClassement.findAll({ raw: true }),
          RefUser.findAll({ attributes: ['id_profil', [fn('count', col('id_user')), 'nb']], where: { bool_user_inactif: false }, group: ['id_profil'], raw: true }) as unknown as Promise<
            { id_profil: number; nb: string }[]
          >,
        ]),
        databaseStats(this.db.sequelize),
        this.db.sequelize.databaseVersion(),
        SchemaMigration.max<string, SchemaMigration>('version'),
        AppLog.min<Date, AppLog>('horodatage'),
      ]);

    // 24 tranches horaires, les heures sans requête comprises
    const byHour = new Map(hourRows.map((r) => [new Date(r['heure'] as string).getTime(), r]));
    const hours = Array.from({ length: 24 }, (_, i) => {
      const at = firstHour.getTime() + i * 3_600_000;
      const r = byHour.get(at);
      const t = totalsOf(r);
      return { heure: isoS(new Date(at)), nb: t.nb, nb_4xx: t.nb_4xx, nb_5xx: t.nb_5xx, total: t.total_ms, max_ms: int(r?.['max_ms']) };
    });
    const routes = routeRows.map((r) => ({ methode: r['methode'] as string, route: r['route'] as string, ...totalsOf(r), max_ms: int(r['max_ms']) }));

    // Identité des utilisateurs actifs
    const details = activity.length
      ? await UserDetail.findAll({
          attributes: ['nigend', 'grade', 'nom', 'prenom', 'libelle_profil', 'libelle_region'],
          where: { nigend: { [Op.in]: activity.map((a) => a.nigend) } },
          raw: true,
        })
      : [];
    const who = new Map(details.map((u) => [u.nigend, u]));
    const connected: ConnectedUserDto[] = activity.map((a) => {
      const u = who.get(a.nigend);
      return {
        nigend: a.nigend,
        grade: u?.grade ?? null,
        nom: u?.nom ?? null,
        prenom: u?.prenom ?? null,
        libelle_profil: u?.libelle_profil ?? null,
        libelle_region: u?.libelle_region ?? null,
        derniere_activite: isoS(a.derniere_activite),
        derniere_route: a.derniere_route,
        nb_requetes_jour: a.jour === today ? a.nb_requetes_jour : 0,
      };
    });

    const [profilRows, classements, countByProfil] = profils;
    const rank = new Map(classements.map((c) => [c.id_profil, c.classement]));
    const counts = new Map(countByProfil.map((c) => [c.id_profil, int(c.nb)]));
    const comptesParProfil = [...profilRows]
      .sort((a, b) => (rank.get(a.id_profil) ?? 99) - (rank.get(b.id_profil) ?? 99))
      .map((p) => ({ libelle: p.libelle, nb: counts.get(p.id_profil) ?? 0 }));
    const [crees, modifies, comptes, fichesOuvertes, fichesJour] = metier;
    const base = { nom: this.cfg.db.database, taille: dbStats.taille_mo, connexions: dbStats.connexions_api, version: version.split(' ')[0], migration: migration ?? null };
    const journal = { lignes: dbStats.lignes_journal, plus_ancien: oldest ? isoS(oldest) : null };
    const d = day;
    const h = hour;
    const byLevel = Object.fromEntries(levels.map((l) => [l.niveau, int(l.nb)]));
    const avg = (t: MetricsTotals) => (t.nb ? Math.round(int(t.total_ms) / t.nb) : null);
    const totalDayMs = int(d.total_ms);
    const stats = this.cache.stats();
    const s = this.logs.settings;
    const mem = process.memoryUsage();

    const out: AdminDashboardDto = {
      genere_le: new Date().toISOString(),
      fenetre_connexion_min: windowMin,
      kpis: {
        connectes,
        utilisateurs_jour: todayUsers,
        requetes_jour: d.nb,
        requetes_par_minute: Math.round((last5.nb / 5) * 10) / 10,
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
      dernieres_erreurs: lastErrors.map(logDto),
      metier: {
        plannings_crees_jour: crees,
        plannings_modifies_jour: modifies,
        comptes_actifs: comptes,
        comptes_par_profil: comptesParProfil.filter((p) => p.nb > 0),
        fiches_ouvertes: fichesOuvertes,
        fiches_creees_jour: fichesJour,
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
    const where: WhereOptions[] = [];
    if (q.niveau && (LOG_LEVELS as readonly string[]).includes(q.niveau)) {
      // Niveau minimal : ce niveau et les plus graves
      where.push({ niveau: { [Op.in]: LOG_LEVELS.slice(0, LOG_LEVELS.indexOf(q.niveau as AppLogLevel) + 1) } });
    }
    if (q.contexte) where.push({ contexte: q.contexte.slice(0, 80) });
    if (q.request_id) where.push({ request_id: q.request_id.slice(0, 128) });
    if (q.nigend) where.push({ nigend: q.nigend.slice(0, 8) });
    if (q.q?.trim()) where.push({ message: { [Op.iLike]: `%${q.q.trim().slice(0, 200).replace(/[\\%_]/g, (c) => `\\${c}`)}%` } });
    if (q.avant != null && int(q.avant) > 0) where.push({ id_log: { [Op.lt]: int(q.avant) } });
    const [rows, contextes] = await Promise.all([
      AppLog.findAll({ where: { [Op.and]: where }, order: [['id_log', 'DESC']], limit: limit + 1 }),
      this.cache.wrap('admin:journal:contextes', 60_000, async () =>
        (
          (await AppLog.findAll({
            attributes: ['contexte', [fn('count', col('id_log')), 'nb']],
            where: { horodatage: { [Op.gte]: new Date(Date.now() - 86_400_000) }, contexte: { [Op.ne]: null } },
            group: ['contexte'],
            order: [[fn('count', col('id_log')), 'DESC']],
            limit: 60,
            raw: true,
          })) as unknown as { contexte: string; nb: string }[]
        ).map((c) => ({ contexte: c.contexte, nb: int(c.nb) })),
      ),
    ]);
    const more = rows.length > limit;
    const items = (more ? rows.slice(0, limit) : rows).map(logDto);
    return { items, contextes, suivant: more ? items[items.length - 1].id_log : null };
  }
}
