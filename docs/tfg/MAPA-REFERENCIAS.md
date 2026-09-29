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

| Origen (`../supamode/…`) | Destino | Tipo | Estado | Notas |
|---|---|---|---|---|
| `apps/app` | `apps/cms` | A | ⬜ | |
| `apps/api` | `apps/cms-api` | A | ⬜ | |
| `apps/e2e` | `apps/e2e` (subcarpeta cms) | A | ⬜ | |
| `apps/app/supabase/migrations` | `apps/web/supabase/…` | A | ⬜ | P-02 |
| `packages/*` | `packages/cms/*` (`@pymekit/cms-*`) | R | ⬜ | |
| `Dockerfile`, `docker-compose.yml` | base para F7 | A | ⬜ | |
| `docs/`, `.junie`, `.cursor` | — | X | — | No se copian |
| `.claude/skills/*` | fusionadas con las de la referencia SaaS | A | ✅ | F0 |

## Código nuevo (aportación propia)

| Destino | Descripción | Fase |
|---|---|---|
| `AGENTS.md`, `docs/tfg/*`, `.claude/*`, `scripts/tfg/*` | Harness, directrices y control de calidad del TFG | F0 |
| — | (se completa en fases posteriores) | |
