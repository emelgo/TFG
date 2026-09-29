#!/usr/bin/env node
/**
 * Comprobación de desmarcado del TFG PymeKit.
 *
 * PymeKit reutiliza código de dos proyectos de referencia que están fuera del
 * repositorio. Este script garantiza que en el código y en la documentación
 * de usuario no quede ninguna mención a esos productos (ni a su scope de
 * paquetes `@kit/`), según las reglas de `docs/tfg/GUIA-DESMARCADO.md`:
 *
 *  - Algunos ficheros pueden mencionarlos libremente (documentación interna
 *    del TFG, los propios scripts y la skill de porte). La memoria no.
 *  - El resto de ficheros del "harness" (directrices, skills y agentes)
 *    solo pueden citar las rutas de las referencias (`../makerkit`,
 *    `../supamode`), que sirven para indicar a los agentes dónde está el
 *    código original.
 *  - El resto del repositorio no puede mencionarlos de ninguna forma.
 *
 * Las excepciones justificadas (por ejemplo, un nombre de esquema SQL que se
 * decida conservar) se registran en `scripts/tfg/branding-allowlist.json`
 * con su motivo, para que queden documentadas y sean revisables.
 *
 * Uso:
 *   node scripts/tfg/check-branding.mjs              # analiza todo el repositorio
 *   node scripts/tfg/check-branding.mjs --file <ruta> # analiza un único fichero (hook de Claude Code)
 *   node scripts/tfg/check-branding.mjs --scope-only   # solo busca el scope de paquetes original
 *                                                      # (bloqueante en la CI mientras dura la Fase 3)
 *
 * Termina con código 1 si encuentra alguna referencia no permitida.
 *
 * [TFG] RNF-05 Mantenibilidad: control automático que se ejecuta en la CI.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Términos prohibidos. El scope `@kit/` delata un import sin renombrar.
// También detecta la forma escapada dentro de expresiones regulares (`@kit\/`).
const SCOPE = /@kit\\?\//;
const FORBIDDEN = process.argv.includes('--scope-only')
  ? [SCOPE]
  : [/makerkit/i, /supamode/i, SCOPE];

// Ficheros donde cualquier mención está permitida.
// `docs/tfg` es documentación interna del TFG (plan, decisiones, guías) y
// necesita hablar de las referencias y de las sustituciones que se aplican.
// La memoria NO está aquí: por decisión del autor, no nombra las referencias.
const FULLY_ALLOWED = [
  'docs/tfg/**',
  'scripts/tfg/**',
  '.claude/skills/portar-modulo/**',
];

// Ficheros del harness: solo se permiten las rutas a las referencias.
const HARNESS = ['AGENTS.md', 'CLAUDE.md', '.claude/**', '.agents/**'];
const REFERENCE_PATH = /(?:\.\.|\/TFG)\/(?:makerkit|supamode)\b/gi;

// Ficheros que no tiene sentido analizar (generados o binarios).
const SKIPPED = [
  '**/pnpm-lock.yaml',
  '**/node_modules/**',
  '.git/**',
  '**/*.{png,jpg,jpeg,gif,webp,ico,woff,woff2,ttf,otf,pdf,zip,gz}',
];

/**
 * Convierte un patrón glob sencillo (`**`, `*`, `{a,b}`) en expresión regular.
 * Se implementa aquí para que el script no tenga dependencias y funcione antes
 * de ejecutar `pnpm install`.
 */
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      // `**/` también debe casar con "ningún directorio".
      re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (c === '*') re += '[^/]*';
    else if (c === '{') re += '(?:';
    else if (c === '}') re += ')';
    else if (c === ',') re += '|';
    else re += c.replace(/[.+^$()|[\]\\?]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

const matchesAny = (path, globs) =>
  globs.some((g) => globToRegExp(g).test(path));

function loadAllowlist() {
  const file = join(ROOT, 'scripts/tfg/branding-allowlist.json');
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf8')).map((entry) => ({
    ...entry,
    regex: new RegExp(entry.pattern, 'i'),
  }));
}

/** Lista los ficheros del repositorio respetando `.gitignore` si hay git. */
function listFiles() {
  try {
    return execSync('git ls-files -co --exclude-standard', {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
  } catch {
    // Sin git (por ejemplo, en una copia descomprimida) recorremos el disco.
    const out = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '.git') continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else out.push(relative(ROOT, full));
      }
    };
    walk(ROOT);
    return out;
  }
}

function checkFile(path, allowlist) {
  if (matchesAny(path, SKIPPED) || matchesAny(path, FULLY_ALLOWED)) return [];

  const full = join(ROOT, path);
  if (!existsSync(full) || statSync(full).isDirectory()) return [];

  const isHarness = matchesAny(path, HARNESS);
  const lines = readFileSync(full, 'utf8').split('\n');
  const findings = [];

  lines.forEach((original, index) => {
    const line = isHarness ? original.replace(REFERENCE_PATH, '') : original;
    if (!FORBIDDEN.some((re) => re.test(line))) return;

    const allowed = allowlist.some(
      (entry) => globToRegExp(entry.path).test(path) && entry.regex.test(line),
    );
    if (!allowed)
      findings.push({ path, line: index + 1, text: original.trim() });
  });

  return findings;
}

function main() {
  const args = process.argv.slice(2);
  const fileArgIndex = args.indexOf('--file');
  const allowlist = loadAllowlist();

  let files;
  if (fileArgIndex !== -1) {
    const target = args[fileArgIndex + 1];
    if (!target) {
      console.error('Uso: check-branding.mjs --file <ruta>');
      process.exit(2);
    }
    const rel = relative(ROOT, resolve(process.cwd(), target));
    // Un fichero fuera del repositorio (p. ej. en una referencia) no nos incumbe.
    if (rel.startsWith('..')) process.exit(0);
    files = [rel];
  } else {
    files = listFiles();
  }

  const findings = files.flatMap((f) => checkFile(f, allowlist));

  if (findings.length === 0) {
    if (fileArgIndex === -1)
      console.log(
        `✔ check-branding: ${files.length} ficheros revisados, sin referencias.`,
      );
    process.exit(0);
  }

  console.error(
    `✖ check-branding: ${findings.length} referencia(s) no permitida(s) a los proyectos de referencia:`,
  );
  for (const f of findings)
    console.error(`  ${f.path}:${f.line}  ${f.text.slice(0, 140)}`);
  console.error(
    '\nSustitúyelas según docs/tfg/GUIA-DESMARCADO.md o, si está justificado, registra una excepción en scripts/tfg/branding-allowlist.json.',
  );
  process.exit(1);
}

main();
