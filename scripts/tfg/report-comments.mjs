#!/usr/bin/env node
/**
 * Informe de comentarios en inglés.
 *
 * En la Fase 4 del TFG se reescriben en español todos los comentarios
 * heredados del código de referencia (ver `docs/tfg/GUIA-COMENTARIOS.md`).
 * Este script sirve para medir el avance: extrae los comentarios de los
 * ficheros TS, JS y SQL y aplica una heurística simple (recuento de palabras
 * vacías típicas de cada idioma) para estimar cuáles siguen en inglés.
 *
 * Es solo orientativo. Un comentario muy corto o lleno de términos técnicos
 * puede clasificarse mal, así que la revisión final corresponde al agente
 * `revisor-comentarios`.
 *
 * Uso:
 *   node scripts/tfg/report-comments.mjs [rutas...] [--verbose] [--strict]
 *
 *   rutas      carpetas o ficheros que analizar (por defecto: apps packages tooling)
 *   --verbose  muestra cada comentario sospechoso con su línea
 *   --strict   termina con código 1 si hay comentarios en inglés (para la CI de F4)
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.sql',
]);
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.turbo',
  'dist',
  'build',
  '.output',
  '.nitro',
  '.tanstack',
]);
// Ficheros generados: su contenido no lo escribimos nosotros.
const IGNORED_FILES = [
  /routeTree\.gen\.ts$/,
  /database\.types\.ts$/,
  /\.d\.ts$/,
];

// Palabras vacías muy frecuentes y casi exclusivas de cada idioma.
const EN = new Set(
  'the this that is are be to of and for with we it if when should will this from not only use used can by which our you'.split(
    ' ',
  ),
);
const ES = new Set(
  'el la los las que es son de del y para con se por una un cuando si solo no lo al como su sus este esta usamos debe puede'.split(
    ' ',
  ),
);

/** Extrae los comentarios de un fichero con su número de línea. */
function extractComments(source, isSql) {
  const comments = [];
  const lines = source.split('\n');
  let block = null;

  lines.forEach((line, i) => {
    if (block) {
      const end = line.indexOf('*/');
      block.text += ' ' + (end === -1 ? line : line.slice(0, end));
      if (end !== -1) {
        comments.push(block);
        block = null;
      }
      return;
    }

    const start = line.indexOf('/*');
    if (start !== -1) {
      const end = line.indexOf('*/', start + 2);
      if (end !== -1)
        comments.push({ line: i + 1, text: line.slice(start + 2, end) });
      else block = { line: i + 1, text: line.slice(start + 2) };
      return;
    }

    // `//` precedido de `:` suele ser una URL (https://), no un comentario.
    const lineComment = isSql
      ? line.match(/(?:^|\s)--\s?(.*)$/)
      : line.match(/(?:^|[^:])\/\/\s?(.*)$/);
    if (lineComment) comments.push({ line: i + 1, text: lineComment[1] });
  });

  return comments;
}

function isProbablyEnglish(text) {
  const words = text.toLowerCase().match(/[a-záéíóúñü]+/g) ?? [];
  let en = 0;
  let es = 0;
  for (const w of words) {
    if (EN.has(w)) en++;
    if (ES.has(w)) es++;
  }
  // Exigimos al menos dos indicios para no marcar fragmentos sueltos.
  return en >= 2 && en > es;
}

function collectFiles(target, out) {
  if (!existsSync(target)) return;
  const stats = statSync(target);
  if (stats.isFile()) {
    if (
      EXTENSIONS.has(extname(target)) &&
      !IGNORED_FILES.some((re) => re.test(target))
    )
      out.push(target);
    return;
  }
  for (const name of readdirSync(target)) {
    if (!IGNORED_DIRS.has(name)) collectFiles(join(target, name), out);
  }
}

function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const strict = args.includes('--strict');
  const targets = args.filter((a) => !a.startsWith('--'));
  const roots = (
    targets.length ? targets : ['apps', 'packages', 'tooling']
  ).map((t) => resolve(ROOT, t));

  const files = [];
  roots.forEach((r) => collectFiles(r, files));

  if (files.length === 0) {
    console.log(
      'report-comments: no hay ficheros de código que analizar todavía.',
    );
    return;
  }

  // Agrupamos por paquete (dos primeros niveles) para seguir el avance de F4.
  const byGroup = new Map();
  let totalEnglish = 0;

  for (const file of files) {
    const rel = relative(ROOT, file);
    const group = rel
      .split('/')
      .slice(
        0,
        rel.startsWith('packages/features') ||
          rel.startsWith('packages/cms') ||
          rel.startsWith('packages/billing')
          ? 3
          : 2,
      )
      .join('/');
    const suspicious = extractComments(
      readFileSync(file, 'utf8'),
      file.endsWith('.sql'),
    ).filter((c) => isProbablyEnglish(c.text));

    const entry = byGroup.get(group) ?? { files: 0, english: 0, details: [] };
    entry.files++;
    entry.english += suspicious.length;
    suspicious.forEach((c) =>
      entry.details.push(`${rel}:${c.line}  ${c.text.trim().slice(0, 100)}`),
    );
    byGroup.set(group, entry);
    totalEnglish += suspicious.length;
  }

  console.log('Comentarios probablemente en inglés, por módulo:\n');
  for (const [group, { files: count, english, details }] of [
    ...byGroup,
  ].sort()) {
    const mark = english === 0 ? '✔' : '•';
    console.log(
      `${mark} ${group.padEnd(45)} ${String(english).padStart(5)} en ${count} ficheros`,
    );
    if (verbose) details.forEach((d) => console.log(`    ${d}`));
  }
  console.log(
    `\nTotal: ${totalEnglish} comentario(s) sospechoso(s) en ${files.length} ficheros.`,
  );

  if (strict && totalEnglish > 0) process.exit(1);
}

main();
