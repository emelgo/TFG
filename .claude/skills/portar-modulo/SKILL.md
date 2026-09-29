---
name: portar-modulo
description: Trae a PymeKit un fichero, paquete o app desde el código de referencia (../makerkit o ../supamode) siguiendo el flujo del TFG completo (copiar, desmarcar, comentar en español, verificar y registrar). Úsalo siempre que haya que reutilizar código de la referencia (port module, import package, reuse).
argument-hint: <ruta-en-la-referencia> [ruta-destino]
---

# /portar-modulo

Porta `$ARGUMENTS` desde la referencia a PymeKit. Si no se indica un destino, se deduce de `docs/tfg/MAPA-REFERENCIAS.md`.

**Nunca modifiques nada dentro de `../makerkit` ni de `../supamode`.**

## 1. Preparar
1. Lee `docs/tfg/GUIA-DESMARCADO.md` y `docs/tfg/GUIA-COMENTARIOS.md`.
2. Localiza la fila correspondiente en `MAPA-REFERENCIAS.md`: destino, tipo (R/A) y notas. Si no existe o el tipo es **X** (descartado), detente y pregunta al autor.
3. Examina el origen: lista sus ficheros, excluyendo `node_modules`, `dist`, `.turbo`, `CHANGELOG.md` y `docs/`. Revisa sus dependencias internas (`@kit/*`) y comprueba si ya están portadas en PymeKit. Si falta alguna dependencia, avisa y propón el orden de porte.
4. Si el módulo es grande (más de 30 ficheros), trabaja por subcarpetas y verifica cada una antes de continuar.

## 2. Copiar
- Copia con `rsync -a --exclude node_modules --exclude dist --exclude .turbo <origen>/ <destino>/`, o con `cp -r` si el destino es un único fichero.
- No copies secretos (`.env.local`) ni ficheros que la guía marque como excluidos.

## 3. Desmarcar
Aplica la tabla de `GUIA-DESMARCADO.md`:
- `@kit/` → `@pymekit/` (SaaS) o `@pymekit/cms-*` (CMS). Actualiza `package.json` (`name` y dependencias), imports, `tsconfig` y `turbo.json`.
- Marca y textos: `makerkit`/`supamode` → PymeKit. Emails de prueba → `@pymekit.test`. Enlaces externos de la referencia → eliminarlos.
- Revisa el resultado con `grep -rniE "makerkit|supamode|@kit/" <destino>`.

## 4. Comentar
- Reescribe **todos** los comentarios en español didáctico siguiendo la guía. Es el mismo procedimiento que `/comentar-modulo`, aplicado a este destino.
- Añade cabeceras de fichero y JSDoc donde falten.
- Si el módulo implementa un requisito clave, añade una etiqueta `[TFG]` y regístrala en `TRAZABILIDAD.md`.
- **No cambies la lógica** en este paso. Las adaptaciones funcionales (tipo A) se hacen después y por separado, para que el diff sea revisable.

## 5. Verificar
1. `node scripts/tfg/check-branding.mjs` sin errores.
2. Si ya existe el entorno de F1: `pnpm install`, `pnpm typecheck`, `pnpm lint:fix`, `pnpm format:fix` y los tests del paquete.
3. Lanza el subagente `revisor-comentarios` sobre el destino y aplica sus correcciones.
4. Si el módulo incluye SQL o RLS: `/rls-review`.

## 6. Registrar
- `MAPA-REFERENCIAS.md`: actualiza el estado (📥 → 🏷️ → 💬 → ✅) y las notas.
- `PROGRESO.md`: marca la casilla correspondiente y añade una línea al registro de sesiones.
- Si surgió alguna decisión (renombrar algo, descartar una parte, cambiar la estructura), usa `/decision`.

## 7. Informe final
Resume: ficheros portados, sustituciones aplicadas, dependencias pendientes, resultado de las verificaciones y siguiente paso sugerido. Propón un mensaje de commit (`feat(<ámbito>): portar <módulo> desde la base SaaS`), pero **no hagas el commit** salvo que el autor lo pida.
