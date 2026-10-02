# App web (`apps/web`)

Aplicación SaaS de PymeKit: TanStack Start (rutas por fichero + `createServerFn`), React 19, Vite y Nitro como servidor. Los patrones generales (server functions, clientes Supabase, formularios, multi-tenant) están en el `AGENTS.md` raíz, apartado 4.1; aquí solo se describe la estructura de esta carpeta.

## Estructura

| Ruta | Contenido |
|---|---|
| `src/routes/` | Rutas por fichero. `routeTree.gen.ts` se genera (`pnpm --filter web generate-routes`) y nunca se edita a mano |
| `src/routes/__root.tsx` | `beforeLoad` raíz: resuelve `user`, `locale` y `theme` y los deja en el contexto del *router* |
| `src/routes/_authenticated/` | Área privada. Su `route.tsx` exige sesión y MFA y carga el *workspace* activo en el contexto |
| `src/routes/_marketing/` | Páginas públicas (inicio, precios, blog, FAQ, contacto, textos legales). El blog (`blog/`) lee las entradas publicadas con las *server functions* de `src/lib/blog/` (cliente con RLS) y pinta el Markdown con `@pymekit/ui/markdown` |
| `src/routes/admin/` | Consola de administración. `route.tsx` redirige a los anónimos al inicio de sesión y devuelve 404 a quien no es super-admin ni personal del CMS (`has_cms_access`). Las páginas de la plataforma (`index.tsx`, `accounts/`) exigen super-admin (`requirePlatformAdmin`) y redirigen al personal a `/admin/cms` |
| `src/components/admin/` | Navegación de la consola (`admin-navigation.ts`, barra lateral y menú móvil): una sola consola por áreas de negocio («Inicio», un plegable por área con sus tablas según `ui_config.navigation_group`, «Gestión de cuentas» dentro de «Cuentas» para el super-admin, y las herramientas del CMS con «Todas las tablas») |
| `src/routes/admin/cms/` | Interfaz del CMS (ADR-011): *layout* con la comprobación de acceso contra la API del CMS y las pantallas de cada sección. Código de apoyo en `src/lib/cms/` y `@pymekit/cms-ui-core` |
| `src/routes/auth/`, `join/` | Autenticación y aceptación de invitaciones |
| `src/routes/api/` | Rutas de servidor: webhooks de facturación y de BD, `healthcheck`, `version` |
| `src/lib/` | *Server functions* (`*.functions.ts`) y servicios de servidor (`*.server.ts`) de la app |
| `src/components/` | Componentes propios de la app (proveedores raíz, navegación, `workspace-context.tsx`, `analytics-provider.tsx`) |
| `src/config/` | Configuración reutilizable (`*.config.ts`): app, auth, facturación, rutas, navegación, *feature flags* y modo de cuentas |
| `supabase/` | Esquemas, migraciones y pruebas pgTAP de toda la BD (ver `supabase/AGENTS.md`) |
| `vite/` | Plugins de Vite propios, como `server-leak-guard.ts` |

## Reglas

1. Los imports internos usan el alias `#/*` (`#/config/paths.config.ts`), definido en `package.json`.
2. Los módulos solo de servidor llevan el sufijo `.server.ts` y solo se importan desde un `loader` o un *handler* de `createServerFn`. El plugin `serverLeakGuard` hace fallar la *build* del cliente si alguno acaba en un *chunk* del navegador.
3. La cuenta activa se lee con `useWorkspace()` (`src/components/workspace-context.tsx`) en cualquier punto bajo `_authenticated`; se distingue con `account.is_personal_account`.
4. Las superficies de cuentas disponibles dependen de `VITE_ACCOUNT_MODE` (`personal-only`, `organizations-only` o `hybrid`), resuelto en `src/config/account-mode.config.ts` y expuesto por `feature-flags.config.ts`. No se comprueban variables de entorno sueltas en los componentes.
5. Las variables públicas llevan el prefijo `VITE_`; los secretos nunca.
6. Logs con `getLogger()` de `@pymekit/shared/logger`, nunca `console.log`.

## Comandos

```bash
pnpm --filter web dev          # Servidor de desarrollo
pnpm --filter web typecheck    # Comprobación de tipos
pnpm --filter web build        # Build de producción
pnpm supabase:web:start        # Supabase local
```
