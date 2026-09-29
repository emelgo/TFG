# Matriz de trazabilidad

Esta matriz relaciona cada requisito (`REQUISITOS.md`) con el código que lo implementa, las pruebas que lo verifican y la sección de la memoria que lo describe. Se actualiza al terminar cada tarea y siempre que se añade una etiqueta `[TFG]` en el código.

| Req. | Código principal | Pruebas | Memoria | Estado |
|---|---|---|---|---|
| RF-01 | `apps/web/src/routes` | E2E CU-01 | Implementación > Frontend | ⬜ |
| RF-02 | `apps/web/src/lib/server/*.functions.ts`, `packages/function-middleware` | unit, E2E | Diseño > Arquitectura | ⬜ |
| RF-03 | `packages/features/auth` | E2E `authentication` | Diseño > Autenticación | ⬜ |
| RF-04 | `packages/features/auth` (MFA), `supabase/schemas/*mfa*` | pgTAP, E2E | Diseño > Autenticación | ⬜ |
| RF-05 | `packages/features/accounts` | E2E `account` | Implementación > Cuentas | ⬜ |
| RF-06 | `packages/features/team-accounts`, `supabase/schemas/*roles*`, `*memberships*` | pgTAP, E2E `team-accounts`, `invitations` | Diseño > Modelo de datos | ⬜ |
| RF-07 | `packages/billing/*` | E2E `billing` | Diseño > Pagos | ⬜ |
| RF-08 | `packages/features/admin` | E2E `admin` | Implementación > Administración | ⬜ |
| RF-09 | `packages/cms/*`, `apps/web/src/routes/{admin,api}/cms` | E2E CMS, pgTAP | Diseño > CMS | ⬜ |
| RF-10 | `packages/cms/*` (auditoría) | E2E CMS | Diseño > CMS | ⬜ |
| RF-11 | `packages/cms/*` (dashboards) | E2E CMS | Implementación > CMS | ⬜ |
| RF-12 | `packages/features/notifications`, `packages/mailers` | — | Implementación | ⬜ |
| RF-13 | `packages/i18n` | E2E (idioma) | Implementación > i18n | ⬜ |
| RNF-01 | `apps/web/src/config`, `turbo/generators`, `.env.example` | Evaluación F6 | Validación > Reutilización | ⬜ |
| RNF-02 | `apps/web/supabase/schemas`, `packages/function-middleware` | pgTAP, `/rls-review` | Diseño > Seguridad | ⬜ |
| RNF-03 | políticas RLS `accounts_memberships` y tablas de negocio | pgTAP de aislamiento | Diseño > Seguridad | ⬜ |
| RNF-04 | estructura del monorepo | typecheck, manypkg | Implementación > Monorepo | ⬜ |
| RNF-05 | todo el código | CI, `revisor-comentarios` | Implementación | ⬜ |
| RNF-06 | `apps/e2e`, `supabase/tests`, `*.test.ts` | CI | Pruebas | ⬜ |
| RNF-07 | Dockerfiles, `docker-compose.yml`, Railway | Despliegue F7 | Despliegue | ⬜ |
| RNF-08 | `packages/ui` | revisión manual | Implementación > UI | ⬜ |
| RNF-09 | loaders, TanStack Query | revisión manual | Implementación | ⬜ |

**Leyenda:** ⬜ pendiente · 🟨 en curso · ✅ implementado y verificado.

## Etiquetas `[TFG]` en el código
| Fichero:línea | Requisito | Qué ilustra |
|---|---|---|
| — | — | (se rellena a partir de F1) |
