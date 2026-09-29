# Matriz de trazabilidad

Esta matriz relaciona cada requisito (`REQUISITOS.md`) con el código que lo implementa, las pruebas que lo verifican y la sección de la memoria que lo describe. Se actualiza al cerrar cada tarea. La tabla de etiquetas `[TFG]` del final se regenera con `node scripts/tfg/tfg-tags.mjs --write`.

**Leyenda:** ⬜ pendiente · 🟨 en curso o parcial · ✅ implementado y verificado.

_Última actualización: 2026-09-29 (F2.4b cerrada)._

| Req. | Código principal | Pruebas (evidencia) | Memoria | Estado | Notas |
|---|---|---|---|---|---|
| RF-01 | `apps/web/src/routes` (`_marketing`, `_authenticated`) | E2E `authentication`, `account`; CU-01 probado a mano por el autor | Implementación > Frontend | ✅ | Base heredada (F1). Landing sin blog, docs ni changelog (ADR-004) |
| RF-02 | `apps/web/src/lib/**/*.functions.ts`, `packages/function-middleware` | unit + E2E | Diseño > Arquitectura | ✅ | *Server functions* con middleware tipado |
| RF-03 | `packages/features/auth` | E2E `authentication` | Diseño > Autenticación | ✅ | Contraseña, enlace mágico, verificación de email |
| RF-04 | `packages/features/auth` (MFA), `schemas/13-mfa.sql` | pgTAP `mfa`, E2E `admin`, `team-invitation-mfa` | Diseño > Autenticación | ✅ | MFA exigido en `/admin` (ADR-016) y en el CMS (ADR-014) |
| RF-05 | `packages/features/accounts` | E2E `account` | Implementación > Cuentas | ✅ | |
| RF-06 | `packages/features/team-accounts`, `schemas/04–07` | pgTAP (roles, membresías, invitaciones), E2E `team-accounts`, `invitations` | Diseño > Modelo de datos | 🟨 | Funciona con los roles heredados; roles para pymes en F5 |
| RF-07 | `packages/billing/*` | E2E `billing` (desactivado: faltan claves de Stripe) | Diseño > Pagos | 🟨 | Planes de pyme y pruebas con Stripe en modo test: F5 |
| RF-08 | `packages/features/admin`, `apps/web/src/routes/admin` | E2E `admin`, `cms-ui` | Implementación > Administración | ✅ | Consola compartida con el CMS; plataforma solo para super-admin (ADR-016) |
| RF-09 | `packages/cms/*`, `apps/web/src/routes/{admin,api}/cms`, `schemas/20–53` | pgTAP `cms-*` (1.154 del CMS), unit (1.313), E2E `cms-api`, `cms-ui`, `cms-data-explorer` | Diseño > CMS | 🟨 | BD, API, base de UI, listado y ficha hechos (F2.1–F2.4b); CRUD, usuarios, almacenamiento y ajustes: F2.4c–F2.7 |
| RF-10 | `schemas/47-cms-audit-logs.sql`, `packages/cms/audit-logs` | pgTAP `cms-audit-triggers` | Diseño > CMS | 🟨 | BD y API listas; interfaz en F2.6 |
| RF-11 | `schemas/52-cms-dashboards.sql`, `packages/cms/dashboards` | pgTAP `cms-dashboards-*`, unit (262) | Implementación > CMS | 🟨 | BD y API listas; interfaz en F2.8 (recortable) |
| RF-12 | `packages/features/notifications`, `packages/mailers` | — | Implementación | 🟨 | Heredado; sin prueba específica todavía |
| RF-13 | `packages/i18n` | — | Implementación > i18n | 🟨 | Infraestructura lista y namespace `cms`; falta el locale `es` (F3) |
| RNF-01 | `apps/web/src/config`, `turbo/generators`, `.env*` | Evaluación en F6 (P-01) | Validación > Reutilización | ⬜ | |
| RNF-02 | `schemas/**`, `packages/function-middleware`, `packages/cms/auth`, `routes/admin/route.tsx` | pgTAP 1.550, `/rls-review` (etapas 1–4), `cms-isolation`, E2E `cms-api`, `admin` | Diseño > Seguridad | ✅ | 2 brechas heredadas y 7 endurecimientos corregidos (ADR-015); ver `BITACORA.md` |
| RNF-03 | políticas RLS de `public` y `cms` | pgTAP heredados de aislamiento + `cms-isolation.test.sql` | Diseño > Seguridad | ✅ | |
| RNF-04 | estructura del monorepo (47 paquetes) | typecheck, `manypkg`, Turborepo (sin ciclos) | Implementación > Monorepo | ✅ | |
| RNF-05 | todo el código | CI (controles del TFG, lint, formato), `check-branding` | Implementación | 🟨 | Comentarios en español: F4 |
| RNF-06 | `apps/e2e`, `supabase/tests`, `*.test.ts` | CI (job E2E en PR), suites locales en verde | Pruebas | 🟨 | Se completa en F6 |
| RNF-07 | Dockerfiles, `docker-compose.yml`, Railway | — | Despliegue | ⬜ | F7 |
| RNF-08 | `packages/ui` | revisión manual | Implementación > UI | 🟨 | Heredado; revisión en F6 |
| RNF-09 | *loaders* + TanStack Query, paginación en servidor del CMS | revisión manual | Implementación | 🟨 | |

## Etiquetas `[TFG]` en el código

<!-- tfg-tags:inicio -->
_Tabla generada con `node scripts/tfg/tfg-tags.mjs --write` (58 etiquetas). No se edita a mano._

| Fichero:línea | Referencias | Qué ilustra |
|---|---|---|
| `apps/e2e/tests/cms/cms-api.spec.ts:14` | RF-09, RNF-02 | RF-09 · RNF-02: el acceso al CMS se verifica de extremo a extremo. |
| `apps/e2e/tests/cms/cms-data-explorer-record.spec.ts:16` | RF-09, ADR-014 | RF-09 · ADR-014: ficha del explorador con permisos del RBAC del CMS. |
| `apps/e2e/tests/cms/cms-data-explorer.spec.ts:16` | RF-09, ADR-014 | RF-09 · ADR-014: explorador de datos con permisos del RBAC del CMS. |
| `apps/e2e/tests/cms/cms-ui.spec.ts:17` | RF-08, RF-09, ADR-014 | RF-08 · RF-09 · ADR-014. |
| `apps/web/src/components/admin/admin-navigation.ts:13` | RF-08, RF-09, ADR-014 | RF-08 · RF-09 · ADR-014. |
| `apps/web/src/lib/admin/admin-guards.ts:15` | RF-08, RF-09, ADR-014 | RF-08 · RF-09 · ADR-014. |
| `apps/web/src/lib/cms/cms-access.ts:17` | RF-09, RNF-02, ADR-014 | RF-09 · RNF-02 · ADR-014: defensa en profundidad; la interfaz nunca es |
| `apps/web/src/lib/cms/cms-fetch.ts:28` | RF-09, ADR-011 | RF-09 · ADR-011: una sola aplicación sirve la interfaz y la API del |
| `apps/web/src/routes/admin/cms/index.tsx:12` | RF-09 | RF-09: el explorador de datos solo ofrece lo que el RBAC del CMS |
| `apps/web/src/routes/admin/cms/resources/$schema/$table/index.tsx:23` | RF-09, ADR-011, ADR-013 | RF-09 · ADR-011 · ADR-013: explorador de datos como ruta de la web. |
| `apps/web/src/routes/admin/cms/resources/$schema/$table/record/$id.tsx:11` | RF-09, ADR-011, ADR-013 | RF-09 · ADR-011 · ADR-013: ficha del explorador como ruta de la web. |
| `apps/web/src/routes/admin/cms/resources/$schema/$table/record/index.tsx:13` | RF-09, ADR-011, ADR-013 | RF-09 · ADR-011 · ADR-013: ficha del explorador como ruta de la web. |
| `apps/web/src/routes/admin/cms/route.tsx:21` | RF-09, ADR-011, ADR-014 | RF-09 · ADR-011 · ADR-014: interfaz del CMS como rutas de la web, con |
| `apps/web/src/routes/admin/route.tsx:17` | RF-08, RF-09, ADR-014 | RF-08 · RF-09 · ADR-014: una sola consola para la plataforma y el CMS. |
| `apps/web/src/routes/admin/route.tsx:49` | RNF-02, ADR-014 | RNF-02 · ADR-014/016: la consola exige SIEMPRE segundo factor. |
| `apps/web/src/routes/api/cms/$.ts:19` | RF-09, ADR-011 | RF-09 · ADR-011: el CMS se integra en la web como una API Hono montada |
| `apps/web/supabase/schemas/23-cms-auth.sql:63` | RNF-02 | RNF-02 · Corrección de seguridad de PymeKit (fallo heredado). |
| `apps/web/supabase/schemas/23-cms-auth.sql:117` | ADR-014 | ADR-014 · En PymeKit el MFA es obligatorio salvo que se desactive |
| `apps/web/supabase/schemas/24-cms-utils.sql:126` | RNF-02 | RNF-02 · Corrección de PymeKit (hallada en la refutación de |
| `apps/web/supabase/schemas/24-cms-utils.sql:477` | RNF-02 | RNF-02: PymeKit revoca por defecto el EXECUTE de PUBLIC sobre todas las |
| `apps/web/supabase/schemas/40-cms-permissions-rls.sql:23` | RNF-02 | RNF-02 · Corrección de PymeKit: la condición heredada |
| `apps/web/supabase/schemas/40-cms-permissions-rls.sql:64` | RNF-02 | RNF-02 · Corrección de PymeKit (brecha heredada detectada en /rls-review). |
| `apps/web/supabase/schemas/40-cms-permissions-rls.sql:155` | RNF-02 | RNF-02 · Mismo arreglo que en update_role_permissions: el WITH CHECK |
| `apps/web/supabase/schemas/40-cms-permissions-rls.sql:210` | RNF-02 | RNF-02 · Mismo arreglo: la fila nueva debe seguir cumpliendo que el |
| `apps/web/supabase/schemas/46-cms-crud-functions.sql:30` | RNF-02 | RNF-02 · Corrección de PymeKit: igual que insert/update/delete, |
| `apps/web/supabase/schemas/46-cms-crud-functions.sql:1563` | RNF-02 | RNF-02 · Corrección de PymeKit: esta función salta RLS |
| `apps/web/supabase/schemas/46-cms-crud-functions.sql:1646` | RNF-02 | RNF-02: `grant` explícitos que sustituyen al EXECUTE implícito de |
| `apps/web/supabase/schemas/47-cms-audit-logs.sql:187` | RNF-02 | RNF-02: la API del CMS registra operaciones sobre `auth.users` con esta |
| `apps/web/supabase/schemas/52-cms-dashboards.sql:82` | RNF-02 | RNF-02 · Corrección de PymeKit: sin acceso de administración |
| `apps/web/supabase/schemas/52-cms-dashboards.sql:117` | RNF-02 | RNF-02 · Corrección de PymeKit: sin acceso de administración |
| `apps/web/supabase/schemas/52-cms-dashboards.sql:323` | RNF-02 | RNF-02 · Corrección de PymeKit: listar paneles exige acceso de |
| `apps/web/supabase/schemas/53-cms-super-admin.sql:30` | RF-08, RF-09, ADR-014 | RF-08, RF-09 y ADR-014: el super-admin es la raíz del CMS sin |
| `apps/web/supabase/schemas/53-cms-super-admin.sql:36` | RNF-02 | RNF-02 · Solo puede existir un rol y un grupo marcados como raíz. |
| `apps/web/supabase/schemas/53-cms-super-admin.sql:322` | RNF-02 | RNF-02: ninguna de estas funciones debe poder invocarse desde la API. |
| `apps/web/supabase/schemas/53-cms-super-admin.sql:351` | RNF-02, ADR-014 | RNF-02 · ADR-014: MFA obligatorio para entrar al CMS. |
| `apps/web/supabase/seed.sql:304` | RF-09, RF-10 | RF-09, RF-10. |
| `apps/web/supabase/seed.sql:334` | RF-09, ADR-014 | RF-09 · ADR-014: RBAC del CMS para el personal que no es super-admin. |
| `apps/web/supabase/tests/database/cms-dashboards-security.test.sql:253` | RNF-02 | RNF-02 · Endurecimiento de PymeKit: sin acceso de administración |
| `apps/web/supabase/tests/database/cms-isolation.test.sql:19` | RF-09, RNF-02, RNF-03, ADR-014, ADR-015 | RF-09, RNF-02, RNF-03 · ADR-014 y ADR-015. |
| `apps/web/supabase/tests/database/cms-super-admin-root.test.sql:9` | RF-08, RF-09, RNF-02, ADR-014 | RF-08, RF-09, RNF-02 y ADR-014. |
| `packages/cms/api/src/client.ts:13` | RF-09, ADR-011 | RF-09 · ADR-011: la interfaz y la API del CMS se comunican por RPC |
| `packages/cms/api/src/server.ts:20` | RF-09, ADR-011 | RF-09 · ADR-011: CMS integrado en la web como una API Hono montada en |
| `packages/cms/api/src/server.ts:153` | RNF-02, ADR-014 | RNF-02 · ADR-014/015: además del claim, se pide a la base de |
| `packages/cms/auth/src/api/routes/index.ts:26` | RF-09, RNF-02, ADR-014 | RF-09 · RNF-02 · ADR-014: acceso al CMS integrado en la consola de |
| `packages/cms/auth/src/api/services/authorization.service.ts:585` | RF-09, ADR-014 | RF-09 · ADR-014: la visibilidad de la interfaz se deriva del RBAC |
| `packages/cms/dashboards/src/lib/filters/filter-item.types.ts:7` | ADR-011 | ADR-011 |
| `packages/cms/data-explorer-ui/src/components/data-explorer-table-view.tsx:14` | RF-09 | RF-09: explorador de datos del CMS (listado). |
| `packages/cms/data-explorer-ui/src/components/filters/views-container.tsx:19` | RF-09 | RF-09: vistas guardadas del explorador de datos. |
| `packages/cms/data-explorer-ui/src/components/record/record-view.tsx:20` | RF-09 | RF-09: explorador de datos del CMS (ficha de un registro). |
| `packages/cms/data-explorer-ui/src/components/related-records/related-records-sections.tsx:16` | RF-09 | RF-09: navegación entre registros relacionados con permisos del RBAC. |
| `packages/cms/data-explorer-ui/src/utils/record-relations.ts:19` | RF-09 | RF-09: navegación entre registros relacionados con permisos del RBAC. |
| `packages/cms/settings/src/api/routes/get-account-route.ts:19` | RF-09, ADR-014 | RF-09 · ADR-014. |
| `packages/cms/supabase/src/clients/drizzle-client.ts:20` | RNF-02 | RNF-02 Seguridad: la autorización del CMS se aplica en la base de |
| `packages/cms/supabase/src/clients/hono-client.ts:18` | RF-09, ADR-011 | RF-09 · ADR-011: API del CMS integrada en la web. |
| `packages/cms/ui-core/src/api.ts:16` | RF-09, ADR-011 | RF-09 · ADR-011: interfaz y API del CMS comunicadas por RPC tipado. |
| `packages/cms/ui-core/src/sections.ts:24` | RF-09, ADR-014 | RF-09 · ADR-014: la interfaz refleja el RBAC propio del CMS. |
| `packages/supabase/src/types.ts:23` | ADR-014, RF-09 | ADR-014 · RF-09. |
| `scripts/tfg/check-branding.mjs:30` | RNF-05 | RNF-05 Mantenibilidad: control automático que se ejecuta en la CI. |
<!-- tfg-tags:fin -->
