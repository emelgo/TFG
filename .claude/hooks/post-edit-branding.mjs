#!/usr/bin/env node
/**
 * Hook PostToolUse (Edit | Write | MultiEdit) de Claude Code.
 *
 * Cada vez que el agente modifica un fichero, este hook ejecuta la
 * comprobación de desmarcado solo sobre ese fichero. Si encuentra una
 * referencia prohibida, termina con código 2. Claude Code le devuelve
 * entonces al agente la salida de error para que lo corrija en el acto, en
 * lugar de descubrirlo al final en la CI.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const filePath = input.tool_input?.file_path;
if (!filePath) process.exit(0);

const result = spawnSync(
  process.execPath,
  [join(ROOT, 'scripts/tfg/check-branding.mjs'), '--file', filePath],
  {
    cwd: ROOT,
    encoding: 'utf8',
  },
);

if (result.status === 1) {
  process.stderr.write(result.stderr);
  process.exit(2);
}
