#!/usr/bin/env node
/**
 * Índice de etiquetas `[TFG]` del código.
 *
 * Las etiquetas `[TFG]` enlazan un fragmento de código con un requisito
 * (RF-xx / RNF-xx), una decisión (ADR-xxx) o una sección de la memoria (ver
 * `docs/tfg/GUIA-COMENTARIOS.md` §7). Este script las recorre y genera la
 * tabla de la sección «Etiquetas [TFG] en el código» de
 * `docs/tfg/TRAZABILIDAD.md`, para que la matriz no dependa de mantenerla a
 * mano.
 *
 * Uso:
 *   node scripts/tfg/tfg-tags.mjs           # imprime la tabla en Markdown
 *   node scripts/tfg/tfg-tags.mjs --write   # la sustituye en TRAZABILIDAD.md
 *
 * Las migraciones se excluyen: repiten literalmente los comentarios de los
 * esquemas declarativos, que son la fuente.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TRACE_FILE = join(ROOT, 'docs/tfg/TRAZABILIDAD.md');
const START = '<!-- tfg-tags:inicio -->';
const END = '<!-- tfg-tags:fin -->';

function collectTags() {
  let output = '';

  try {
    // git grep respeta .gitignore y es rápido; -I ignora binarios.
    output = execSync(
      "git grep --untracked -n -I -e '\\[TFG\\]' -- apps packages scripts ':!**/migrations/**' ':!scripts/tfg/tfg-tags.mjs'",
      { cwd: ROOT, encoding: 'utf8' },
    );
  } catch {
    // git grep devuelve código 1 cuando no hay coincidencias.
    return [];
  }

  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [file, lineNumber, ...rest] = line.split(':');
      const text = rest.join(':').split('[TFG]')[1] ?? '';
      const clean = text.replace(/\*\/|^\s*[-*/]*\s*/g, '').trim();
      const refs = [...new Set(clean.match(/\b(RN?F-\d+|ADR-\d+)/g) ?? [])];

      return {
        location: `${file}:${lineNumber}`,
        refs: refs.join(', ') || '—',
        summary: clean.replace(/\|/g, '\\|').slice(0, 110),
      };
    });
}

function buildTable(tags) {
  const header = [
    '| Fichero:línea | Referencias | Qué ilustra |',
    '|---|---|---|',
  ];
  const rows = tags.map(
    (t) => `| \`${t.location}\` | ${t.refs} | ${t.summary} |`,
  );

  return [
    `_Tabla generada con \`node scripts/tfg/tfg-tags.mjs --write\` (${tags.length} etiquetas). No se edita a mano._`,
    '',
    ...header,
    ...rows,
  ].join('\n');
}

const table = buildTable(collectTags());

if (process.argv.includes('--write')) {
  const doc = readFileSync(TRACE_FILE, 'utf8');
  const start = doc.indexOf(START);
  const end = doc.indexOf(END);

  if (start === -1 || end === -1) {
    console.error(
      `No se encuentran los marcadores ${START} / ${END} en TRAZABILIDAD.md`,
    );
    process.exit(1);
  }

  writeFileSync(
    TRACE_FILE,
    `${doc.slice(0, start + START.length)}\n${table}\n${doc.slice(end)}`,
  );
  console.log('TRAZABILIDAD.md actualizado.');
} else {
  console.log(table);
}
