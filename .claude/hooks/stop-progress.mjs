#!/usr/bin/env node
/**
 * Hook Stop de Claude Code.
 *
 * Antes de que el agente dé por terminada su respuesta, comprueba si hay
 * cambios sin confirmar en el repositorio que no sean de documentación y si,
 * aun así, `docs/tfg/PROGRESO.md` no se ha tocado. En ese caso le pide una
 * vez que actualice el progreso (y, si procede, las decisiones y la
 * trazabilidad). El seguimiento del TFG depende de que ese registro esté al día.
 *
 * `stop_hook_active` evita un bucle: si el agente ya se detuvo una vez por
 * este aviso, no se le vuelve a bloquear.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
if (input.stop_hook_active) process.exit(0);

let changed;
try {
  changed = execSync('git status --porcelain -uall', { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3));
} catch {
  process.exit(0);
}

const codeChanged = changed.some((f) => !f.startsWith('docs/') && !f.startsWith('memoria/'));
const progressChanged = changed.includes('docs/tfg/PROGRESO.md');

if (codeChanged && !progressChanged) {
  console.log(
    JSON.stringify({
      decision: 'block',
      reason:
        'Hay cambios de código sin reflejar en docs/tfg/PROGRESO.md. Actualiza las casillas y el registro de sesiones y, si procede, DECISIONES.md, TRAZABILIDAD.md y MAPA-REFERENCIAS.md. Si el cambio es trivial y no afecta al progreso, indícalo y termina.',
    }),
  );
}
