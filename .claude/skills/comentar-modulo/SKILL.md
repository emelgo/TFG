---
name: comentar-modulo
description: Reescribe en español didáctico los comentarios de un módulo, paquete o carpeta de PymeKit según docs/tfg/GUIA-COMENTARIOS.md (cabeceras, JSDoc, porqué y seguridad), sin tocar la lógica. Es la tarea principal de la Fase 4 del TFG (translate comments to Spanish, document module).
argument-hint: <ruta-del-módulo>
---

# /comentar-modulo

Reescribe los comentarios de `$ARGUMENTS` para que cumplan la guía del TFG.

## Reglas inquebrantables
- **Solo se tocan comentarios** (`//`, `/* */`, JSDoc, `--` y `comment on` de SQL). Ni lógica, ni identificadores, ni formato del código. Si ves un bug, anótalo en el informe, pero no lo corrijas aquí.
- Los identificadores siguen en inglés.
- Los ficheros generados (`routeTree.gen.ts`, `database.types.ts`, `*.d.ts`) no se tocan.

## Procedimiento
1. Lee `docs/tfg/GUIA-COMENTARIOS.md`.
2. Mide el punto de partida con `node scripts/tfg/report-comments.mjs $ARGUMENTS --verbose`.
3. Lee el `AGENTS.md` del paquete, si existe, y los ficheros principales para entender **qué hace el módulo y por qué existe en la arquitectura**. Sin esa comprensión no se puede escribir la cabecera.
4. Recorre cada fichero:
   - **Cabecera**: añádela o reescríbela (qué es, por qué existe y cómo encaja) en los ficheros con lógica.
   - **JSDoc** en español en los exports relevantes.
   - **Comentarios heredados**: reescríbelos explicando el porqué. Si eran obvios, elimínalos. Si el original explicaba algo de seguridad o un caso límite, conserva todo su contenido técnico.
   - **Huecos**: añade comentarios donde haya decisiones no evidentes que no estén explicadas, sobre todo en RLS, cliente admin, *middleware*, pagos y *webhooks*.
   - **SQL**: `comment on` en español y un comentario encima de cada política que explique quién puede hacer qué y por qué.
   - `[TFG]`: solo en los puntos clave, registrándolos en `docs/tfg/TRAZABILIDAD.md`.
5. En los paquetes con más de ~25 ficheros, avanza por subcarpetas y comprueba el recuento con `report-comments` en cada una.

## Verificación
1. `node scripts/tfg/report-comments.mjs $ARGUMENTS`: el objetivo es 0, o casos justificados (términos técnicos).
2. `node scripts/tfg/check-branding.mjs`.
3. Si existe el entorno: `pnpm typecheck` y `pnpm format:fix`, para asegurar que no se ha roto nada al editar.
4. `git diff --stat` y una revisión rápida de que solo han cambiado comentarios.
5. Lanza el subagente `revisor-comentarios` sobre `$ARGUMENTS` y aplica sus propuestas.

## Registro
- Actualiza la tabla F4 de `docs/tfg/PROGRESO.md`: la columna «Estado» se pone en ✅, y la columna «Revisado» cuando el revisor lo aprueba.
- En `MAPA-REFERENCIAS.md`, el estado del módulo pasa a 💬.
- Informe: ficheros tocados, comentarios reescritos, añadidos y eliminados, posibles bugs detectados y el commit propuesto (`docs(<ámbito>): comentarios didácticos en español`).
