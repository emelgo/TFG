/*
 * -------------------------------------------------------
 * Sección: el super-admin de la plataforma es la raíz del CMS
 *
 * PymeKit tiene dos modelos de autorización que conviven en la misma base
 * de datos:
 *
 *  1. El de la plataforma: un usuario es super-admin cuando su
 *     `app_metadata.role` vale `super-admin` (ver 14-super-admin.sql y
 *     `public.is_super_admin()`).
 *  2. El RBAC propio del CMS (esquema `cms`): el claim `cms_access`, una fila
 *     en `cms.accounts` y un rol del CMS con sus grupos de permisos.
 *
 * Este fichero es el «pegamento» entre ambos. Garantiza que exista un rol
 * de sistema `Root` (el de mayor rango, 100) con un grupo de permisos que
 * concede TODOS los permisos de administración, datos y almacenamiento, y
 * mantiene sincronizados a los super-admins con él mediante *triggers* sobre
 * `auth.users`:
 *
 *  - al promocionar a un usuario a super-admin, recibe `cms_access = 'true'`,
 *    una cuenta activa en `cms.accounts` y el rol `Root`;
 *  - al retirarle el rol de super-admin, pierde el claim, el rol `Root` y su
 *    cuenta del CMS queda desactivada (se conserva el registro para la
 *    auditoría, igual que hace `cms.revoke_admin_access`).
 *
 * El RBAC del CMS se sigue usando para dar acceso limitado a otro personal
 * (soporte, gestión de contenidos): este fichero no toca a los usuarios que
 * no son ni han sido super-admin.
 *
 * [TFG] RF-08, RF-09 y ADR-014: el super-admin es la raíz del CMS sin
 * configuración adicional; el RBAC del CMS queda para el resto del personal.
 * Ver Memoria §Diseño > Seguridad.
 * -------------------------------------------------------
 */

-- [TFG] RNF-02 · Solo puede existir un rol y un grupo marcados como raíz.
-- `ensure_root_role` y los tests buscan el Root por este marcador; sin la
-- restricción, alguien con permiso para crear roles podría crear otro con el
-- mismo marcador y confundir esa búsqueda.
create unique index if not exists cms_roles_system_role_unique
  on cms.roles ((metadata ->> 'system_role'))
  where metadata ? 'system_role';

create unique index if not exists cms_permission_groups_system_group_unique
  on cms.permission_groups ((metadata ->> 'system_group'))
  where metadata ? 'system_group';

/*
 * cms.ensure_root_role
 *
 * Crea (si no existen) el rol `Root`, el grupo de permisos `Super Admin` y
 * los permisos comodín que este agrupa, y devuelve el id del rol. Es
 * idempotente: se ejecuta en la migración (para que el rol exista también en
 * producción, no solo con el *seed*) y cada vez que se promociona a un
 * super-admin, por si alguien lo hubiera borrado.
 *
 * Los objetos de sistema se identifican por una marca en `metadata`
 * (`system_role`, `system_group`, `system_permission`) y no por su nombre,
 * para que renombrarlos desde la interfaz no rompa el pegamento.
 */
create or replace function cms.ensure_root_role () returns uuid
set
  search_path = '' as $$
declare
    v_role_id  uuid;
    v_group_id uuid;
begin
    select id
    into v_role_id
    from cms.roles
    where metadata @> '{"system_role": "root"}'::jsonb
    limit 1;

    if v_role_id is null then
        -- El rango 100 es el máximo permitido y es único: así ningún rol creado
        -- desde el CMS puede igualar ni superar al super-admin, y la jerarquía
        -- de `can_action_role` / `can_action_account` le protege de cualquier
        -- otro miembro del personal.
        if exists (select 1 from cms.roles where rank = 100) then
            raise exception 'No se puede crear el rol Root: ya existe otro rol del CMS con rango 100'
                using errcode = 'unique_violation';
        end if;

        insert into cms.roles (name, description, rank, metadata)
        values ('Root',
                'Rol de sistema de los super-admins de la plataforma: acceso total al CMS',
                100,
                '{"system_role": "root"}'::jsonb)
        returning id into v_role_id;
    end if;

    select id
    into v_group_id
    from cms.permission_groups
    where metadata @> '{"system_group": "root"}'::jsonb
    limit 1;

    if v_group_id is null then
        insert into cms.permission_groups (name, description, metadata)
        values ('Super Admin',
                'Grupo de sistema con todos los permisos de administración, datos y almacenamiento',
                '{"system_group": "root"}'::jsonb)
        returning id into v_group_id;
    end if;

    -- Permisos de sistema: todas las acciones (`*`) sobre cada recurso de
    -- administración del CMS. Se generan a partir del propio enum para que
    -- un recurso nuevo quede cubierto sin tocar este fichero.
    insert into cms.permissions (name, description, permission_type, system_resource, action, metadata)
    select 'Root: ' || r.resource::text,
           'Todas las acciones sobre el recurso de sistema ' || r.resource::text,
           'system'::cms.permission_type,
           r.resource,
           '*'::cms.system_action,
           '{"system_permission": "root"}'::jsonb
    from unnest(enum_range(null::cms.system_resource)) as r (resource)
    on conflict (name) do nothing;

    -- Permiso de datos: todas las acciones sobre todas las tablas de todos
    -- los esquemas (comodín `*` en esquema y tabla).
    insert into cms.permissions (name, description, permission_type, scope, schema_name, table_name, action, metadata)
    values ('Root: data',
            'Todas las acciones sobre todas las tablas gestionadas',
            'data'::cms.permission_type,
            'table'::cms.permission_scope,
            '*',
            '*',
            '*'::cms.system_action,
            '{"system_permission": "root"}'::jsonb)
    on conflict (name) do nothing;

    -- Permiso de almacenamiento: todos los buckets y todas las rutas.
    insert into cms.permissions (name, description, permission_type, scope, action, metadata)
    values ('Root: storage',
            'Todas las acciones sobre todos los buckets y rutas de almacenamiento',
            'data'::cms.permission_type,
            'storage'::cms.permission_scope,
            '*'::cms.system_action,
            '{"system_permission": "root", "bucket_name": "*", "path_pattern": "*"}'::jsonb)
    on conflict (name) do nothing;

    insert into cms.permission_group_permissions (group_id, permission_id)
    select v_group_id, p.id
    from cms.permissions p
    where p.metadata @> '{"system_permission": "root"}'::jsonb
    on conflict do nothing;

    insert into cms.role_permission_groups (role_id, group_id)
    values (v_role_id, v_group_id)
    on conflict do nothing;

    return v_role_id;
end;
$$ language plpgsql;

/*
 * cms.grant_root_access
 *
 * Da a un usuario acceso raíz al CMS: cuenta activa en `cms.accounts` y rol
 * `Root`. El claim `cms_access` NO se escribe aquí, sino en el *trigger*
 * BEFORE (`cms.sync_super_admin_claim`), sobre la misma fila que se está
 * guardando; así esta función nunca actualiza `auth.users` y no puede
 * provocar una recursión de *triggers*.
 *
 * Un usuario solo puede tener un rol del CMS (`unique (account_id)` en
 * `cms.account_roles`), así que si ya tenía uno (por ejemplo, de soporte) se
 * sustituye por `Root`.
 */
create or replace function cms.grant_root_access (p_user_id uuid) returns void
set
  search_path = '' as $$
declare
    v_role_id    uuid;
    v_account_id uuid;
begin
    v_role_id := cms.ensure_root_role();

    insert into cms.accounts (auth_user_id, is_active)
    values (p_user_id, true)
    on conflict (auth_user_id) do nothing;

    select id
    into v_account_id
    from cms.accounts
    where auth_user_id = p_user_id;

    -- Solo se escribe si hace falta: evita filas de auditoría y cambios de
    -- `updated_at` en cada inicio de sesión del super-admin.
    update cms.accounts
    set is_active = true
    where id = v_account_id
      and not is_active;

    if not exists (select 1
                   from cms.account_roles
                   where account_id = v_account_id
                     and role_id = v_role_id) then
        delete from cms.account_roles where account_id = v_account_id;

        insert into cms.account_roles (account_id, role_id)
        values (v_account_id, v_role_id);
    end if;
end;
$$ language plpgsql;

/*
 * cms.revoke_root_access
 *
 * Deshace `grant_root_access` cuando el usuario deja de ser super-admin:
 * retira el rol `Root` y desactiva su cuenta del CMS. Se reutiliza el
 * criterio de `cms.revoke_admin_access` (conservar el registro y sus datos
 * para la auditoría), pero sin sus comprobaciones de rango: aquí no hay un
 * usuario del CMS actuando, sino un cambio en la propia plataforma, que es la
 * fuente de verdad del rol de super-admin.
 */
create or replace function cms.revoke_root_access (p_user_id uuid) returns void
set
  search_path = '' as $$
declare
    v_account_id uuid;
begin
    select id
    into v_account_id
    from cms.accounts
    where auth_user_id = p_user_id;

    if v_account_id is null then
        return;
    end if;

    delete
    from cms.account_roles ar
    using cms.roles r
    where ar.role_id = r.id
      and ar.account_id = v_account_id
      and r.metadata @> '{"system_role": "root"}'::jsonb;

    update cms.accounts
    set is_active = false
    where id = v_account_id
      and is_active;
end;
$$ language plpgsql;

/*
 * cms.sync_super_admin_claim (trigger BEFORE sobre auth.users)
 *
 * Mantiene el claim `cms_access` de `app_metadata` coherente con el rol de
 * super-admin, modificando directamente la fila que se va a guardar (NEW).
 * Como no lanza ningún UPDATE adicional sobre `auth.users`, no puede
 * dispararse a sí mismo: esa es la protección frente a la recursión.
 *
 *  - Si el usuario es super-admin, el claim se fuerza a 'true' (incluso si
 *    otra función del CMS intentara ponerlo a 'false').
 *  - Si acaba de dejar de serlo, se pone a 'false'.
 *  - En cualquier otro caso no se toca: el personal con acceso limitado se
 *    gestiona con `cms.grant_admin_access` / `cms.revoke_admin_access`.
 *
 * Es SECURITY INVOKER a propósito: solo modifica NEW y no lee ni escribe
 * ninguna tabla, así que no necesita más privilegios que los de quien guarda
 * la fila.
 */
create or replace function cms.sync_super_admin_claim () returns trigger
set
  search_path = '' as $$
declare
    v_is_super_admin  boolean;
    v_was_super_admin boolean;
begin
    v_is_super_admin := coalesce(new.raw_app_meta_data ->> 'role', '') = 'super-admin';
    v_was_super_admin := tg_op = 'UPDATE'
        and coalesce(old.raw_app_meta_data ->> 'role', '') = 'super-admin';

    if v_is_super_admin then
        new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
            || jsonb_build_object('cms_access', 'true');
    elsif v_was_super_admin then
        new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
            || jsonb_build_object('cms_access', 'false');
    end if;

    return new;
end;
$$ language plpgsql;

/*
 * cms.sync_super_admin_root (trigger AFTER sobre auth.users)
 *
 * Crea o retira la cuenta del CMS y el rol `Root`. Tiene que ser AFTER
 * porque `cms.accounts.auth_user_id` es una FK a `auth.users` y, en un
 * INSERT, la fila del usuario aún no existe durante el BEFORE.
 *
 * SECURITY DEFINER: las altas y bajas de usuarios las hace
 * `supabase_auth_admin` (o `service_role` desde la consola de super-admin),
 * roles sin privilegios sobre las tablas del esquema `cms`. La función se
 * ejecuta como su propietario, que sí los tiene, y solo actúa sobre la fila
 * del usuario que ha cambiado, decidido únicamente por su `app_metadata.role`
 * (un dato que el usuario no puede modificar: solo lo escriben el servicio de
 * autenticación y el cliente administrador).
 */
create or replace function cms.sync_super_admin_root () returns trigger
set
  search_path = '' security definer as $$
declare
    v_is_super_admin  boolean;
    v_was_super_admin boolean;
begin
    v_is_super_admin := coalesce(new.raw_app_meta_data ->> 'role', '') = 'super-admin';
    v_was_super_admin := tg_op = 'UPDATE'
        and coalesce(old.raw_app_meta_data ->> 'role', '') = 'super-admin';

    if v_is_super_admin then
        perform cms.grant_root_access(new.id);
    elsif v_was_super_admin then
        perform cms.revoke_root_access(new.id);
    end if;

    return null;
end;
$$ language plpgsql;

-- [TFG] RNF-02: ninguna de estas funciones debe poder invocarse desde la API.
-- Las de *trigger* las ejecuta el propio PostgreSQL al disparar el *trigger*
-- (no requieren EXECUTE) y las auxiliares solo se llaman desde ellas o desde
-- la migración. PymeKit ya retira el EXECUTE de PUBLIC por defecto; se
-- revoca explícitamente también a los roles de la API para que la intención
-- quede escrita y la compruebe pgTAP (`cms-super-admin-root.test.sql`).
revoke all on function cms.ensure_root_role () from public, anon, authenticated, service_role;

revoke all on function cms.grant_root_access (uuid) from public, anon, authenticated, service_role;

revoke all on function cms.revoke_root_access (uuid) from public, anon, authenticated, service_role;

revoke all on function cms.sync_super_admin_claim () from public, anon, authenticated, service_role;

revoke all on function cms.sync_super_admin_root () from public, anon, authenticated, service_role;

-- Solo se disparan al insertar un usuario o al cambiar su `app_metadata`;
-- el resto de actualizaciones de `auth.users` (último acceso, email...) no
-- pagan ningún coste.
create trigger cms_sync_super_admin_claim
  before insert or update of raw_app_meta_data on auth.users
  for each row
execute function cms.sync_super_admin_claim ();

create trigger cms_sync_super_admin_root
  after insert or update of raw_app_meta_data on auth.users
  for each row
execute function cms.sync_super_admin_root ();

-- [TFG] RNF-02 · ADR-014: MFA obligatorio para entrar al CMS.
-- En la plataforma, `public.is_super_admin()` solo reconoce al super-admin
-- cuando su sesión tiene segundo factor (`aal2`). Si el CMS no lo exigiera,
-- quien robase únicamente la contraseña de un super-admin obtendría acceso
-- raíz al CMS, que puede leer y escribir cualquier tabla. Por eso el valor
-- por defecto de PymeKit es exigir MFA a todo el personal del CMS.
-- `on conflict do nothing` respeta la configuración si ya se cambió desde el
-- propio CMS (Ajustes > Seguridad).
insert into cms.configuration (key, value)
values ('requires_mfa', 'true')
on conflict (key) do nothing;

-- El rol Root debe existir en cualquier entorno, también en producción
-- aunque todavía no haya ningún super-admin.
select cms.ensure_root_role ();

-- Alta de los super-admins que ya existían antes de esta sección. Reescribir
-- `raw_app_meta_data` con su mismo valor dispara los dos *triggers* de arriba,
-- de modo que el alta sigue exactamente el mismo camino que una promoción.
update auth.users
set raw_app_meta_data = raw_app_meta_data
where raw_app_meta_data ->> 'role' = 'super-admin';
