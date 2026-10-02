/*
 * Endurecimiento del RBAC del CMS para Ajustes > Permisos (PymeKit, F2.7b).
 *
 * Generada con `supabase db diff` a partir de los esquemas declarativos y
 * completada A MANO con lo que la herramienta no genera (bitácora B-35):
 * los `revoke`/`grant` de EXECUTE sobre funciones y los `grant update` por
 * columna del final del fichero.
 *
 * Contenido (detalle y justificación en los esquemas 28, 30, 34, 43, 46 y
 * 55, y en `tests/database/cms-rbac-f27b.test.sql`):
 *
 *  - Pendientes de ADR-015: `has_permission`, `build_where_clause` y
 *    `lock_resources_ordered` dejan de ser ejecutables por `authenticated`;
 *    `account_has_role`, `can_view_permission_group`,
 *    `can_modify_account_role`, `can_modify_role_permission_group` y
 *    `can_view_role_permission_group` solo responden sobre la cuenta de la
 *    sesión; el INSERT en `saved_view_roles` exige ser el creador de la
 *    vista; los permisos de almacenamiento fallan en cerrado (sin *bucket*
 *    o patrón explícito no conceden nada).
 *  - `can_grant_permission` evalúa los permisos de almacenamiento por su
 *    capacidad.
 *  - Guardia de los objetos de sistema del super-admin
 *    (`guard_system_rbac_objects`, que además impide borrar un rol con
 *    miembros) y UPDATE por columnas en `roles`, `permission_groups` y
 *    `permissions`.
 *  - `auth_user_has_active_account` y `can_modify_permission` se vuelven a
 *    crear sin cambios de lógica para alinear sus comentarios internos con
 *    el esquema declarativo (la deriva de solo comentarios que mostraba
 *    `db diff`).
 *
 * La restricción `valid_permission_type` se crea `not valid` y se valida a
 * continuación: si alguna BD tuviera un permiso de almacenamiento sin
 * *bucket* o sin patrón, la migración falla en lugar de dejarlo como
 * comodín (esos permisos ya no concedían nada con las funciones nuevas y hay
 * que corregirlos a mano con un valor explícito).
 *
 * [TFG] RF-09 · RNF-02 · ADR-014 · ADR-015.
 */

drop policy "insert_shared_saved_views" on "cms"."saved_view_roles";

revoke update on table "cms"."permission_groups" from "authenticated";

revoke update on table "cms"."permissions" from "authenticated";

revoke update on table "cms"."roles" from "authenticated";

alter table "cms"."permissions" drop constraint "valid_permission_type";

alter table "cms"."permissions" add constraint "valid_permission_type" CHECK ((((permission_type = 'system'::cms.permission_type) AND (system_resource IS NOT NULL) AND (scope IS NULL) AND (schema_name IS NULL) AND (table_name IS NULL) AND (column_name IS NULL)) OR ((permission_type = 'data'::cms.permission_type) AND (scope IS NOT NULL) AND (((scope = 'table'::cms.permission_scope) AND (schema_name IS NOT NULL) AND (table_name IS NOT NULL) AND (column_name IS NULL)) OR ((scope = 'column'::cms.permission_scope) AND (schema_name IS NOT NULL) AND (table_name IS NOT NULL) AND (column_name IS NOT NULL)))) OR ((permission_type = 'data'::cms.permission_type) AND (scope IS NOT NULL) AND (scope = 'storage'::cms.permission_scope) AND (schema_name IS NULL) AND (table_name IS NULL) AND (column_name IS NULL) AND COALESCE(((jsonb_typeof((metadata -> 'bucket_name'::text)) = 'string'::text) AND (length((metadata ->> 'bucket_name'::text)) > 0)), false) AND COALESCE(((jsonb_typeof((metadata -> 'path_pattern'::text)) = 'string'::text) AND (length((metadata ->> 'path_pattern'::text)) > 0)), false)))) not valid;

alter table "cms"."permissions" validate constraint "valid_permission_type";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION cms.current_account_has_storage_access()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION cms.guard_system_rbac_objects()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION cms.is_system_rbac_object(p_kind text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION cms.account_has_role(p_account_id uuid, p_role_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
BEGIN
    IF p_account_id IS NULL OR p_role_id IS NULL OR NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    IF p_account_id IS DISTINCT FROM cms.get_current_user_account_id()
        AND NOT cms.has_admin_permission('account'::cms.system_resource, 'select'::cms.system_action) THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (SELECT 1
                   FROM cms.account_roles
                   WHERE account_id = p_account_id
                     AND role_id = p_role_id
                     AND (valid_until IS NULL OR valid_until > NOW()));
END;
$function$
;

CREATE OR REPLACE FUNCTION cms.auth_user_has_active_account(p_auth_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
    select exists (select 1
                   from cms.accounts
                   where auth_user_id = p_auth_user_id
                     and is_active = true);
$function$
;

CREATE OR REPLACE FUNCTION cms.can_grant_permission(p_permission_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
DECLARE
    v_permission cms.permissions;
    v_account_id UUID;
BEGIN
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    SELECT * INTO v_permission FROM cms.permissions WHERE id = p_permission_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    v_account_id := cms.get_current_user_account_id();

    IF v_account_id IS NULL THEN
        RETURN FALSE;
    END IF;

    IF v_permission.permission_type = 'system' THEN
        RETURN cms.has_admin_permission(v_permission.system_resource, v_permission.action);
    ELSIF v_permission.permission_type = 'data' AND v_permission.scope IN ('table', 'column') THEN
        RETURN cms.has_data_permission(v_permission.action, v_permission.schema_name, v_permission.table_name);
    ELSIF v_permission.permission_type = 'data' AND v_permission.scope = 'storage' THEN
        RETURN cms.storage_capability_is_grantable(
            v_permission.action,
            v_permission.metadata ->> 'bucket_name',
            v_permission.metadata ->> 'path_pattern');
    END IF;

    -- Cualquier otra forma (no debería existir por la restricción
    -- `valid_permission_type`): solo quien ya posee ese permiso concreto.
    RETURN cms.has_permission(v_account_id, p_permission_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION cms.can_modify_account_role(p_account_id uuid, p_target_account_id uuid, p_role_id uuid, p_action cms.system_action)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
DECLARE
    v_user_max_rank    INTEGER;
    v_role_rank        INTEGER;
    v_target_max_rank  INTEGER;
BEGIN
    -- Input validation
    IF p_account_id IS NULL OR p_target_account_id IS NULL OR p_role_id IS NULL OR p_action IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check if user has admin access (JWT validation)
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    -- [TFG] RNF-02 · ADR-015 (F2.7b): la cuenta que actúa es SIEMPRE la de
    -- la sesión. La función es `security definer` y recibía al actor como
    -- parámetro, así que cualquiera podía preguntar «¿podría Root asignar
    -- este rol a esta cuenta?». Las políticas ya la llaman con
    -- `get_current_user_account_id()`.
    IF p_account_id IS DISTINCT FROM cms.get_current_user_account_id() THEN
        RETURN FALSE;
    END IF;

    -- First check: Does user have admin permission to modify roles at all?
    IF NOT cms.has_admin_permission('role'::cms.system_resource, p_action) THEN
        RETURN FALSE;
    END IF;

    -- [TFG] RNF-02 · F2.7a (pendiente D, reglas de rango). Nadie cambia sus
    -- propios roles: el código heredado permitía asignarse o quitarse roles de
    -- rango inferior al propio, es decir, degradarse o cambiar de perfil sin
    -- que nadie por encima lo decidiera. La gestión de roles es siempre una
    -- acción sobre OTRA cuenta.
    IF p_account_id = p_target_account_id THEN
        RETURN FALSE;
    END IF;

    -- Las cuentas raíz (super-admins de la plataforma, ADR-014) las gestiona
    -- el pegamento de `53-cms-super-admin.sql`, nunca el CMS. Hoy ya lo impide
    -- el rango (Root tiene 100, el máximo y único), pero la regla se escribe
    -- de forma explícita para no depender de esa coincidencia.
    IF cms.is_root_managed_account(p_target_account_id) THEN
        RETURN FALSE;
    END IF;

    -- CANONICAL LOCKING: Lock all resources in consistent order
    -- This prevents deadlocks regardless of caller order
    PERFORM cms.lock_resources_ordered(
            p_accounts := ARRAY [p_account_id, p_target_account_id]::UUID[],
            p_roles := ARRAY [p_role_id]::UUID[]
            );

    -- Get role rank (simple read)
    SELECT rank
    INTO v_role_rank
    FROM cms.roles
    WHERE id = p_role_id;

    IF v_role_rank IS NULL THEN
        RETURN FALSE; -- Role doesn't exist
    END IF;

    v_user_max_rank := coalesce(cms.get_user_max_role_rank(p_account_id), null);

    v_target_max_rank := coalesce(cms.get_user_max_role_rank(p_target_account_id), 0);

    -- If the user has no roles, return false
    IF v_user_max_rank IS NULL THEN
        RETURN FALSE;
    END IF;

    -- RULE 1: User must have STRICTLY HIGHER rank than the role being assigned/modified.
    -- Previously this allowed EQUAL rank ('<'), letting a rank-N admin grant a
    -- rank-N role to a subordinate and elevate it to co-equal top rank (which then
    -- became immune to the granting admin, since equal-rank actions are blocked
    -- everywhere else). Strict '<=' caps delegated grants at N-1, consistent with
    -- can_action_role / can_action_account. (Creating peer/top-rank admins is a
    -- privileged bootstrap operation performed via the service role / seed.)
    IF v_user_max_rank <= v_role_rank THEN
        RETURN FALSE;
    END IF;

    -- RULE 2: solo se actúa sobre cuentas de rango ESTRICTAMENTE inferior.
    RETURN v_user_max_rank > v_target_max_rank;
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in can_modify_account_role: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
        RETURN FALSE;
END;
$function$
;

CREATE OR REPLACE FUNCTION cms.can_modify_permission(p_permission_id uuid, p_action cms.system_action DEFAULT 'update'::cms.system_action)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
DECLARE
    v_user_max_rank             INTEGER;
    v_highest_role_using_permission INTEGER;
    v_permission_locked             RECORD;
BEGIN
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    -- Lock the permission
    SELECT id
    INTO v_permission_locked
    FROM cms.permissions
    WHERE id = p_permission_id
        FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- First check: Does user have admin permission to manage permissions?
    IF NOT cms.has_admin_permission('permission'::cms.system_resource, p_action) THEN
        RETURN FALSE;
    END IF;

    -- Get user's max rank
    v_user_max_rank := cms.get_user_max_role_rank(cms.get_current_user_account_id());

    IF v_user_max_rank IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Highest rank holding this permission by ANY path: role grant, permission group
    -- binding, or a direct account grant. Reading role_permissions alone made this gate
    -- vacuous, since every shipped seed attaches capabilities exclusively through groups.
    SELECT MAX(r.rank)
    INTO v_highest_role_using_permission
    FROM cms.roles r
    WHERE EXISTS (SELECT 1
                  FROM cms.role_permissions rp
                  WHERE rp.role_id = r.id
                    AND rp.permission_id = p_permission_id)
       OR EXISTS (SELECT 1
                  FROM cms.role_permission_groups rpg
                           JOIN cms.permission_group_permissions pgp ON pgp.group_id = rpg.group_id
                  WHERE rpg.role_id = r.id
                    AND pgp.permission_id = p_permission_id)
       OR EXISTS (SELECT 1
                  FROM cms.account_permissions ap
                           JOIN cms.account_roles ar ON ar.account_id = ap.account_id
                  WHERE ar.role_id = r.id
                    AND ap.permission_id = p_permission_id);

    -- If nothing holds this permission, default to 0
    v_highest_role_using_permission := COALESCE(v_highest_role_using_permission, 0);

    -- User must outrank every role holding this permission. Equal rank is allowed
    -- only when the caller effectively holds the permission themselves: a strict
    -- comparison alone makes anything held by the top-ranked role immutable for
    -- everyone, its own members included, with no escape hatch. Holding it means
    -- editing confers nothing new, and enforce_permission_reshape_grantable still
    -- gates the resulting capability. Peers' capabilities the caller does not hold
    -- stay out of reach.
    RETURN v_user_max_rank > v_highest_role_using_permission
        OR (v_user_max_rank = v_highest_role_using_permission
            AND cms.has_permission(cms.get_current_user_account_id(),
                                        p_permission_id));
END;
$function$
;

CREATE OR REPLACE FUNCTION cms.can_modify_role_permission_group(p_account_id uuid, p_role_id uuid, p_action cms.system_action)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_user_max_rank INTEGER;
BEGIN
    IF p_account_id IS NULL OR p_account_id IS DISTINCT FROM cms.get_current_user_account_id() THEN
        RETURN FALSE;
    END IF;

    -- First check: Does user have admin permission to modify roles at all?
    IF NOT cms.has_admin_permission('role'::cms.system_resource, p_action) THEN
        RETURN FALSE;
    END IF;

    -- Get the user's maximum role rank
    v_user_max_rank := cms.get_user_max_role_rank(p_account_id);

    RETURN EXISTS (
        -- Access based on role rank (strictly higher rank only)
        SELECT 1
        FROM cms.roles r
        WHERE r.id = p_role_id
          AND r.rank < v_user_max_rank);
END;
$function$
;

CREATE OR REPLACE FUNCTION cms.can_view_permission_group(p_account_id uuid, p_group_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
DECLARE
    v_user_max_rank INTEGER;
BEGIN
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    IF p_account_id IS NULL OR p_account_id IS DISTINCT FROM cms.get_current_user_account_id() THEN
        RETURN FALSE;
    END IF;

    -- Get the user's maximum role rank
    v_user_max_rank := cms.get_user_max_role_rank(p_account_id);

    RETURN EXISTS (
        -- Access through roles
        SELECT 1
        FROM cms.account_roles ar
                 JOIN cms.role_permission_groups rpg ON ar.role_id = rpg.role_id
        WHERE ar.account_id = p_account_id
          AND rpg.group_id = p_group_id)
        -- Access as creator
        OR EXISTS (SELECT 1
                   FROM cms.permission_groups pg
                   WHERE pg.id = p_group_id
                     AND pg.created_by = p_account_id)
        -- Access based on role rank (including equal rank)
        OR EXISTS (SELECT 1
                   FROM cms.role_permission_groups rpg
                            JOIN cms.roles r ON rpg.role_id = r.id
                   WHERE rpg.group_id = p_group_id
                     AND r.rank <= v_user_max_rank);
END;
$function$
;

CREATE OR REPLACE FUNCTION cms.can_view_role_permission_group(p_account_id uuid, p_role_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_user_max_rank INTEGER;
BEGIN
    IF p_account_id IS NULL OR p_account_id IS DISTINCT FROM cms.get_current_user_account_id() THEN
        RETURN FALSE;
    END IF;

    -- Get the user's maximum role rank
    v_user_max_rank := cms.get_user_max_role_rank(p_account_id);

    RETURN EXISTS (
        -- Access through roles
        SELECT 1
        FROM cms.account_roles ar
        WHERE ar.account_id = p_account_id
          AND ar.role_id = p_role_id)
        -- Access based on role rank (including equal rank)
        OR EXISTS (SELECT 1
                   FROM cms.roles r
                   WHERE r.id = p_role_id
                     AND r.rank <= v_user_max_rank);
END;
$function$
;

CREATE OR REPLACE FUNCTION cms.enforce_permission_reshape_grantable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
BEGIN
    -- Solo se vuelve a validar si cambia alguna columna que define la
    -- capacidad. `metadata` cuenta: en el ámbito `storage` ES la capacidad.
    IF NEW.permission_type IS NOT DISTINCT FROM OLD.permission_type
       AND NEW.system_resource IS NOT DISTINCT FROM OLD.system_resource
       AND NEW.action IS NOT DISTINCT FROM OLD.action
       AND NEW.scope IS NOT DISTINCT FROM OLD.scope
       AND NEW.schema_name IS NOT DISTINCT FROM OLD.schema_name
       AND NEW.table_name IS NOT DISTINCT FROM OLD.table_name
       AND NEW.column_name IS NOT DISTINCT FROM OLD.column_name
       AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata THEN
        RETURN NEW;
    END IF;

    -- Sin cuenta del CMS en el JWT (migraciones, *seed*, cliente de
    -- servicio) no hay a quién limitar: ese contexto ya ignora RLS y es de
    -- confianza. La vía que usa el personal (API con su sesión) siempre
    -- tiene cuenta.
    IF cms.get_current_user_account_id() IS NULL THEN
        RETURN NEW;
    END IF;

    -- Misma regla que `can_grant_permission`, evaluada sobre los valores
    -- NUEVOS de la fila.
    IF NEW.permission_type = 'system' THEN
        IF NOT cms.has_admin_permission(NEW.system_resource, NEW.action) THEN
            RAISE EXCEPTION 'insufficient_privilege: cannot reshape a permission into a capability you do not hold'
                USING ERRCODE = '42501';
        END IF;
    ELSIF NEW.permission_type = 'data' AND NEW.scope IN ('table', 'column') THEN
        IF NOT cms.has_data_permission(NEW.action, NEW.schema_name, NEW.table_name) THEN
            RAISE EXCEPTION 'insufficient_privilege: cannot reshape a permission into a capability you do not hold'
                USING ERRCODE = '42501';
        END IF;
    ELSIF NEW.scope = 'storage' THEN
        -- Tener la fila no dice nada de la capacidad resultante: se
        -- comprueban el bucket, el patrón y la acción de destino.
        IF NOT cms.storage_capability_is_grantable(
                   NEW.action,
                   NEW.metadata ->> 'bucket_name',
                   NEW.metadata ->> 'path_pattern') THEN
            RAISE EXCEPTION 'insufficient_privilege: cannot reshape a permission into a storage capability you do not hold'
                USING ERRCODE = '42501';
        END IF;
    ELSE
        IF NOT cms.has_permission(cms.get_current_user_account_id(), NEW.id) THEN
            RAISE EXCEPTION 'insufficient_privilege: cannot reshape a permission you do not hold'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION cms.has_storage_permission(p_bucket_name text, p_action cms.system_action, p_object_path text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
DECLARE
    v_account_id       UUID;
    v_user_id          TEXT;
    v_permission       RECORD;
    v_allowed_bucket   TEXT;
    v_path_pattern     TEXT;
    v_resolved_pattern TEXT;
BEGIN
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    IF p_object_path IS NULL or p_object_path = '' THEN
        RETURN FALSE;
    END IF;

    if p_bucket_name is null or p_bucket_name = '' then
        return false;
    end if;

    v_account_id := cms.get_current_user_account_id();
    IF v_account_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Las variables de la ruta se sustituyen por el usuario de la sesión.
    v_user_id := (SELECT auth.uid()::TEXT);

    FOR v_permission IN
        SELECT p.metadata
        FROM cms.permissions p
        WHERE p.permission_type = 'data'
          AND p.scope = 'storage'
          AND (p.action = p_action OR p.action = '*')
          AND cms.has_permission(v_account_id, p.id)
        LOOP
            v_allowed_bucket := v_permission.metadata ->> 'bucket_name';
            v_path_pattern := v_permission.metadata ->> 'path_pattern';

            -- Fallo en cerrado: sin bucket o sin patrón, el permiso no
            -- concede nada (el comodín es siempre un '*' explícito).
            IF v_allowed_bucket IS NULL OR v_allowed_bucket = ''
                OR v_path_pattern IS NULL OR v_path_pattern = '' THEN
                CONTINUE;
            END IF;

            IF v_allowed_bucket <> '*' AND v_allowed_bucket <> p_bucket_name THEN
                CONTINUE;
            END IF;

            v_resolved_pattern := v_path_pattern;
            v_resolved_pattern := replace(v_resolved_pattern, '{{user_id}}', v_user_id);
            v_resolved_pattern := replace(v_resolved_pattern, '{{account_id}}', v_account_id::TEXT);

            -- Solo `*` es comodín: los `\`, `%` y `_` literales se escapan.
            v_resolved_pattern := replace(v_resolved_pattern, '\', '\\');
            v_resolved_pattern := replace(v_resolved_pattern, '%', '\%');
            v_resolved_pattern := replace(v_resolved_pattern, '_', '\_');
            v_resolved_pattern := replace(v_resolved_pattern, '*', '%');

            IF NOT (p_object_path LIKE v_resolved_pattern ESCAPE '\') THEN
                CONTINUE;
            END IF;

            RETURN TRUE;
        END LOOP;

    RETURN FALSE;
END;
$function$
;

CREATE OR REPLACE FUNCTION cms.storage_capability_is_grantable(p_action cms.system_action, p_bucket_name text, p_path_pattern text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
DECLARE
    v_account_id UUID;
BEGIN
    v_account_id := cms.get_current_user_account_id();

    IF v_account_id IS NULL OR NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    IF p_action IS NULL
        OR p_bucket_name IS NULL OR p_bucket_name = ''
        OR p_path_pattern IS NULL OR p_path_pattern = '' THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (SELECT 1
                   FROM cms.permissions p
                   WHERE p.permission_type = 'data'
                     AND p.scope = 'storage'
                     AND (p.action = p_action OR p.action = '*')
                     AND (p.metadata ->> 'bucket_name' = '*'
                       OR p.metadata ->> 'bucket_name' = p_bucket_name)
                     AND (p.metadata ->> 'path_pattern' = '*'
                       OR p.metadata ->> 'path_pattern' = p_path_pattern)
                     AND cms.has_permission(v_account_id, p.id));
END;
$function$
;


  create policy "insert_shared_saved_views"
  on "cms"."saved_view_roles"
  as permissive
  for insert
  to authenticated
with check (((EXISTS ( SELECT 1
   FROM cms.saved_views sv
  WHERE ((sv.id = saved_view_roles.view_id) AND (sv.created_by = cms.get_current_user_account_id())))) AND (cms.get_user_max_role_rank(cms.get_current_user_account_id()) > ( SELECT r.rank
   FROM cms.roles r
  WHERE (r.id = saved_view_roles.role_id)))));


CREATE TRIGGER guard_system_rbac_objects BEFORE INSERT OR DELETE OR UPDATE ON cms.permission_group_permissions FOR EACH ROW EXECUTE FUNCTION cms.guard_system_rbac_objects();

CREATE TRIGGER guard_system_rbac_objects BEFORE INSERT OR DELETE OR UPDATE ON cms.permission_groups FOR EACH ROW EXECUTE FUNCTION cms.guard_system_rbac_objects();

CREATE TRIGGER guard_system_rbac_objects BEFORE INSERT OR DELETE OR UPDATE ON cms.permissions FOR EACH ROW EXECUTE FUNCTION cms.guard_system_rbac_objects();

CREATE TRIGGER guard_system_rbac_objects BEFORE INSERT OR DELETE OR UPDATE ON cms.role_permission_groups FOR EACH ROW EXECUTE FUNCTION cms.guard_system_rbac_objects();

CREATE TRIGGER guard_system_rbac_objects BEFORE INSERT OR DELETE OR UPDATE ON cms.role_permissions FOR EACH ROW EXECUTE FUNCTION cms.guard_system_rbac_objects();

CREATE TRIGGER guard_system_rbac_objects BEFORE INSERT OR DELETE OR UPDATE ON cms.roles FOR EACH ROW EXECUTE FUNCTION cms.guard_system_rbac_objects();


-- ---------------------------------------------------------------------------
-- Escrito a mano: `db diff` no genera privilegios de funciones ni por columna
-- ---------------------------------------------------------------------------

-- Pendiente (a) de ADR-015: funciones internas que respondían sí/no sobre
-- cualquier cuenta o que no comprueban permisos. Solo las llaman funciones
-- `security definer` (que se ejecutan como su propietario).
revoke execute on function cms.has_permission (uuid, uuid) from public, anon, authenticated;

grant execute on function cms.has_permission (uuid, uuid) to service_role;

revoke execute on function cms.build_where_clause (text, text, jsonb) from public, anon, authenticated;

revoke execute on function cms.lock_resources_ordered (uuid[], uuid[], uuid[], uuid[]) from public, anon, authenticated;

-- Funciones de *trigger* y auxiliares internas: nadie las llama directamente.
revoke execute on function cms.enforce_permission_reshape_grantable () from public, anon, authenticated;

revoke execute on function cms.guard_system_rbac_objects () from public, anon, authenticated;

revoke execute on function cms.is_system_rbac_object (text, uuid) from public, anon, authenticated;

-- La API la usa para decidir si muestra la sección de almacenamiento.
revoke execute on function cms.current_account_has_storage_access () from public, anon;

grant execute on function cms.current_account_has_storage_access () to authenticated;

-- UPDATE por columnas (el diff ya ha revocado el UPDATE de tabla completa).
grant update (name, description, rank, metadata, valid_from, valid_until) on table cms.roles to authenticated;

grant update (name, description, metadata, valid_from, valid_until) on table cms.permission_groups to authenticated;

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
