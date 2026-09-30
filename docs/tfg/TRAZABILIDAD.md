# Matriz de trazabilidad

Esta matriz relaciona cada requisito (`REQUISITOS.md`) con el código que lo implementa, las pruebas que lo verifican y la sección de la memoria que lo describe. Se actualiza al cerrar cada tarea. La tabla de etiquetas `[TFG]` del final se regenera con `node scripts/tfg/tfg-tags.mjs --write`.

**Leyenda:** ⬜ pendiente · 🟨 en curso o parcial · ✅ implementado y verificado.

_Última actualización: 2026-09-30 (F2.6b cerrada)._

| Req. | Código principal | Pruebas (evidencia) | Memoria | Estado | Notas |
|---|---|---|---|---|---|
| RF-01 | `apps/web/src/routes` (`_marketing`, `_authenticated`), `_marketing/blog` | E2E `authentication`, `account`, `blog`; CU-01 probado a mano por el autor | Implementación > Frontend | ✅ | Base heredada (F1). Blog recuperado en la BD y gestionado desde el CMS (ADR-017) |
| RF-02 | `apps/web/src/lib/**/*.functions.ts`, `packages/function-middleware` | unit + E2E | Diseño > Arquitectura | ✅ | *Server functions* con middleware tipado |
| RF-03 | `packages/features/auth` | E2E `authentication` | Diseño > Autenticación | ✅ | Contraseña, enlace mágico, verificación de email |
| RF-04 | `packages/features/auth` (MFA), `schemas/13-mfa.sql` | pgTAP `mfa`, E2E `admin`, `team-invitation-mfa` | Diseño > Autenticación | ✅ | MFA exigido en `/admin` (ADR-016) y en el CMS (ADR-014) |
| RF-05 | `packages/features/accounts` | E2E `account` | Implementación > Cuentas | ✅ | |
| RF-06 | `packages/features/team-accounts`, `schemas/04–07` | pgTAP (roles, membresías, invitaciones), E2E `team-accounts`, `invitations` | Diseño > Modelo de datos | 🟨 | Funciona con los roles heredados; roles para pymes en F5 |
| RF-07 | `packages/billing/*` | E2E `billing` (desactivado: faltan claves de Stripe) | Diseño > Pagos | 🟨 | Planes de pyme y pruebas con Stripe en modo test: F5 |
| RF-08 | `packages/features/admin`, `apps/web/src/routes/admin` | E2E `admin`, `cms-ui` | Implementación > Administración | ✅ | Consola compartida con el CMS; plataforma solo para super-admin (ADR-016) |
| RF-09 | `packages/cms/*`, `apps/web/src/routes/{admin,api}/cms`, `schemas/20–53` | pgTAP `cms-*` (1.154 del CMS), unit (1.313), E2E `cms-api`, `cms-ui`, `cms-data-explorer` | Diseño > CMS | 🟨 | Explorador de datos (F2.4), usuarios y almacenamiento (F2.5) hechos. Faltan ajustes y RBAC: F2.7 |
| RF-10 | `schemas/47-cms-audit-logs.sql`, `packages/cms/{audit-logs,audit-logs-ui}` | pgTAP `cms-audit-triggers`, `cms-audit-logs-integrity`, E2E `cms-audit-logs` | Diseño > CMS | ✅ | Listado, detalle y auditoría por miembro; entradas no falsificables y datos redactados según permisos (F2.6) |
| RF-11 | `schemas/52-cms-dashboards.sql`, `packages/cms/dashboards` | pgTAP `cms-dashboards-*`, unit (262) | Implementación > CMS | 🟨 | BD y API listas; interfaz en F2.8 (recortable) |
| RF-12 | `packages/features/notifications`, `packages/mailers` | — | Implementación | 🟨 | Heredado; sin prueba específica todavía |
| RF-13 | `packages/i18n` | — | Implementación > i18n | 🟨 | Infraestructura lista y namespace `cms`; falta el locale `es` (F3) |
| RNF-01 | `apps/web/src/config`, `turbo/generators`, `.env*` | Evaluación en F6 (P-01) | Validación > Reutilización | ⬜ | |
| RNF-02 | `schemas/**`, `packages/function-middleware`, `packages/cms/auth`, `routes/admin/route.tsx` | pgTAP 1.550, `/rls-review` (etapas 1–4), `cms-isolation`, E2E `cms-api`, `admin` | Diseño > Seguridad | ✅ | 2 brechas heredadas y 5 endurecimientos corregidos, más 4 funciones desincronizadas alineadas (ADR-015); ver `BITACORA.md` |
| RNF-03 | políticas RLS de `public` y `cms` | pgTAP heredados de aislamiento + `cms-isolation.test.sql` | Diseño > Seguridad | ✅ | |
| RNF-04 | estructura del monorepo (47 paquetes) | typecheck, `manypkg`, Turborepo (sin ciclos) | Implementación > Monorepo | ✅ | |
| RNF-05 | todo el código | CI (controles del TFG, lint, formato), `check-branding` | Implementación | 🟨 | Comentarios en español: F4 |
| RNF-06 | `apps/e2e`, `supabase/tests`, `*.test.ts` | CI (job E2E en PR), suites locales en verde | Pruebas | 🟨 | Se completa en F6 |
| RNF-07 | Dockerfiles, `docker-compose.yml`, Railway | — | Despliegue | ⬜ | F7 |
| RNF-08 | `packages/ui` | revisión manual | Implementación > UI | 🟨 | Heredado; revisión en F6 |
| RNF-09 | *loaders* + TanStack Query, paginación en servidor del CMS | revisión manual | Implementación | 🟨 | |

## Etiquetas `[TFG]` en el código

<!-- tfg-tags:inicio -->
_Tabla generada con `node scripts/tfg/tfg-tags.mjs --write` (144 etiquetas). No se edita a mano._

| Fichero:línea | Referencias | Qué ilustra |
|---|---|---|
| `apps/e2e/tests/blog/blog.spec.ts:16` | RF-01, RF-09, RNF-02, ADR-017 | RF-01 · RF-09 · RNF-02 · ADR-017. |
| `apps/e2e/tests/cms/cms-api.spec.ts:14` | RF-09, RNF-02 | RF-09 · RNF-02: el acceso al CMS se verifica de extremo a extremo. |
| `apps/e2e/tests/cms/cms-audit-logs.spec.ts:22` | RF-10, RNF-02, ADR-014 | RF-10 · RNF-02 · ADR-014. |
| `apps/e2e/tests/cms/cms-data-explorer-record.spec.ts:16` | RF-09, ADR-014 | RF-09 · ADR-014: ficha del explorador con permisos del RBAC del CMS. |
| `apps/e2e/tests/cms/cms-data-explorer-write.spec.ts:23` | RF-09, RNF-02, ADR-014 | RF-09 · RNF-02 · ADR-014: escrituras del CMS con permisos |
| `apps/e2e/tests/cms/cms-data-explorer.spec.ts:16` | RF-09, ADR-014 | RF-09 · ADR-014: explorador de datos con permisos del RBAC del CMS. |
| `apps/e2e/tests/cms/cms-display-formats.spec.ts:17` | RF-09, ADR-014, ADR-017 | RF-09 · ADR-014 · ADR-017. |
| `apps/e2e/tests/cms/cms-global-search.spec.ts:20` | RF-09, RNF-02, ADR-014 | RF-09 · RNF-02 · ADR-014. |
| `apps/e2e/tests/cms/cms-storage-explorer.spec.ts:24` | RF-09, RNF-02, ADR-014 | RF-09 · RNF-02 · ADR-014. |
| `apps/e2e/tests/cms/cms-ui.spec.ts:17` | RF-08, RF-09, ADR-014 | RF-08 · RF-09 · ADR-014. |
| `apps/e2e/tests/cms/cms-users-explorer.spec.ts:24` | RF-09, RNF-02, ADR-014 | RF-09 · RNF-02 · ADR-014. |
| `apps/web/src/components/admin/admin-navigation.ts:16` | RF-08, RF-09, ADR-014, ADR-017 | RF-08 · RF-09 · ADR-014 · ADR-017. |
| `apps/web/src/components/admin/admin-sidebar-resources.tsx:11` | RF-09, ADR-017 | RF-09 · ADR-017: la navegación refleja los permisos del RBAC; la API |
| `apps/web/src/components/admin/cms/cms-global-search.tsx:11` | RF-09 | RF-09. |
| `apps/web/src/lib/admin/admin-guards.ts:15` | RF-08, RF-09, ADR-014 | RF-08 · RF-09 · ADR-014. |
| `apps/web/src/lib/blog/blog.functions.ts:11` | RF-01, RNF-02, ADR-017 | RF-01 · RNF-02 · ADR-017. |
| `apps/web/src/lib/blog/blog.schema.ts:8` | RF-01, ADR-017 | RF-01 · ADR-017. |
| `apps/web/src/lib/blog/blog.service.server.ts:17` | RF-01, RNF-02, ADR-017 | RF-01 · RNF-02 · ADR-017: la web lee el contenido gestionado desde el |
| `apps/web/src/lib/cms/cms-access.ts:17` | RF-09, RNF-02, ADR-014 | RF-09 · RNF-02 · ADR-014: defensa en profundidad; la interfaz nunca es |
| `apps/web/src/lib/cms/cms-fetch.ts:28` | RF-09, ADR-011 | RF-09 · ADR-011: una sola aplicación sirve la interfaz y la API del |
| `apps/web/src/routes/_marketing/blog/$slug.tsx:13` | RF-01, RNF-02, ADR-017 | RF-01 · RNF-02 · ADR-017. |
| `apps/web/src/routes/_marketing/blog/index.tsx:10` | RF-01, ADR-017 | RF-01 · ADR-017: el contenido gestionado desde el CMS se publica en |
| `apps/web/src/routes/admin/cms/audit-logs/$id.tsx:11` | RF-10, ADR-011, ADR-013 | RF-10 · ADR-011 · ADR-013. |
| `apps/web/src/routes/admin/cms/audit-logs/index.tsx:18` | RF-10, ADR-011, ADR-013 | RF-10 · ADR-011 · ADR-013: registro de auditoría como ruta de la web. |
| `apps/web/src/routes/admin/cms/index.tsx:12` | RF-09 | RF-09: el explorador de datos solo ofrece lo que el RBAC del CMS |
| `apps/web/src/routes/admin/cms/resources/$schema/$table/index.tsx:23` | RF-09, ADR-011, ADR-013 | RF-09 · ADR-011 · ADR-013: explorador de datos como ruta de la web. |
| `apps/web/src/routes/admin/cms/resources/$schema/$table/new.tsx:12` | RF-09, ADR-011, ADR-013 | RF-09 · ADR-011 · ADR-013: creación de registros como ruta de la web. |
| `apps/web/src/routes/admin/cms/resources/$schema/$table/record/$id/edit.tsx:11` | RF-09, ADR-011, ADR-013 | RF-09 · ADR-011 · ADR-013: edición de registros como ruta de la web. |
| `apps/web/src/routes/admin/cms/resources/$schema/$table/record/$id/index.tsx:11` | RF-09, ADR-011, ADR-013 | RF-09 · ADR-011 · ADR-013: ficha del explorador como ruta de la web. |
| `apps/web/src/routes/admin/cms/resources/$schema/$table/record/edit.tsx:11` | RF-09, ADR-011, ADR-013 | RF-09 · ADR-011 · ADR-013: edición de registros como ruta de la web. |
| `apps/web/src/routes/admin/cms/resources/$schema/$table/record/index.tsx:13` | RF-09, ADR-011, ADR-013 | RF-09 · ADR-011 · ADR-013: ficha del explorador como ruta de la web. |
| `apps/web/src/routes/admin/cms/route.tsx:21` | RF-09, ADR-011, ADR-014 | RF-09 · ADR-011 · ADR-014: interfaz del CMS como rutas de la web, con |
| `apps/web/src/routes/admin/cms/storage/$bucket.tsx:12` | RF-09, RNF-02, ADR-011, ADR-013 | RF-09 · RNF-02 · ADR-011 · ADR-013. |
| `apps/web/src/routes/admin/cms/storage/index.tsx:8` | RF-09, ADR-011, ADR-013 | RF-09 · ADR-011 · ADR-013. |
| `apps/web/src/routes/admin/cms/users/$id.tsx:10` | RF-09, ADR-011, ADR-013 | RF-09 · ADR-011 · ADR-013. |
| `apps/web/src/routes/admin/cms/users/index.tsx:15` | RF-09, ADR-011, ADR-013 | RF-09 · ADR-011 · ADR-013: explorador de usuarios como ruta de la web. |
| `apps/web/src/routes/admin/route.tsx:17` | RF-08, RF-09, ADR-014 | RF-08 · RF-09 · ADR-014: una sola consola para la plataforma y el CMS. |
| `apps/web/src/routes/admin/route.tsx:49` | RNF-02, ADR-014 | RNF-02 · ADR-014/016: la consola exige SIEMPRE segundo factor. |
| `apps/web/src/routes/api/cms/$.ts:19` | RF-09, ADR-011 | RF-09 · ADR-011: el CMS se integra en la web como una API Hono montada |
| `apps/web/src/routes/sitemap[.]xml.ts:10` | RF-01, ADR-017 | RF-01 · ADR-017. |
| `apps/web/supabase/schemas/19-blog.sql:32` | RF-01, RF-09, RNF-02, ADR-017 | RF-01 · RF-09 · RNF-02 · ADR-017: blog en la base de datos, |
| `apps/web/supabase/schemas/19-blog.sql:55` | RNF-02 | RNF-02: el esquema se abre solo después de cerrar todo lo demás. |
| `apps/web/supabase/schemas/19-blog.sql:193` | RNF-02 | RNF-02 · Solo imágenes servidas por HTTPS: evita contenido mixto y |
| `apps/web/supabase/schemas/19-blog.sql:240` | RNF-02 | RNF-02 · Lectura por columnas: la web no necesita saber qué usuario |
| `apps/web/supabase/schemas/19-blog.sql:320` | RNF-02 | RNF-02 · Solo lo publicado y con fecha ya alcanzada es visible: |
| `apps/web/supabase/schemas/23-cms-auth.sql:63` | RNF-02 | RNF-02 · Corrección de seguridad de PymeKit (fallo heredado). |
| `apps/web/supabase/schemas/23-cms-auth.sql:113` | RNF-02 | RNF-02 · Endurecimiento F2.6 (bitácora B-34). Quien tiene un factor |
| `apps/web/supabase/schemas/23-cms-auth.sql:130` | ADR-014 | ADR-014 · En PymeKit el MFA es obligatorio salvo que se desactive |
| `apps/web/supabase/schemas/24-cms-utils.sql:126` | RNF-02 | RNF-02 · Corrección de PymeKit (hallada en la refutación de |
| `apps/web/supabase/schemas/24-cms-utils.sql:477` | RNF-02 | RNF-02: PymeKit revoca por defecto el EXECUTE de PUBLIC sobre todas las |
| `apps/web/supabase/schemas/40-cms-permissions-rls.sql:23` | RNF-02 | RNF-02 · Corrección de PymeKit: la condición heredada |
| `apps/web/supabase/schemas/40-cms-permissions-rls.sql:64` | RNF-02 | RNF-02 · Corrección de PymeKit (brecha heredada detectada en /rls-review). |
| `apps/web/supabase/schemas/40-cms-permissions-rls.sql:155` | RNF-02 | RNF-02 · Mismo arreglo que en update_role_permissions: el WITH CHECK |
| `apps/web/supabase/schemas/40-cms-permissions-rls.sql:210` | RNF-02 | RNF-02 · Mismo arreglo: la fila nueva debe seguir cumpliendo que el |
| `apps/web/supabase/schemas/45-cms-sync-managed-tables.sql:83` | RF-09 | RF-09 · Corrección de PymeKit (F2.6b): la versión heredada |
| `apps/web/supabase/schemas/46-cms-crud-functions.sql:30` | RNF-02 | RNF-02 · Corrección de PymeKit: igual que insert/update/delete, |
| `apps/web/supabase/schemas/46-cms-crud-functions.sql:401` | RNF-02 | RNF-02 · `RAISE LOG` y no `WARNING` (bitácora B-33): un |
| `apps/web/supabase/schemas/46-cms-crud-functions.sql:614` | RNF-02 | RNF-02 · `RAISE LOG` y no `WARNING` (bitácora B-33): un |
| `apps/web/supabase/schemas/46-cms-crud-functions.sql:928` | RNF-02 | RNF-02 · `RAISE LOG` y no `WARNING` (bitácora B-33): un |
| `apps/web/supabase/schemas/46-cms-crud-functions.sql:1572` | RNF-02 | RNF-02 · Corrección de PymeKit: esta función salta RLS |
| `apps/web/supabase/schemas/46-cms-crud-functions.sql:1655` | RNF-02 | RNF-02: `grant` explícitos que sustituyen al EXECUTE implícito de |
| `apps/web/supabase/schemas/47-cms-audit-logs.sql:46` | RNF-02 | RNF-02 · Integridad del registro de auditoría (PymeKit, F2.6): el |
| `apps/web/supabase/schemas/47-cms-audit-logs.sql:57` | RNF-02 | RNF-02 · Redacción en la base de datos (bitácora B-31). El SELECT se |
| `apps/web/supabase/schemas/47-cms-audit-logs.sql:225` | RNF-02 | RNF-02 · PymeKit, F2.6. |
| `apps/web/supabase/schemas/47-cms-audit-logs.sql:264` | RNF-02 | RNF-02 · Redacción de los datos de fila en la base de datos |
| `apps/web/supabase/schemas/47-cms-audit-logs.sql:378` | RNF-02 | RNF-02: `create_audit_log` escribe cualquier operación, tabla y datos |
| `apps/web/supabase/schemas/48-cms-global-search.sql:20` | RNF-02 | RNF-02 · Endurecimiento de PymeKit (F2.6) sobre la función heredada: |
| `apps/web/supabase/schemas/48-cms-global-search.sql:30` | RNF-02 | RNF-02 · Segundo endurecimiento (F2.6, revisión `/rls-review`): |
| `apps/web/supabase/schemas/52-cms-dashboards.sql:82` | RNF-02 | RNF-02 · Corrección de PymeKit: sin acceso de administración |
| `apps/web/supabase/schemas/52-cms-dashboards.sql:117` | RNF-02 | RNF-02 · Corrección de PymeKit: sin acceso de administración |
| `apps/web/supabase/schemas/52-cms-dashboards.sql:323` | RNF-02 | RNF-02 · Corrección de PymeKit: listar paneles exige acceso de |
| `apps/web/supabase/schemas/53-cms-super-admin.sql:30` | RF-08, RF-09, ADR-014 | RF-08, RF-09 y ADR-014: el super-admin es la raíz del CMS sin |
| `apps/web/supabase/schemas/53-cms-super-admin.sql:36` | RNF-02 | RNF-02 · Solo puede existir un rol y un grupo marcados como raíz. |
| `apps/web/supabase/schemas/53-cms-super-admin.sql:322` | RNF-02 | RNF-02: ninguna de estas funciones debe poder invocarse desde la API. |
| `apps/web/supabase/schemas/53-cms-super-admin.sql:351` | RNF-02, ADR-014 | RNF-02 · ADR-014: MFA obligatorio para entrar al CMS. |
| `apps/web/supabase/seed.sql:304` | RF-09, RF-10 | RF-09, RF-10. |
| `apps/web/supabase/seed.sql:334` | RF-09, ADR-014 | RF-09 · ADR-014: RBAC del CMS para el personal que no es super-admin. |
| `apps/web/supabase/seed.sql:409` | RF-01, ADR-017 | RF-01 · ADR-017: contenido gestionado desde el CMS. |
| `apps/web/supabase/seed.sql:485` | RF-09, RNF-01, ADR-017 | RF-09 · RNF-01 (P-01) · ADR-017. |
| `apps/web/supabase/tests/database/anon-surface.test.sql:17` | RNF-02, ADR-017 | RNF-02 · ADR-017. |
| `apps/web/supabase/tests/database/blog.test.sql:22` | RF-01, RF-09, RNF-02, ADR-017 | RF-01 · RF-09 · RNF-02 · ADR-017. |
| `apps/web/supabase/tests/database/cms-audit-isolation.test.sql:25` | RNF-02, ADR-015 | RNF-02 · ADR-015. |
| `apps/web/supabase/tests/database/cms-audit-logs-integrity.test.sql:22` | RNF-02, ADR-015 | RNF-02 · ADR-015. |
| `apps/web/supabase/tests/database/cms-dashboards-security.test.sql:253` | RNF-02 | RNF-02 · Endurecimiento de PymeKit: sin acceso de administración |
| `apps/web/supabase/tests/database/cms-hardening-f26.test.sql:19` | RNF-02, ADR-015 | RNF-02 · ADR-015 · bitácora B-31 a B-34. |
| `apps/web/supabase/tests/database/cms-isolation.test.sql:19` | RF-09, RNF-02, RNF-03, ADR-014, ADR-015 | RF-09, RNF-02, RNF-03 · ADR-014 y ADR-015. |
| `apps/web/supabase/tests/database/cms-super-admin-root.test.sql:9` | RF-08, RF-09, RNF-02, ADR-014 | RF-08, RF-09, RNF-02 y ADR-014. |
| `packages/cms/api/src/client.ts:13` | RF-09, ADR-011 | RF-09 · ADR-011: la interfaz y la API del CMS se comunican por RPC |
| `packages/cms/api/src/server.ts:20` | RF-09, ADR-011 | RF-09 · ADR-011: CMS integrado en la web como una API Hono montada en |
| `packages/cms/api/src/server.ts:153` | RNF-02, ADR-014 | RNF-02 · ADR-014/015: además del claim, se pide a la base de |
| `packages/cms/audit-logs-ui/src/components/audit-logs-view.tsx:12` | RF-10 | RF-10: consulta del registro de auditoría del CMS. |
| `packages/cms/audit-logs/src/api/routes/get-audit-logs-route.ts:19` | RF-10, RNF-02 | RF-10 · RNF-02. |
| `packages/cms/audit-logs/src/api/services/audit-logs.service.ts:33` | RF-10, RNF-02 | RF-10 · RNF-02: trazabilidad de las acciones del CMS con lectura |
| `packages/cms/audit-logs/src/api/utils/audit-logs-errors.ts:10` | RNF-02 | RNF-02 Seguridad: los errores internos no llegan al cliente. |
| `packages/cms/audit-logs/src/api/utils/audit-logs-query.ts:18` | RNF-02 | RNF-02: entrada validada y errores internos que no llegan al cliente. |
| `packages/cms/auth/src/api/routes/index.ts:26` | RF-09, RNF-02, ADR-014 | RF-09 · RNF-02 · ADR-014: acceso al CMS integrado en la consola de |
| `packages/cms/auth/src/api/routes/index.ts:153` | RNF-02 | RNF-02 · Falla en cerrado (BITACORA B-23): si no se puede comprobar el |
| `packages/cms/auth/src/api/services/__tests__/build-parameterized-statement.test.ts:9` | RNF-02 | RNF-02. |
| `packages/cms/auth/src/api/services/authorization.service.ts:474` | RF-09, ADR-014 | RF-09 · ADR-014: la visibilidad de la interfaz se deriva del RBAC |
| `packages/cms/auth/src/api/services/authorization.service.ts:710` | RNF-02 | RNF-02 · Corrección de seguridad de PymeKit (BITACORA B-24). |
| `packages/cms/dashboards/src/lib/filters/filter-item.types.ts:7` | ADR-011 | ADR-011 |
| `packages/cms/data-explorer-core/src/services/table-view-service.ts:447` | RNF-02 | RNF-02 · Corrección de PymeKit (F2.6b): las consultas de las |
| `packages/cms/data-explorer-core/src/utils/display-format-parser.ts:25` | — | Corrección de PymeKit |
| `packages/cms/data-explorer-core/src/utils/record-identity.ts:15` | RNF-02 | RNF-02: una edición o un borrado nunca afecta a más de un registro. |
| `packages/cms/data-explorer-ui/src/components/data-explorer-table-view.tsx:20` | RF-09 | RF-09: explorador de datos del CMS (listado). |
| `packages/cms/data-explorer-ui/src/components/filters/views-container.tsx:19` | RF-09 | RF-09: vistas guardadas del explorador de datos. |
| `packages/cms/data-explorer-ui/src/components/global-search.tsx:21` | RF-09 | RF-09: búsqueda transversal en los datos gestionados por el CMS. |
| `packages/cms/data-explorer-ui/src/components/record/record-form-view.tsx:19` | RF-09 | RF-09: creación y edición de registros del CMS. |
| `packages/cms/data-explorer-ui/src/components/record/record-form.tsx:18` | RF-09, ADR-013 | RF-09: formularios del CMS con TanStack Form y Zod (ADR-013). |
| `packages/cms/data-explorer-ui/src/components/record/record-view.tsx:23` | RF-09 | RF-09: explorador de datos del CMS (ficha de un registro). |
| `packages/cms/data-explorer-ui/src/components/related-records/related-records-sections.tsx:16` | RF-09 | RF-09: navegación entre registros relacionados con permisos del RBAC. |
| `packages/cms/data-explorer-ui/src/utils/record-form.ts:23` | RF-09 | RF-09: edición de registros del CMS a partir de metadatos. |
| `packages/cms/data-explorer-ui/src/utils/record-relations.ts:19` | RF-09 | RF-09: navegación entre registros relacionados con permisos del RBAC. |
| `packages/cms/data-explorer/src/api/routes/index.ts:813` | RF-09, RNF-02 | RF-09 · RNF-02: la autorización se aplica en la API y otra vez en la |
| `packages/cms/data-explorer/src/api/utils/crud-errors.ts:24` | RNF-02 | RNF-02 Seguridad: los errores de la base de datos no se filtran al |
| `packages/cms/query-builder/src/clauses/where-builder.ts:277` | — | Corrección de PymeKit (F2.6b): el patrón heredado solo pedía |
| `packages/cms/resources/src/api/routes/index.ts:5` | RF-09 | RF-09. |
| `packages/cms/resources/src/api/services/global-search.service.ts:18` | RF-09, RNF-02 | RF-09 · RNF-02 (bitácora B-32). |
| `packages/cms/resources/src/api/utils/global-search.ts:15` | RNF-02, RF-09 | RNF-02 · RF-09. |
| `packages/cms/settings/src/api/routes/get-account-route.ts:19` | RF-09, ADR-014 | RF-09 · ADR-014. |
| `packages/cms/shared/src/utils/storage-paths.ts:17` | RNF-02 | RNF-02 Seguridad: validación de rutas antes de usar el cliente de |
| `packages/cms/storage-explorer/src/api/routes/file-operations-route.ts:16` | RF-09, RNF-02 | RF-09 · RNF-02. |
| `packages/cms/storage-explorer/src/api/routes/get-bucket-contents-route.ts:11` | RF-09, RNF-02 | RF-09 · RNF-02. |
| `packages/cms/storage-explorer/src/api/routes/get-storage-buckets-route.ts:7` | RF-09, RNF-02 | RF-09 · RNF-02. |
| `packages/cms/storage-explorer/src/api/services/storage-permissions.service.ts:18` | RNF-02, RF-09 | RNF-02 · RF-09: autorización del almacenamiento en la base de datos. |
| `packages/cms/storage-explorer/src/api/services/storage.service.ts:29` | RF-09, RNF-02 | RF-09 · RNF-02: almacenamiento del CMS con autorización propia antes |
| `packages/cms/storage-explorer/src/utils/storage-errors.ts:13` | RNF-02 | RNF-02 Seguridad: los errores internos no llegan al cliente. |
| `packages/cms/storage-explorer/src/utils/upload-content-type.ts:17` | RNF-02 | RNF-02 Seguridad: ningún contenido subido desde el CMS se sirve como |
| `packages/cms/supabase/src/clients/drizzle-client.ts:20` | RNF-02 | RNF-02 Seguridad: la autorización del CMS se aplica en la base de |
| `packages/cms/supabase/src/clients/hono-client.ts:18` | RF-09, ADR-011 | RF-09 · ADR-011: API del CMS integrada en la web. |
| `packages/cms/ui-core/src/api.ts:16` | RF-09, ADR-011 | RF-09 · ADR-011: interfaz y API del CMS comunicadas por RPC tipado. |
| `packages/cms/ui-core/src/audit-logs-api.ts:14` | RF-09, RF-10, ADR-011 | RF-09 · RF-10 · ADR-011. |
| `packages/cms/ui-core/src/sections.ts:24` | RF-09, ADR-014 | RF-09 · ADR-014: la interfaz refleja el RBAC propio del CMS. |
| `packages/cms/ui-core/src/storage-api.ts:10` | RF-09, ADR-011 | RF-09 · ADR-011. |
| `packages/cms/ui-core/src/users-api.ts:12` | RF-09, ADR-011 | RF-09 · ADR-011. |
| `packages/cms/users-explorer/src/api/routes/index.ts:25` | RF-09, RNF-02 | RF-09 · RNF-02. |
| `packages/cms/users-explorer/src/api/services/admin-user.service.ts:24` | RF-09, RNF-02 | RF-09 · RNF-02: acciones sobre usuarios con autorización en el código |
| `packages/cms/users-explorer/src/api/services/auth-users.service.ts:19` | RF-09, RNF-02 | RF-09 · RNF-02: explorador de usuarios con autorización propia antes |
| `packages/cms/users-explorer/src/api/utils/user-protection.ts:35` | RNF-02 | RNF-02 Seguridad: autorización en el código antes del cliente de |
| `packages/cms/users-explorer/src/api/utils/users-errors.ts:12` | RNF-02 | RNF-02 Seguridad: los errores internos no llegan al cliente. |
| `packages/supabase/src/types.ts:23` | ADR-014, RF-09 | ADR-014 · RF-09. |
| `packages/ui/src/makerkit/markdown/markdown-policy.ts:24` | RNF-02, ADR-017 | RNF-02 · ADR-017: el Markdown del blog se renderiza de forma segura. |
| `packages/ui/src/makerkit/markdown/safe-markdown.tsx:18` | RNF-02, ADR-017 | RNF-02 · ADR-017: el contenido del CMS se muestra en la web sin |
| `scripts/tfg/check-branding.mjs:30` | RNF-05 | RNF-05 Mantenibilidad: control automático que se ejecuta en la CI. |
<!-- tfg-tags:fin -->
