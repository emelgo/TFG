/*
 * -------------------------------------------------------
 * Sección: endurecimiento del RBAC del CMS (F2.7b)
 *
 * La pestaña Ajustes > Permisos permite al personal del CMS crear y editar
 * roles, grupos de permisos y permisos. Las reglas de rango y de «solo se
 * concede lo que uno tiene» ya las aplican las políticas RLS y las funciones
 * de `34-cms-permissions-functions.sql` (ADR-015, bitácora B-05 y B-42).
 * Este fichero añade lo que faltaba para exponer esa gestión con seguridad:
 *
 *  1. Los objetos de sistema del super-admin (rol `Root`, grupo
 *     `Super Admin` y permisos `Root: *`, marcados en `metadata` por
 *     `53-cms-super-admin.sql`) son inmutables desde el CMS: nadie los
 *     renombra, borra ni cambia sus asignaciones con una sesión de usuario,
 *     tampoco otro super-admin. Solo los gestiona el pegamento de ADR-014.
 *  2. `UPDATE` por columnas en `roles`, `permission_groups` y `permissions`:
 *     el personal no puede reescribir `id` ni `created_by` de un grupo (que
 *     decide quién puede editarlo o borrarlo cuando no lo usa ningún rol).
 *     `metadata` sigue siendo editable, pero la guardia del punto 1 impide
 *     añadir o quitar las marcas de sistema.
 *  3. `current_account_has_storage_access()`: sustituye a la llamada que
 *     hacía la API a `has_permission` (que ya no se concede a
 *     `authenticated`) para decidir si se muestra la sección de
 *     almacenamiento.
 *
 * [TFG] RF-09 · RNF-02 · ADR-014 · ADR-015. Pruebas en
 * `tests/database/cms-rbac-f27b.test.sql`.
 * -------------------------------------------------------
 */

/*
 * cms.is_system_rbac_object
 *
 * Indica si un rol, grupo o permiso lleva la marca de sistema del
 * super-admin (`system_role`, `system_group` o `system_permission` en
 * `metadata`). Es `security definer` con RLS desactivado porque la guardia
 * debe ver la marca aunque el usuario no pueda leer la fila (por ejemplo,
 * el grupo `Super Admin` para quien no lo tiene). No se concede a nadie:
 * solo la llama la función de la guardia.
 */
create or replace function cms.is_system_rbac_object (p_kind text, p_id uuid) returns boolean
security definer
set
  row_security = off
set
  search_path = '' as $$
begin
    if p_id is null then
        return false;
    end if;

    return case p_kind
        when 'role' then exists (select 1 from cms.roles r where r.id = p_id and r.metadata ? 'system_role')
        when 'group' then exists (select 1 from cms.permission_groups g where g.id = p_id and g.metadata ? 'system_group')
        when 'permission' then exists (select 1 from cms.permissions p where p.id = p_id and p.metadata ? 'system_permission')
        else false
    end;
end;
$$ language plpgsql stable;

revoke execute on function cms.is_system_rbac_object (text, uuid) from public, anon, authenticated;

/*
 * cms.guard_system_rbac_objects (trigger BEFORE INSERT/UPDATE/DELETE)
 *
 * Rechaza con `42501` (mensaje fijo `SYSTEM_RBAC_OBJECT_PROTECTED`, que la
 * API traduce a `ROLE_/GROUP_/PERMISSION_SYSTEM_PROTECTED`) cualquier
 * escritura de una sesión de usuario sobre los objetos de sistema:
 *
 *  - `roles`, `permission_groups`, `permissions`: crear una fila con la
 *    marca, añadírsela a una existente, o modificar o borrar una marcada;
 *  - `role_permissions`: cualquier cambio en los permisos directos del rol
 *    de sistema;
 *  - `role_permission_groups`: cambios en los grupos del rol de sistema y
 *    colgar el grupo de sistema de cualquier otro rol (equivaldría a crear
 *    otro Root). Quitarlo de un rol que no es de sistema sí se permite: solo
 *    reduce privilegios y lo necesita el borrado en cascada de ese rol;
 *  - `permission_group_permissions`: cualquier cambio en el grupo de
 *    sistema.
 *
 * Además, en la misma sesión de usuario, impide borrar un rol que todavía
 * tiene miembros (`ROLE_HAS_MEMBERS`, ver el cuerpo).
 *
 * Cómo distingue «sesión de usuario» de «sistema»: la API del CMS ejecuta
 * cada transacción con `set local role authenticated` (igual que PostgREST),
 * y el parámetro `role` conserva ese valor aunque se esté dentro de una
 * función `security definer`. Las migraciones, el *seed*, el cliente de
 * servicio y los *triggers* de Auth que mantienen al super-admin
 * (`53-cms-super-admin.sql`) no fijan ese rol y no se ven afectados.
 */
create or replace function cms.guard_system_rbac_objects () returns trigger
security definer
set
  row_security = off
set
  search_path = '' as $$
declare
    v_row     jsonb;
    v_old     jsonb;
    v_blocked boolean := false;
begin
    if coalesce(current_setting('role', true), 'none') not in ('authenticated', 'anon') then
        return case when tg_op = 'DELETE' then old else new end;
    end if;

    v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
    v_old := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;

    case tg_table_name
        when 'roles' then
            v_blocked := coalesce(v_row -> 'metadata' ? 'system_role', false)
                or coalesce(v_old -> 'metadata' ? 'system_role', false);
        when 'permission_groups' then
            v_blocked := coalesce(v_row -> 'metadata' ? 'system_group', false)
                or coalesce(v_old -> 'metadata' ? 'system_group', false);
        when 'permissions' then
            v_blocked := coalesce(v_row -> 'metadata' ? 'system_permission', false)
                or coalesce(v_old -> 'metadata' ? 'system_permission', false);
        when 'role_permissions' then
            v_blocked := cms.is_system_rbac_object('role', (v_row ->> 'role_id')::uuid)
                or cms.is_system_rbac_object('role', (v_old ->> 'role_id')::uuid);
        when 'role_permission_groups' then
            v_blocked := cms.is_system_rbac_object('role', (v_row ->> 'role_id')::uuid)
                or cms.is_system_rbac_object('role', (v_old ->> 'role_id')::uuid)
                or (tg_op <> 'DELETE' and cms.is_system_rbac_object('group', (v_row ->> 'group_id')::uuid));
        when 'permission_group_permissions' then
            v_blocked := cms.is_system_rbac_object('group', (v_row ->> 'group_id')::uuid)
                or cms.is_system_rbac_object('group', (v_old ->> 'group_id')::uuid);
        else
            v_blocked := false;
    end case;

    if v_blocked then
        raise exception 'SYSTEM_RBAC_OBJECT_PROTECTED'
            using errcode = '42501';
    end if;

    -- Un rol con miembros no se borra desde una sesión de usuario: la clave
    -- ajena de `account_roles` borraría en cascada sus asignaciones y los
    -- miembros se quedarían sin rol sin que nadie lo decidiera. La API ya lo
    -- comprueba (`ROLE_HAS_MEMBERS`), pero entre su comprobación y el
    -- DELETE otro operador podría asignar el rol; aquí, con la fila del rol
    -- ya bloqueada por el DELETE, la consulta ve también esa asignación.
    -- (Dos `if` anidados: PL/pgSQL no evalúa en cortocircuito y `old.id`
    -- no existe en las tablas de asignación.)
    if tg_table_name = 'roles' and tg_op = 'DELETE' then
        if exists (select 1 from cms.account_roles ar where ar.role_id = (v_row ->> 'id')::uuid) then
            raise exception 'ROLE_HAS_MEMBERS'
                using errcode = 'P0001';
        end if;
    end if;

    return case when tg_op = 'DELETE' then old else new end;
end;
$$ language plpgsql;

-- Función de *trigger*: no se llama directamente.
revoke execute on function cms.guard_system_rbac_objects () from public, anon, authenticated;

create trigger guard_system_rbac_objects
  before insert or update or delete on cms.roles
  for each row execute function cms.guard_system_rbac_objects ();

create trigger guard_system_rbac_objects
  before insert or update or delete on cms.permission_groups
  for each row execute function cms.guard_system_rbac_objects ();

create trigger guard_system_rbac_objects
  before insert or update or delete on cms.permissions
  for each row execute function cms.guard_system_rbac_objects ();

create trigger guard_system_rbac_objects
  before insert or update or delete on cms.role_permissions
  for each row execute function cms.guard_system_rbac_objects ();

create trigger guard_system_rbac_objects
  before insert or update or delete on cms.role_permission_groups
  for each row execute function cms.guard_system_rbac_objects ();

create trigger guard_system_rbac_objects
  before insert or update or delete on cms.permission_group_permissions
  for each row execute function cms.guard_system_rbac_objects ();

/*
 * UPDATE por columnas (regla de `apps/web/supabase/AGENTS.md`: nunca UPDATE
 * de tabla completa a `authenticated`). Los *triggers* BEFORE que escriben
 * `updated_at` siguen funcionando: el privilegio por columna solo se
 * comprueba contra la lista `SET` de la sentencia. `service_role` conserva
 * el UPDATE completo. `db diff` no genera estos `grant` (bitácora B-35): la
 * migración los repite a mano y pgTAP los comprueba con
 * `has_column_privilege`.
 */
revoke update on table cms.roles from authenticated;

grant update (name, description, rank, metadata, valid_from, valid_until) on table cms.roles to authenticated;

revoke update on table cms.permission_groups from authenticated;

grant update (name, description, metadata, valid_from, valid_until) on table cms.permission_groups to authenticated;

revoke update on table cms.permissions from authenticated;

grant update (
  name,
  description,
  permission_type,
  system_resource,
  scope,
  schema_name,
  table_name,
  column_name,
  action,
  constraints,
  conditions,
  metadata
) on table cms.permissions to authenticated;

/*
 * cms.current_account_has_storage_access
 *
 * Indica si la cuenta de la sesión tiene algún permiso de almacenamiento de
 * lectura (`select` o `*`) con *bucket* y patrón explícitos. La API lo usa
 * solo para decidir si muestra la sección «Almacenamiento»; el acceso real a
 * cada objeto lo decide `has_storage_permission`. Sustituye a la consulta
 * que llamaba a `has_permission` con la cuenta como parámetro (ADR-015).
 */
create or replace function cms.current_account_has_storage_access () returns boolean
security definer
set
  row_security = off
set
  search_path = '' as $$
declare
    v_account_id uuid;
begin
    if not cms.verify_admin_access() then
        return false;
    end if;

    v_account_id := cms.get_current_user_account_id();

    if v_account_id is null then
        return false;
    end if;

    return exists (select 1
                   from cms.permissions p
                   where p.permission_type = 'data'
                     and p.scope = 'storage'
                     and p.action in ('select', '*')
                     and coalesce(length(p.metadata ->> 'bucket_name'), 0) > 0
                     and coalesce(length(p.metadata ->> 'path_pattern'), 0) > 0
                     and cms.has_permission(v_account_id, p.id));
end;
$$ language plpgsql stable;

revoke execute on function cms.current_account_has_storage_access () from public, anon;

grant execute on function cms.current_account_has_storage_access () to authenticated;
