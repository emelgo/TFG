# @pymekit/supabase: base de datos y autenticación

Clientes de Supabase, *hooks* de autenticación y tipos generados de la base de datos.

## Reglas obligatorias

1. Hay tres clientes: `getSupabaseServerClient()` (servidor, aplica RLS), `useSupabase()` (*hook* de cliente, aplica RLS) y `getSupabaseServerAdminClient()` (ignora RLS; se usa lo mínimo posible y solo cuando hace falta). Existe además `getSupabaseBearerClient(token)` para peticiones autenticadas con cabecera `Authorization: Bearer`, que también aplica RLS.
2. NUNCA se usa el cliente administrador sin validar antes la autorización a mano, y siempre con un comentario que lo justifique.
3. NUNCA se edita `database.types.ts` a mano: se regenera con `pnpm supabase:web:typegen`.
4. Con el cliente normal no se añaden comprobaciones de autorización manuales redundantes: se confía en RLS.
5. SIEMPRE se añaden índices sobre las claves foráneas.
6. SIEMPRE se incluye el id de la cuenta en las rutas de Storage (el *bucket* `account_image` nombra cada fichero con el uuid de su cuenta y las políticas lo extraen con `kit.get_storage_filename_as_uuid`).
7. Para referirse a los tipos de una tabla se usa `Tables<'table_name'>` de `@pymekit/supabase/database`; no se crean tipos nuevos.

## Skills

- `/postgres-expert`: esquemas, RLS, migraciones y optimización de consultas.

## Funciones SQL auxiliares

```
public.has_role_on_account(account_id, account_role?)
public.has_permission(user_id, account_id, permission_name)
public.is_account_owner(account_id)
public.has_active_subscription(target_account_id)
public.is_team_member(account_id, user_id)
public.is_super_admin()
public.is_mfa_compliant()
```

## Imports clave

| Función | Import |
| --- | --- |
| Cliente de servidor | `getSupabaseServerClient` de `@pymekit/supabase/server-client` |
| *Hook* de cliente | `useSupabase` de `@pymekit/supabase/hooks/use-supabase` |
| Cliente administrador | `getSupabaseServerAdminClient` de `@pymekit/supabase/server-admin-client` |
| Cliente *bearer* | `getSupabaseBearerClient` de `@pymekit/supabase/bearer-client` |
| Exigir usuario | `requireUser` de `@pymekit/supabase/require-user` |
| Comprobación de MFA | `checkRequiresMultiFactorAuthentication` de `@pymekit/supabase/check-requires-mfa` |
| Tipos de la BD | `Tables`, `Database` de `@pymekit/supabase/database` |

## Ejemplo de referencia

- `apps/web/src/lib/server/active-workspace.functions.ts`: cliente de servidor con RLS.
