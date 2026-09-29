#!/usr/bin/env node
/**
 * Hook SessionStart de Claude Code.
 *
 * Al abrir una sesión, añade al contexto del agente la fase actual del TFG y
 * las tareas pendientes de esa fase, leídas de `docs/tfg/PROGRESO.md`. Así
 * cada sesión arranca sabiendo dónde se quedó la anterior, sin depender de la
 * memoria de la conversación.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const progressFile = join(ROOT, 'docs/tfg/PROGRESO.md');

if (!existsSync(progressFile)) process.exit(0);

const text = readFileSync(progressFile, 'utf8');
const phase = text.match(/\*\*Fase actual:\*\*\s*(F\d+)/)?.[1];
if (!phase) process.exit(0);

// La sección de la fase va desde su encabezado «## Fx» hasta el siguiente «## ».
const section =
  text.split(/^## /m).find((s) => s.startsWith(`${phase} `)) ?? '';
const pending = section
  .split('\n')
  .filter((l) => l.startsWith('- [ ]') || l.includes('⬜'))
  .map((l) => `  ${l.trim()}`);

const title = section.split('\n')[0];

// Pendientes que no dependen de la fase (plantilla, dudas con el tutor…).
const transversal = (
  text.split(/^## /m).find((s) => s.startsWith('Pendientes transversales')) ??
  ''
)
  .split('\n')
  .filter((l) => l.startsWith('- [ ]'))
  .map((l) => `  ${l.trim()}`);
console.log(
  [
    `[TFG PymeKit] Fase actual: ${title || phase}`,
    pending.length
      ? `Pendiente en esta fase:\n${pending.join('\n')}`
      : 'No hay pendientes en esta fase: revisa si toca avanzar la «Fase actual» en docs/tfg/PROGRESO.md.',
    ...(transversal.length
      ? [`Pendientes transversales:\n${transversal.join('\n')}`]
      : []),
    'Directrices: AGENTS.md · Plan: docs/tfg/PLAN.md · Referencias (solo lectura): ../makerkit y ../supamode',
  ].join('\n'),
);
