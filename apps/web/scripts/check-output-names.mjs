#!/usr/bin/env node
/**
 * Garde-fou : une sortie de composant (`output()`) ne doit pas porter le nom d'un événement DOM natif.
 * Sinon l'événement natif émis par un élément interne (ex. `change` d'un <select>, `search` d'un
 * <input type="search">) remonte jusqu'à l'élément hôte et déclenche aussi le gestionnaire du parent,
 * avec un objet Event au lieu de la valeur attendue.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DOM_EVENTS = new Set([
  'abort', 'beforeinput', 'blur', 'cancel', 'change', 'click', 'close', 'contextmenu', 'copy', 'cut', 'dblclick', 'drag', 'drop',
  'error', 'focus', 'focusin', 'focusout', 'input', 'invalid', 'keydown', 'keyup', 'load', 'mousedown', 'mouseup', 'paste',
  'pointerdown', 'pointerup', 'reset', 'resize', 'scroll', 'search', 'select', 'selectionchange', 'submit', 'toggle', 'wheel',
]);

const root = new URL('../src/app', import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) files.push(p);
  }
})(root);

const offenders = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/readonly\s+(\w+)\s*=\s*output\s*[<(]/g)) {
    if (DOM_EVENTS.has(m[1])) offenders.push(`  src/app/${relative(root, file)} : output « ${m[1]} »`);
  }
}

if (offenders.length) {
  console.error(`Sorties de composants portant le nom d'un événement DOM natif (à renommer) :\n${offenders.join('\n')}`);
  process.exit(1);
}
console.log(`Noms des sorties : OK (${files.length} fichiers vérifiés)`);
