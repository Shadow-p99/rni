/**
 * Configuration de l'API (variables d'environnement), **validée au démarrage** : une valeur
 * invalide ou manquante en production arrête le processus avec un message explicite.
 * Les URLs / jetons des services externes ne sont jamais ici : ils vivent dans `t_param_app`.
 */
export interface AppConfig {
  env: string;
  /** production / preprod : pas de valeur par défaut pour les secrets, durcissements actifs. */
  isProduction: boolean;
  host: string;
  port: number;
  prefix: string;
  corsOrigins: string[];
  /** Valeur Express `trust proxy` (nombre de sauts, liste d'adresses, `loopback`…). */
  trustProxy: boolean | number | string;
  /**
   * Secret partagé avec le reverse-proxy SSO : s'il est défini, toute requête sans l'en-tête
   * `X-RNI-Proxy-Secret` correspondant est refusée (les en-têtes nigend / cn / title ne peuvent
   * alors venir que du proxy).
   */
  proxySecret: string | null;
  mockAuth: boolean;
  mockExternal: boolean;
  mockNigend: string;
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    ssl: boolean;
    /** CA (PEM) pour PG_SSL ; sinon magasin système / NODE_EXTRA_CA_CERTS. */
    sslCa: string | null;
    logging: boolean;
    /** Connexions par processus (attention : × nombre de workers × nombre d'instances). */
    poolMax: number;
    /** Délai maximal d'une requête SQL (ms, 0 = illimité). */
    statementTimeoutMs: number;
  };
  /** Cache applicatif en mémoire (cf. common/cache) ; invalidation partagée via PostgreSQL. */
  cache: { enabled: boolean; maxEntries: number; maxMb: number; notify: boolean };
  /** Processus : workers du cluster, délais d'arrêt, migrations. */
  runtime: {
    /** Nombre de workers HTTP (1 = processus unique ; `auto` = nombre de cœurs). */
    workers: number;
    /** Délai maximal d'arrêt gracieux (ms). */
    shutdownTimeoutMs: number;
    /** Délai entre « non prêt » et fermeture du serveur (le load-balancer retire l'instance). */
    shutdownDelayMs: number;
    /** Exécute les migrations au démarrage (verrou PostgreSQL : sûr avec plusieurs instances). */
    migrateOnStart: boolean;
  };
  log: { format: 'json' | 'text'; level: 'error' | 'warn' | 'log' | 'debug' | 'verbose'; console: boolean };
}

export class ConfigError extends Error {}

const LOCAL_ENVS = new Set(['local', 'development', 'test']);
const LOG_LEVELS = ['error', 'warn', 'log', 'debug', 'verbose'] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env, cpus = 1): AppConfig {
  const errors: string[] = [];
  const nodeEnv = env.NODE_ENV ?? 'local';
  const isLocal = LOCAL_ENVS.has(nodeEnv);

  const str = (name: string, def: string | null): string => {
    const v = env[name];
    if (v != null && v !== '') return v;
    if (def == null) {
      errors.push(`${name} est obligatoire en environnement « ${nodeEnv} ».`);
      return '';
    }
    return def;
  };
  const int = (name: string, def: number, min: number, max: number): number => {
    const v = env[name];
    if (v == null || v === '') return def;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      errors.push(`${name}=${v} : entier entre ${min} et ${max} attendu.`);
      return def;
    }
    return n;
  };
  const bool = (name: string, def: boolean): boolean => {
    const v = env[name]?.trim().toLowerCase();
    if (v == null || v === '') return def;
    if (['1', 'true', 'yes', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'off'].includes(v)) return false;
    errors.push(`${name}=${env[name]} : booléen attendu (true / false).`);
    return def;
  };
  /** Secrets : valeur de développement en local, obligatoire ailleurs. */
  const secret = (name: string, devDefault: string) => str(name, isLocal ? devDefault : null);

  const workersRaw = env.WEB_CONCURRENCY?.trim();
  const workers =
    workersRaw === 'auto' ? Math.max(1, cpus) : int('WEB_CONCURRENCY', 1, 1, 64);

  const trustRaw = env.TRUST_PROXY?.trim();
  // Par défaut : seul le proxy local (Nginx sur la même machine) est cru pour X-Forwarded-For.
  const trustProxy: AppConfig['trustProxy'] =
    trustRaw == null || trustRaw === ''
      ? 'loopback'
      : trustRaw === 'true'
        ? true
        : trustRaw === 'false'
          ? false
          : /^\d+$/.test(trustRaw)
            ? Number(trustRaw)
            : trustRaw;

  const logFormat = (env.LOG_FORMAT ?? (isLocal ? 'text' : 'json')).toLowerCase();
  if (logFormat !== 'json' && logFormat !== 'text') errors.push(`LOG_FORMAT=${logFormat} : json ou text attendu.`);
  const logLevel = (env.LOG_LEVEL ?? 'log').toLowerCase();
  if (!(LOG_LEVELS as readonly string[]).includes(logLevel)) errors.push(`LOG_LEVEL=${logLevel} : ${LOG_LEVELS.join(', ')} attendu.`);

  const cfg: AppConfig = {
    env: nodeEnv,
    isProduction: !isLocal,
    host: str('APP_HOST', '0.0.0.0'),
    port: int('APP_PORT', 8096, 1, 65535),
    prefix: str('API_PREFIX', 'rni/api').replace(/^\/+|\/+$/g, ''),
    // En production, l'appel passe par la même origine (reverse-proxy) : aucune origine croisée par défaut.
    corsOrigins: (env.CORS_ORIGINS ?? (isLocal ? 'http://localhost:4200' : '')).split(',').map((s) => s.trim()).filter(Boolean),
    trustProxy,
    proxySecret: env.PROXY_SHARED_SECRET?.trim() || null,
    mockAuth: bool('RNI_MOCK_AUTH', isLocal),
    mockExternal: bool('RNI_MOCK_EXTERNAL', isLocal),
    mockNigend: env.MOCK_NIGEND ?? '100001',
    db: {
      host: secret('PG_HOST', 'localhost'),
      port: int('PG_PORT', 5432, 1, 65535),
      user: secret('PG_USER', 'rni'),
      password: secret('PG_PASSWORD', 'rni'),
      database: secret('PG_DATABASE', 'rni'),
      ssl: bool('PG_SSL', false),
      sslCa: env.PG_SSL_CA?.trim() || null,
      logging: bool('PG_LOGGING', false),
      poolMax: int('PG_POOL_MAX', 10, 1, 200),
      statementTimeoutMs: int('PG_STATEMENT_TIMEOUT_MS', 30_000, 0, 3_600_000),
    },
    cache: {
      enabled: bool('CACHE_ENABLED', true),
      maxEntries: int('CACHE_MAX_ENTRIES', 5000, 100, 1_000_000),
      maxMb: int('CACHE_MAX_MB', 128, 8, 16_384),
      notify: bool('CACHE_NOTIFY', true),
    },
    runtime: {
      workers,
      shutdownTimeoutMs: int('SHUTDOWN_TIMEOUT_MS', 25_000, 1000, 600_000),
      shutdownDelayMs: int('SHUTDOWN_DELAY_MS', isLocal ? 0 : 3000, 0, 60_000),
      migrateOnStart: bool('MIGRATE_ON_START', false),
    },
    log: { format: logFormat as 'json' | 'text', level: logLevel as AppConfig['log']['level'], console: bool('LOG_CONSOLE', true) },
  };

  // §8 : l'injection d'un utilisateur factice est interdite hors développement.
  if (cfg.mockAuth && !isLocal) errors.push(`RNI_MOCK_AUTH est interdit en environnement « ${nodeEnv} ».`);
  if (!isLocal && cfg.corsOrigins.includes('*')) errors.push('CORS_ORIGINS=* est interdit hors développement.');
  if (cfg.proxySecret != null && cfg.proxySecret.length < 16) errors.push('PROXY_SHARED_SECRET : 16 caractères minimum.');

  if (errors.length) throw new ConfigError(`Configuration invalide :\n - ${errors.join('\n - ')}`);
  return cfg;
}

export const APP_CONFIG = Symbol('APP_CONFIG');
