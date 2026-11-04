import { existsSync } from 'node:fs';

/** Charge `.env` (s'il existe) sans écraser les variables déjà définies. */
export function loadDotEnv(path = '.env'): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
