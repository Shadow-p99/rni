#!/usr/bin/env node
/**
 * Garde-fou : l'accès aux données passe par les modèles Sequelize (`src/database/models`).
 * Échoue si du SQL natif apparaît ailleurs que dans les fichiers d'exception ci-dessous.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/', import.meta.url));

/** Exceptions justifiées (sans équivalent dans Sequelize). */
const ALLOWED = new Map([
  ['database/postgres.ts', 'verrou consultatif pg_try_advisory_xact_lock, statistiques du catalogue PostgreSQL'],
  ['database/migrator.ts', 'migrations de schéma (DDL), exécutées avant le démarrage de l’ORM'],
  ['common/cache/cache-notify.service.ts', 'LISTEN / pg_notify sur une connexion PostgreSQL dédiée'],
]);

const PATTERNS = [
  [/\.query\s*[<(]/, 'appel à query()'],
  [/\bQueryTypes\b/, 'QueryTypes (requête native)'],
  [/\bliteral\s*\(/, 'sequelize.literal()'],
  [/`[^`]*\b(SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b[^`]*`/is, 'texte SQL'],
  [/['"]\s*(SELECT\s|INSERT\s+INTO|DELETE\s+FROM)/i, 'texte SQL'],
];

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) files.push(p);
  }
})(root);

const errors = [];
for (const file of files) {
  const rel = relative(root, file).replaceAll('\\', '/');
  if (ALLOWED.has(rel)) continue;
  const src = readFileSync(file, 'utf8')
    // commentaires ignorés
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const [re, label] of PATTERNS) {
    const m = re.exec(src);
    if (m) {
      const line = src.slice(0, m.index).split('\n').length;
      errors.push(`  src/${rel}:${line} — ${label} : ${m[0].trim().slice(0, 80)}`);
    }
  }
}

if (errors.length) {
  console.error('SQL natif interdit hors des exceptions (utiliser les modèles Sequelize) :');
  console.error(errors.join('\n'));
  console.error('\nExceptions autorisées :');
  for (const [f, why] of ALLOWED) console.error(`  src/${f} — ${why}`);
  process.exit(1);
}
console.log(`Accès aux données : ${files.length} fichiers vérifiés, SQL natif limité aux ${ALLOWED.size} exceptions documentées.`);
