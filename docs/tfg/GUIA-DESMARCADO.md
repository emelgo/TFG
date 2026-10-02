# Guía de desmarcado (código de referencia → PymeKit)

PymeKit reutiliza código de dos proyectos de referencia que se guardan fuera del repositorio y **solo se leen**:

| Alias | Ruta | Uso |
|---|---|---|
| Referencia SaaS | `../makerkit` | Base de la app `apps/web` y de la mayoría de `packages/*` |
| Referencia CMS | `../supamode` | Base de `apps/cms`, `apps/cms-api` y `packages/cms/*` |

Todo lo que entra al repositorio pasa por este flujo:

> **copiar → desmarcar → comentar en español → verificar → registrar**

1. **Copiar** el fichero o módulo desde la referencia (skill `/portar-modulo`).
2. **Desmarcar** aplicando la tabla de abajo.
3. **Comentar**: reescribir los comentarios en español didáctico según `GUIA-COMENTARIOS.md` (skill `/comentar-modulo`).
4. **Verificar**: `node scripts/tfg/check-branding.mjs`, más typecheck, lint y tests cuando existan.
5. **Registrar** el módulo en `MAPA-REFERENCIAS.md` y actualizar `PROGRESO.md`.

Los nombres de los proyectos de referencia solo pueden aparecer en la documentación interna del TFG (`docs/tfg/`). **La memoria no los nombra** (ADR-007). `scripts/tfg/check-branding.mjs` lo comprueba.

## Tabla de sustituciones

| Origen | Destino | Notas |
|---|---|---|
| Scope `@kit/*` (referencia SaaS) | `@pymekit/*` | Imports, `package.json`, `tsconfig` paths y `turbo.json` |
| Scope `@kit/*` (referencia CMS) | `@pymekit/cms-*` | Por ejemplo, `@kit/ui` del CMS pasa a `@pymekit/cms-ui` para no colisionar con `@pymekit/ui` |
| `makerkit` / `MakerKit` / `Makerkit` | `pymekit` / `PymeKit` | Textos, variables de entorno, emails y `config.toml` |
| `supamode` (nombre de producto) | `PymeKit CMS` / `pymekit-cms` | En la UI y en la documentación |
| Esquema SQL `supamode` | Se decide en F2 (ver `DECISIONES.md`) | Renombrarlo obliga a tocar todas las migraciones y la API. Evaluar el coste antes de hacerlo |
| Esquema de tests pgTAP `makerkit.*` | `pymekit.*` | Helpers como `pymekit.authenticate_as(...)` |
| `packages/ui/src/makerkit/` | `packages/ui/src/pymekit/` | Y sus exports |
| `src/styles/makerkit.css` | `src/styles/pymekit.css` | |
| `author: MakerKit` en `package.json` | `author: "Enrique — TFG ESI UCA"` | |
| Emails de ejemplo `@makerkit.dev` | `@pymekit.test` | En `.env*`, seeds y tests (hecho en F2) |
| `rp_display_name = "Makerkit"` y los asuntos de email en `config.toml` | `PymeKit` y asuntos en español | |
| Plantillas `supabase/templates/*.html` | Texto en español con marca PymeKit | |
| Enlaces a `makerkit.dev` y a la documentación externa | Se eliminan o apuntan a `docs/` propio | |
| Servidor MCP `makerkit` (`packages/mcp-server`) | Se decide en F1 (ver `DECISIONES.md`) | Se puede conservar renombrado como herramienta de desarrollo |

## Qué NO se copia nunca

- `.git` (historial) de las referencias.
- `docs/` de las referencias (documentación comercial del producto). Se consulta en su ubicación original.
- `.junie/`, `.gemini/`, `.codex/`, `.cursor/`, `.makerkitrc`.
- `tooling/scripts/src/license.mjs` y su tarea `license#dev` en `turbo.json`.
- `node_modules/`, `.turbo/`, `.env.local` ni ningún secreto.
- `CHANGELOG.md` de las referencias. PymeKit lleva su propio historial.

## Excepciones permitidas (lista blanca de `check-branding`)

- **Se permite cualquier mención**:
  - en `docs/tfg/**`, que es la documentación interna del TFG (plan, decisiones y guías);
  - en `scripts/tfg/**` y `.claude/skills/portar-modulo/**`, porque necesitan los patrones que buscan o sustituyen.
- **Solo se permiten las rutas `../makerkit` y `../supamode`** en el resto de ficheros del *harness* (`AGENTS.md`, `CLAUDE.md`, `.claude/**` y `.agents/**`). Sirven para indicar a los agentes dónde está el código de referencia. Cualquier otra mención de la marca en esos ficheros se considera un error.
- **En el código de la aplicación** (`apps/**`, `packages/**`, `tooling/**` y la configuración raíz) **y en la memoria** (`memoria/**`) **no se permite ninguna mención**.
- `pnpm-lock.yaml` se excluye del análisis.
- Las excepciones justificadas en el código (por ejemplo, si se decide conservar el nombre del esquema SQL del CMS) se registran en `scripts/tfg/branding-allowlist.json` con el formato `{ "path": "<glob>", "pattern": "<regex>", "reason": "<motivo y ADR>" }`.
