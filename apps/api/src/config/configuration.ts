/**
 * Configuration de l'API (variables d'environnement).
 * Les URLs / jetons des services externes ne sont jamais ici : ils vivent dans `t_param_app`.
 */
export interface AppConfig {
  env: string;
  port: number;
  prefix: string;
  corsOrigins: string[];
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
    logging: boolean;
  };
  /** Cache applicatif en mémoire (cf. common/cache). */
  cache: { enabled: boolean; maxEntries: number; maxMb: number };
}

const bool = (v: string | undefined, def = false) => (v == null || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()));

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'local';
  const isLocal = nodeEnv === 'local' || nodeEnv === 'development' || nodeEnv === 'test';
  const cfg: AppConfig = {
    env: nodeEnv,
    port: Number(env.APP_PORT ?? 8096),
    prefix: env.API_PREFIX ?? 'rni/api',
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:4200').split(',').map((s) => s.trim()).filter(Boolean),
    mockAuth: bool(env.RNI_MOCK_AUTH, isLocal),
    mockExternal: bool(env.RNI_MOCK_EXTERNAL, isLocal),
    mockNigend: env.MOCK_NIGEND ?? '100001',
    db: {
      host: env.PG_HOST ?? 'localhost',
      port: Number(env.PG_PORT ?? 5432),
      user: env.PG_USER ?? 'rni',
      password: env.PG_PASSWORD ?? 'rni',
      database: env.PG_DATABASE ?? 'rni',
      ssl: bool(env.PG_SSL),
      logging: bool(env.PG_LOGGING),
    },
    cache: {
      enabled: bool(env.CACHE_ENABLED, true),
      maxEntries: Math.max(100, Number(env.CACHE_MAX_ENTRIES ?? 5000) || 5000),
      maxMb: Math.max(8, Number(env.CACHE_MAX_MB ?? 128) || 128),
    },
  };
  // §8 : l'injection d'un utilisateur factice est interdite hors développement.
  if (cfg.mockAuth && !isLocal) {
    throw new Error(`RNI_MOCK_AUTH est interdit en environnement « ${nodeEnv} ».`);
  }
  return cfg;
}

export const APP_CONFIG = Symbol('APP_CONFIG');
