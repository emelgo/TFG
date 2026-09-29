# Mapa de reutilización del código de referencia

Este documento registra qué partes de `../makerkit` (referencia SaaS) y `../supamode` (referencia CMS) se reutilizan, dónde acaban en PymeKit y en qué estado están. Lo actualiza `/portar-modulo` y sirve de evidencia para el capítulo de Implementación, donde se distingue lo **reutilizado**, lo **adaptado** y lo **nuevo**.

**Estados** (📥 en F1 incluye ya el renombrado del scope a `@pymekit/*`):
- ⬜ pendiente
- 📥 copiado
- 🏷️ desmarcado
- 💬 comentado en español
- ✅ verificado (typecheck, tests y revisión)

**Tipo de reutilización:**
- **R**: reutilizado tal cual (solo se desmarca y se comenta).
- **A**: adaptado (cambios funcionales).
- **N**: nuevo (no existe en la referencia).
- **X**: descartado.

## Referencia SaaS → PymeKit

| Origen (`../makerkit/…`) | Destino | Tipo | Estado | Notas |
|---|---|---|---|---|
| `apps/web` | `apps/web` | A | 📥 | Sin blog, changelog, enlaces a docs ni estilos markdoc |
| `apps/web/supabase` | `apps/web/supabase` | A | 📥 | Recibe también las migraciones del CMS |
| `apps/e2e` | `apps/e2e` | A | 📥 | Se añaden los E2E del CMS |
| `packages/ui` | `packages/ui` | R | 📥 | |
| `packages/supabase` | `packages/supabase` | R | 📥 | |
| `packages/function-middleware` | `packages/function-middleware` | R | 📥 | |
| `packages/features/*` | `packages/features/*` | R/A | 📥 | Roles adaptados en F5 |
| `packages/billing/*` | `packages/billing/*` | R/A | 📥 | Planes de pyme en F5 |
| `packages/i18n` | `packages/i18n` | A | 📥 | Locale `es` |
| `packages/{shared,policies,mailers,email-templates,analytics,monitoring,notifications,otp,database-webhooks}` | igual | R | 📥 | |
| `packages/cms` (Keystatic/WordPress) | — | X | — | ADR-004 |
| `packages/mcp-server` | — | X | — | ADR-008 |
| `tooling/*`, `turbo/generators` | igual | R/A | 📥 | Sin script de licencia (ADR-006) ni generadores `setup`/`keystatic` (ADR-008) |
| `docs/`, `.junie`, `.gemini`, `.codex`, `CHANGELOG.md` | — | X | — | No se copian |
| `.claude/skills/*` | `.claude/skills/*` | A | ✅ | Traducidas y actualizadas en F0 |

## Referencia CMS → PymeKit

El CMS se integra en la web (ADR-011): no hay `apps/cms` ni `apps/cms-api`.

| Origen (`../supamode/…`) | Destino | Tipo | Estado | Notas |
|---|---|---|---|---|
| `apps/app/supabase/{schemas,migrations,tests}` | `apps/web/supabase/…` | A | 🏷️ | Esquema `cms` (ADR-012), pegamento super-admin (ADR-014), endurecimiento (ADR-015). Sin el seed de demo ni el instalador de extensiones de los tests. Comentarios en español: F4 |
| `apps/api/app/routes.ts` | `apps/web/src/routes/api/cms/$.ts` + `packages/cms/api` | A | 🏷️ | Hono montado en `/api/cms`. F2.2 |
| `packages/features/*` (parte `/routes`, servidor) | `packages/cms/<feature>` | R/A | 🏷️ | Servicios Drizzle y rutas Hono. F2.2 |
| `packages/{supabase,permissions,resources,query-builder,filters-core,data-explorer-core,formatters,types}` | `packages/cms/*` | R/A | 🏷️ | F2.2. `schema` (generador de seeds) y `captcha` descartados: el CMS está detrás de la consola admin |
| `packages/features/*` (parte `/router`, cliente) | `apps/web/src/routes/admin/cms/**` + paquetes cliente `packages/cms/{ui-core,data-explorer-ui,filters,table}` | A | 🟨 | Reescritura a TanStack Router, Form y use-intl (ADR-013). Explorador de datos hecho (F2.4); resto F2.5–F2.8 |
| `packages/ui` | `@pymekit/ui` | A | ⬜ | Solo se incorporan los componentes que falten |
| `packages/shared` (router-query-bridge) | — | X | — | Sustituido por *loaders* de TanStack + Query |
| `apps/app/src` (entrada de la SPA, `main.tsx`) | — | X | — | Lo sustituye el router de la web |
| `apps/e2e` | `apps/e2e/tests/cms` | A | ⬜ | F2.9 |
| `Dockerfile`, `nginx.conf.template`, `vercel.json` | — | X | — | Un único servicio (la web). Despliegue en F7 |
| `docs/`, `.junie`, `.cursor` | — | X | — | No se copian |
| `.claude/skills/*` | fusionadas con las de la referencia SaaS | A | ✅ | F0; se revisan en F2.9 |

## Código nuevo (aportación propia)

| Destino | Descripción | Fase |
|---|---|---|
| `AGENTS.md`, `docs/tfg/*`, `.claude/*`, `scripts/tfg/*` | Harness, directrices y control de calidad del TFG | F0 |
| — | (se completa en fases posteriores) | |
