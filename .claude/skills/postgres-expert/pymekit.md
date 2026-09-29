# Patrones de base de datos de PymeKit

## Ubicación de los esquemas

Todos los esquemas están en `apps/web/supabase/schemas/`, con prefijos numéricos que marcan el orden de dependencia. Ahí conviven el esquema `public` de la app SaaS y el esquema del CMS (RBAC de administración; en esta skill se escribe `<cms>` porque su nombre definitivo se fija en F2, ver `docs/tfg/DECISIONES.md`); las migraciones de ambos están en `apps/web/supabase/migrations/`.

## Funciones auxiliares existentes: NO las vuelvas a crear

```sql
-- Control de acceso a cuentas (esquema public)
public.has_role_on_account(account_id uuid, account_role varchar default null)
public.has_permission(user_id uuid, account_id uuid, permission_name app_permissions)
public.is_account_owner(account_id uuid)
public.has_active_subscription(target_account_id uuid)
public.is_team_member(account_id uuid, user_id uuid)
public.can_action_account_member(target_team_account_id uuid, target_user_id uuid)

-- Administración y MFA
public.is_super_admin()
public.is_aal2()
public.is_mfa_compliant()

-- Configuración
public.is_set(field_name text)

-- CMS (esquema <cms>)
<cms>.verify_admin_access()
<cms>.has_admin_permission(p_resource <cms>.system_resource, p_action <cms>.system_action)
<cms>.has_data_permission(p_action <cms>.system_action, p_schema_name varchar, p_table_name varchar default null)
<cms>.has_storage_permission(p_bucket_name text, p_action <cms>.system_action, p_object_path text)
<cms>.is_mfa_compliant()
```

`verify_admin_access()` exige la marca de acceso al CMS en `app_metadata` del JWT, una cuenta de administración activa y AAL2 si la configuración `requires_mfa` lo pide; los `has_*_permission` consultan el RBAC del CMS.

## Patrones de políticas RLS

### Acceso personal + equipo

```sql
-- El titular de la cuenta personal o cualquier miembro del equipo puede leer.
create policy "table_read" on public.table for select
  to authenticated using (
    account_id = (select auth.uid()) or
    public.has_role_on_account(account_id)
  );
```

`has_role_on_account()` devuelve `false` en las cuentas personales; si la tabla solo es de equipos, basta con esa llamada.

### Acceso por permiso (escrituras destructivas)

```sql
-- La membresía no autoriza a modificar: se exige el permiso concreto.
create policy "table_update" on public.table for update
  to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'feature.manage'::public.app_permissions))
  with check (public.has_permission((select auth.uid()), account_id, 'feature.manage'::public.app_permissions));
```

Acompáñalo de un `grant update (col1, col2)` por columnas, nunca de un `UPDATE` sobre toda la tabla.

### Política de *bucket* de Storage

```sql
-- Se filtra por bucket Y por propiedad: sin lo primero hay fuga entre buckets;
-- sin lo segundo, entre tenants del mismo bucket.
create policy bucket_policy_select on storage.objects for select
  to authenticated using (
    bucket_id = 'bucket_name'
    and (
      kit.get_storage_filename_as_uuid(name) = auth.uid()
      or public.has_role_on_account(kit.get_storage_filename_as_uuid(name))
    )
  );
```

## Añadir permisos nuevos

```sql
-- Se añade el valor al enum; debe confirmarse antes de poder usarlo en políticas.
alter type public.app_permissions add value 'feature.manage';
commit;
```

## Plantilla de tabla y flujo de migración

Ambos están en `apps/web/supabase/AGENTS.md` (secciones «Table Template» y «Migration Workflow»). Léelos allí y no de memoria: ese fichero es la única fuente de verdad sobre *grants*, acciones `on delete`, *triggers* y el flujo con `db:diff`, y cambia más a menudo que esta skill.

## Patrón de función SECURITY DEFINER

```sql
create or replace function public.admin_function(target_id uuid)
returns void
language plpgsql
security definer
-- search_path vacío: impide que quien llama secuestre la función con un
-- esquema propio que contenga objetos con el mismo nombre.
set search_path = ''
as $$
begin
  -- Como la función ignora RLS, SIEMPRE se validan los permisos primero.
  if not public.is_account_owner(target_id) then
    raise exception 'Access denied';
  end if;

  -- A partir de aquí es seguro continuar.
end;
$$;

-- Solo usuarios autenticados: la propia función comprueba que es el propietario.
grant execute on function public.admin_function(uuid) to authenticated;
```

## Tests pgTAP

Los *helpers* de prueba están en `apps/web/supabase/tests/database/00000-pymekit-helpers.sql`: `tests.create_supabase_user`, `tests.get_supabase_uid`, `pymekit.authenticate_as`, `pymekit.get_account_id_by_slug`, `pymekit.set_session_aal`, `pymekit.set_mfa_factor` y `pymekit.set_super_admin`. Usa correos `@pymekit.test` en los datos de prueba.
