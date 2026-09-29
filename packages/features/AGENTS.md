# Paquetes de funcionalidades (`packages/features`)

## Paquetes

- `accounts/` (`@pymekit/accounts`): gestión de la cuenta personal.
- `admin/` (`@pymekit/admin`): funcionalidades de super-administración.
- `auth/` (`@pymekit/auth`): autenticación (inicio de sesión, registro, MFA, captcha).
- `notifications/` (`@pymekit/notifications`): sistema de notificaciones.
- `team-accounts/` (`@pymekit/team-accounts`): cuentas de equipo, miembros, invitaciones y políticas.

## Reglas obligatorias

1. Se usan SIEMPRE las fábricas `createAccountsApi(client)` / `createTeamAccountsApi(client)`. NUNCA se consultan las tablas directamente si ya existe un método.
2. La cuenta activa (personal o de equipo) se resuelve en la base de datos y se lee con `useWorkspace()` de `apps/web/src/components/workspace-context.tsx`, disponible en cualquier punto bajo el *layout* `_authenticated`. Se distingue con `account.is_personal_account`.
3. NUNCA se ejecuta una operación de administración sin comprobar antes que el usuario es super-admin: en el servidor, las *server functions* usan `adminFunctionMiddleware`; fuera de ellas, `isSuperAdmin(client)`.
4. Las páginas de administración cuelgan de `apps/web/src/routes/admin/`, cuyo `route.tsx` actúa de guarda (redirige a los anónimos y devuelve 404 a quien no es super-admin). No se crean páginas de administración fuera de ese árbol.
5. SIEMPRE se usa `getLogger()` de `@pymekit/shared/logger` para los logs estructurados. NUNCA `console.log` en código de producción.
6. NUNCA se saltan las comprobaciones de permisos cuando existen: se usa `api.hasPermission({ accountId, userId, permission })` o el *middleware* `withFeaturePermission(permission)`.

## Imports clave

| API | Import |
| --- | --- |
| Cuentas personales | `createAccountsApi` de `@pymekit/accounts/api` |
| Cuentas de equipo | `createTeamAccountsApi` de `@pymekit/team-accounts/api` |
| Comprobación de super-admin | `isSuperAdmin` de `@pymekit/admin` |
| *Middleware* de administración | `adminFunctionMiddleware` de `@pymekit/function-middleware/functions` |
| Logger | `getLogger` de `@pymekit/shared/logger` |

## Ejemplos de referencia

- *Server functions*: `packages/features/accounts/src/server/personal-accounts.functions.ts`.
- *Server functions* de administración: `packages/features/admin/src/lib/server/admin.functions.ts`.
- Carga del *workspace*: `apps/web/src/lib/server/active-workspace.functions.ts`.
- Políticas de equipo: `packages/features/team-accounts/src/server/policies/policies.ts`.
