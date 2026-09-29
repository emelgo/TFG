# Paquetes del CMS (`packages/cms/*`)

Lógica del CMS de datos integrado en la consola de super-admin (RF-09, ADR-011). Todos los paquetes se publican en el *workspace* como `@pymekit/cms-<nombre>`.

**Estado actual: solo servidor.** Aquí vive la API Hono del CMS (servicios Drizzle, rutas y esquemas Zod). La interfaz (`apps/web/src/routes/admin/cms/**`) se escribirá en incrementos posteriores con la pila de la web (TanStack Router + Query, `@tanstack/react-form`, `@pymekit/i18n`, `@pymekit/ui`); no se añaden componentes React a estos paquetes sin decidirlo antes.

## Paquetes

| Paquete | Contenido |
|---|---|
| `@pymekit/cms-api` | `./server`: `createCmsApiApp()` / `createCmsApiRouter()`, la aplicación Hono que registra todas las rutas. `./client`: cliente RPC tipado (`createHonoClient`, base `/api/cms`) para la futura interfaz |
| `@pymekit/cms-auth` | *Middleware* de autenticación (`./routes`) y `AuthorizationService` (`./services`) |
| `@pymekit/cms-supabase` | Clientes Drizzle (`./client`), esquema Drizzle del esquema SQL `cms` (`./schema`) y clientes Supabase para Hono (`./hono`) |
| `@pymekit/cms-permissions`, `@pymekit/cms-resources` | Roles/permisos del RBAC del CMS y recursos legibles por el usuario |
| `@pymekit/cms-data-explorer`, `@pymekit/cms-dashboards`, `@pymekit/cms-settings`, `@pymekit/cms-audit-logs`, `@pymekit/cms-users-explorer`, `@pymekit/cms-storage-explorer`, `@pymekit/cms-navigation` | Rutas y servicios de cada funcionalidad (export `./routes`) |
| `@pymekit/cms-data-explorer-core`, `@pymekit/cms-query-builder`, `@pymekit/cms-filters-core`, `@pymekit/cms-formatters` | Núcleo sin interfaz: consultas dinámicas, filtros y formateo (con tests unitarios) |
| `@pymekit/cms-types`, `@pymekit/cms-shared` | Tipos compartidos y utilidades de errores (`getErrorMessage`, `getPublicErrorMessage`) |

Los *logs* usan `getLogger()` de `@pymekit/shared/logger`, igual que el resto de PymeKit.

## Cómo llega una petición

1. `apps/web/src/routes/api/cms/$.ts` (ruta de servidor de TanStack Start) recibe cualquier `/api/cms/*` y la reenvía a `createCmsApiApp()`.
2. `GET /v1/health` responde sin sesión.
3. Cabeceras de seguridad y CSRF de Hono (el CSRF global de la web solo cubre las *server functions*).
4. `registerAuthMiddleware` (`@pymekit/cms-auth/routes`): verifica el JWT con `getClaims()` (401 si no hay sesión), exige `app_metadata.cms_access = 'true'` (403) y que el usuario no esté bloqueado. Deja el cliente Supabase verificado en `c.get('supabase')`.
5. Se crean `c.get('drizzle')` (transacciones con los *claims* del usuario) y `c.get('authorization')`.
6. La ruta de la funcionalidad llama a su servicio.

## Cómo añadir un *endpoint*

1. En el paquete de la funcionalidad, crea el servicio (clase + fábrica `createXService(c)`) que use `c.get('drizzle').runTransaction(...)`. Los algoritmos van en `lib/` o `utils/` como funciones puras, con tests.
2. Crea `registerXRoute(router: Hono)` con `router.get|post(...)('/v1/...', zValidator(...), handler)` y exporta su tipo (`export type XRoute = ReturnType<typeof registerXRoute>`) para el cliente RPC.
3. Expórtala desde `./routes` y regístrala en `registerFeatureRoutes()` de `packages/cms/api/src/server.ts`.
4. Añade un caso a `apps/e2e/tests/cms/cms-api.spec.ts` si cambia el control de acceso.

## Seguridad

- **Drizzle con *claims* por transacción.** `runTransaction` fija `request.jwt.claims`, `request.jwt.claim.sub` y el rol (`authenticated`/`anon`) con parámetros enlazados antes de cada transacción, así que Postgres aplica las políticas RLS del esquema `cms`. Nunca se interpola un valor del JWT en SQL.
- **`cms.verify_admin_access()` y RLS son la autoridad.** El *middleware* es solo la primera barrera: la base de datos comprueba además la cuenta activa del CMS y el MFA (aal2). Un super-admin con sesión aal1 pasa el *middleware* pero no ve datos.
- **Cliente administrador** (`getDrizzleSupabaseAdminClient`, `getSupabaseAdminClient`): ignora RLS. Solo después de comprobar permisos a mano y con un comentario que lo justifique.
- **Nunca** se importan rutas, servicios ni `@pymekit/cms-api/server` desde componentes o código de cliente: arrastran Drizzle, `postgres` y la clave secreta. Desde la interfaz solo se usa `@pymekit/cms-api/client` y los tipos de ruta con `import type`. El plugin `serverLeakGuard` de la web hace fallar la *build* si Drizzle o `postgres` acaban en un *chunk* del navegador.

## Variables de entorno

- `SUPABASE_DATABASE_URL`: conexión Postgres de Drizzle. Se lee en la primera petición; si falta, la web arranca y solo fallan las rutas del CMS.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLIC_KEY`, `SUPABASE_SECRET_KEY`, `VITE_SITE_URL`: las mismas de la web.
- `PERF_LOG_LEVEL=on` (opcional): activa las trazas de rendimiento de las consultas.

## Verificación

- `pnpm --filter "@pymekit/cms-*" typecheck` y `pnpm --filter "@pymekit/cms-*" test:unit`
- Los tests heredados (`__tests__`) se ejecutan con Vitest, pero se excluyen del `typecheck` de su paquete: sus *fixtures* no siguen los tipos estrictos actuales.
