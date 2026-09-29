# Plan del TFG PymeKit

Este plan relaciona las fases de trabajo con la **Estructura de Descomposición del Trabajo (EDT)** de la propuesta:

1. Análisis
2. Arquitectura
3. Modelo de datos
4. Implementación
5. Validación
6. Documentación

El estado de cada fase se sigue en `PROGRESO.md`.

| Fase | Nombre | EDT | Depende de |
|---|---|---|---|
| F0 | Harness y planificación | 1 | — |
| F1 | Base SaaS importada y funcionando | 4 | F0 |
| F2 | Integración del CMS | 2, 3, 4 | F1 |
| F3 | Desmarcado completo e i18n español | 4 | F1, F2 |
| F4 | Comentarios didácticos en español | 4, 6 | F1, F2 (se puede solapar con F3/F5) |
| F5 | Adaptación a pymes y configurabilidad | 2, 3, 4 | F3 |
| F6 | Validación | 5 | F5 |
| F7 | Despliegue | 4, 6 | F5 |
| F8 | Memoria y manuales | 1, 2, 3, 6 | Continua; cierre tras F6/F7 |

---

## F0 · Harness y planificación
**Objetivo:** dejar listas las directrices, la planificación y las herramientas de control antes de escribir código.
**Entregables:**
- `AGENTS.md` y `CLAUDE.md`.
- `docs/tfg/*`.
- `.claude/` (settings, hooks, skills y agentes).
- `scripts/tfg/*`.
- CI mínima.
- `memoria/README.md`.

**Hecho cuando:** `check-branding` pasa, los hooks funcionan, las skills aparecen en Claude Code y existe el primer commit en `main`.

## F1 · Base SaaS importada y funcionando
**Objetivo:** tener la app base funcionando en el repositorio con el scope `@pymekit/*`.

**Tareas:**
1. Copiar desde `../makerkit`, sin incluir:
   - `.git`, `docs/`, `.junie`, `.gemini`, `.codex`, `.makerkitrc` y `node_modules`;
   - `CHANGELOG.md`;
   - `tooling/scripts/src/license.mjs` ni la tarea `license#dev`.
2. Fusionar con el harness existente. `AGENTS.md` y `.claude/` de PymeKit prevalecen, y los `AGENTS.md` por paquete se portan traducidos.
3. Renombrar `@kit/*` → `@pymekit/*` en `package.json`, imports, `tsconfig` y `turbo.json`. Actualizar `name`/`author` y el `README`.
4. Retirar `packages/cms` (Keystatic/WordPress) y el contenido de blog, docs y changelog de `apps/web/content`, junto con sus rutas. Se mantienen una landing mínima y la página de precios.
5. Decidir sobre `packages/mcp-server` (ADR).
6. Arrancar el entorno: `pnpm i`, `pnpm supabase:web:start`, `pnpm dev`.
7. Poner en verde typecheck, lint, pgTAP y E2E.
8. Ampliar la CI (`.github/workflows/tfg.yml`) con typecheck, lint, tests unitarios, pgTAP y E2E.

**Hecho cuando:** la app arranca en local, CU-01 funciona a mano y la CI está en verde. Ya no hay ninguna referencia a `@kit/` (puede seguir habiendo textos de marca, que se limpian en F3).

## F2 · Integración del CMS
**Objetivo:** tener el CMS dentro del monorepo, usando la misma base de datos.

**Tareas:**
1. Copiar `../supamode/apps/app` → `apps/cms`, `apps/api` → `apps/cms-api` y `packages/*` → `packages/cms/*`.
2. Renombrar el scope a `@pymekit/cms-*`.
3. Unificar el catálogo de `pnpm-workspace.yaml` y las versiones de React, Vite, Tailwind y TypeScript. Resolver los conflictos de dependencias.
4. Integrar las migraciones del CMS en `apps/web/supabase` (una sola instancia de Supabase). Registrar un ADR sobre el nombre del esquema del CMS y sobre la numeración o el orden de las migraciones.
5. Resolver cómo conviven el acceso al CMS y el super-admin de la app (ADR). Por ejemplo, cuentas del CMS vinculadas a `auth.users` y una plantilla de permisos inicial.
6. Unificar puertos (en las referencias, la web y la API del CMS usan ambos el :3000), variables de entorno y los scripts `dev` en Turbo.
7. Integrar las pruebas E2E del CMS en `apps/e2e`.

**Hecho cuando:** `pnpm dev` levanta la web, el CMS y la API del CMS, y CU-06 funciona en local. `/rls-review` se ha pasado sobre el esquema del CMS.

## F3 · Desmarcado completo e i18n español
**Tareas:**
1. `check-branding` a cero en todo el repositorio.
2. Añadir el locale `es` (por defecto) en `packages/i18n`, las plantillas de email y el CMS.
3. Plantillas de Supabase (`supabase/templates/*.html`) y `config.toml` en español con la marca PymeKit.
4. `.env*` con `VITE_PRODUCT_NAME=PymeKit` y emails de prueba `@pymekit.test`.
5. Favicon, logo y landing propios.
6. Renombrar el esquema de helpers pgTAP a `pymekit.*`.

**Hecho cuando:** `check-branding` pasa sin excepciones en el código y la UI se muestra en español por defecto.

## F4 · Comentarios didácticos en español
**Objetivo:** que todo el código cumpla `GUIA-COMENTARIOS.md`. Se trabaja módulo a módulo con `/comentar-modulo` y el agente `revisor-comentarios`, en este orden (de más a menos crítico para el tribunal):
1. `apps/web/supabase/schemas` (+ tests pgTAP)
2. `packages/function-middleware`, `packages/supabase`, `packages/policies`
3. `packages/features/auth`, `accounts`, `team-accounts`, `admin`, `notifications`
4. `packages/billing/*`
5. `apps/web/src` (config, lib/server, routes, components)
6. `packages/cms/*`, `apps/cms-api`, `apps/cms`
7. `packages/ui`, `packages/shared`, `packages/i18n`, mailers, analytics, monitoring y el resto
8. `apps/e2e`, `tooling`

**Hecho cuando:** `scripts/tfg/report-comments.mjs` no detecta comentarios en inglés en los módulos 1–6 y el revisor aprueba cada módulo (marcado en `PROGRESO.md`).

## F5 · Adaptación a pymes y configurabilidad
**Tareas:**
1. Roles y permisos orientados a pymes (por ejemplo, owner, admin y member), con los permisos revisados. Incluye ADR y pgTAP.
2. Planes de Stripe de ejemplo en modo test (por usuario o por equipo). Incluye ADR.
3. Plantilla de permisos inicial del CMS (roles de soporte y de gestor de contenidos).
4. Centralizar y documentar la configuración reutilizable (`apps/web/src/config/*.config.ts`, variables de entorno y feature flags).
5. Revisar el generador Turbo (`turbo/generators`) para crear paquetes y funcionalidades nuevas.

**Hecho cuando:** CU-02, CU-03, CU-04 y CU-05 funcionan y la configuración está documentada.

## F6 · Validación
**Tareas:**
1. Pruebas E2E de CU-01 a CU-06.
2. pgTAP de aislamiento multi-tenant (RNF-03) y de los permisos del CMS.
3. Pruebas de integración web ↔ BD ↔ CMS ↔ Stripe (webhooks en local con `stripe listen`).
4. **Evaluación de la reutilización** (CU-07, RNF-01). Ver el punto abierto P-01.
5. Recoger resultados (tablas y capturas) para la memoria.

**Hecho cuando:** la CI está en verde y los resultados están documentados en `docs/tfg/` y en la memoria.

## F7 · Despliegue
**Tareas:**
1. `Dockerfile` para web, CMS y API del CMS.
2. `docker-compose.yml` para levantar todo contra Supabase local o en la nube.
3. Configuración de Railway.
4. Proyecto Supabase en la nube.
5. Stripe en modo test con webhooks públicos.
6. Manual de instalación y puesta en marcha (`docs/manual-instalacion.md`), que también se incluye en un anexo de la memoria.

**Hecho cuando:** hay un despliegue de demostración accesible y el manual se ha probado desde cero.

## F8 · Memoria y manuales
Estructura prevista de la memoria (se ajustará a la plantilla de la ESI):

| Capítulo | Contenido |
|---|---|
| 1. Introducción | Motivación, objetivos y estructura |
| 2. Planificación | Metodología, fases (este plan), temporización y costes |
| 3. Estado del arte | SaaS para pymes, *boilerplates* y kits SaaS, CMS/admin para BaaS, tecnologías. Sin nombrar los proyectos de referencia (ADR-007) |
| 4. Análisis | Requisitos (`REQUISITOS.md`) y casos de uso |
| 5. Diseño | Arquitectura, modelo de datos, seguridad (RLS), pagos, CMS y decisiones (`DECISIONES.md`) |
| 6. Implementación | Estructura del monorepo, módulos, reutilización y adaptación |
| 7. Pruebas y validación | Resultados de F6 |
| 8. Despliegue | Resultados de F7 |
| 9. Conclusiones y trabajo futuro | |
| Anexos | Manual de instalación, manual de uso y documentación técnica |

La memoria se redacta **a lo largo de todo el proyecto** con `/seccion-memoria`. Cada fase terminada deja un borrador de su parte.

---

## Puntos abiertos

| ID | Tema | Estado |
|---|---|---|
| P-01 | La propuesta pide *«evaluación de la reutilización de la plataforma en un escenario de ejemplo»*, pero el alcance acordado es una plataforma genérica. **Propuesta inicial:** medir los pasos y el tiempo necesarios para arrancar un SaaS nuevo desde PymeKit. El autor lo abordará más adelante (a más tardar, antes de F6). | Aplazado |
| P-02 | Nombre definitivo del esquema SQL del CMS (renombrarlo o mantenerlo) | Se decide en F2 |
| P-03 | Qué hacer con el servidor MCP de desarrollo heredado | Se decide en F1 |
| P-04 | Integrar la plantilla LaTeX oficial desde Overleaf (ver `memoria/README.md`) | Pendiente: el autor pasará el `.zip` |
| P-05 | Crear el repositorio remoto (GitHub privado) y configurar `origin` | ✅ Cerrado: `https://github.com/emelgo/TFG` |
| P-06 | Cómo presenta la memoria la parte reutilizada sin nombrar los proyectos de referencia (ADR-007); confirmar con el tutor | Abierto |
