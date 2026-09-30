/*
 * Las denegaciones explícitas también limitan lo que se DELEGA (PymeKit,
 * F2.7b · bitácora B-47).
 *
 * Generada con `supabase db diff` a partir de los esquemas declarativos 28,
 * 34, 40, 47, 51 y 54, y completada A MANO con los `revoke`/`grant` de
 * EXECUTE del final (bitácora B-35: la herramienta no los genera).
 *
 * Contenido (detalle y justificación en los esquemas y en
 * `tests/database/cms-rbac-isolation.test.sql`, casos P1 y P2):
 *
 *  - Brecha P1: una denegación (`account_permissions.is_grant = false`)
 *    solo se tenía en cuenta si cubría ENTERO el permiso que se concedía.
 *    Quien tenía datos `'*'.'*'` con una tabla denegada (o `account:*` con
 *    `account:delete` denegado) podía delegar el comodín a una cuenta
 *    títere propia y usar lo denegado a través de ella. Ahora
 *    `can_grant_permission`, el *trigger* de «reshape» y la API usan
 *    `capability_is_grantable`: hay que tener la capacidad y ninguna
 *    denegación propia puede SOLAPARSE con ella (funciones auxiliares
 *    `capability_values_overlap`, `storage_path_literal_prefix`,
 *    `storage_path_patterns_overlap`, `permissions_overlap` y
 *    `account_has_overlapping_deny`). `storage_capability_is_grantable`
 *    aplica la misma regla a los permisos de almacenamiento.
 *  - Debilidad P2: `view_account_roles` dejaba a todo el personal leer
 *    todas las asignaciones de roles, y `get_user_max_role_rank` e
 *    `is_root_managed_account` respondían sobre cualquier cuenta. Ahora solo
 *    sobre la propia salvo con `account:select`. Las guardias internas usan
 *    `account_is_root_managed` (no ejecutable por `authenticated`), las
 *    políticas de `account_permissions` usan `current_account_outranks`, el
 *    número de miembros de un rol sale de `count_role_members` y
 *    `can_read_audit_log` pasa a `security definer` para seguir viendo el
 *    rango del autor de cada registro.
 *
 * Solo `create or replace` y políticas borradas y recreadas con el mismo
 * nombre: nada destructivo.
 *
 * [TFG] RF-09 · RNF-02 · ADR-014 · ADR-015.
 */

drop policy "delete_account_permissions" on "cms"."account_permissions";

drop policy "insert_account_permissions" on "cms"."account_permissions";

drop policy "update_account_permissions" on "cms"."account_permissions";

drop policy "view_account_permissions" on "cms"."account_permissions";

drop policy "view_account_roles" on "cms"."account_roles";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION cms.account_has_overlapping_deny(p_account_id uuid, p_target cms.permissions)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
    select exists (select 1
                   from cms.account_permissions ap
                            join cms.permissions d on d.id = ap.permission_id
                   where ap.account_id = p_account_id
                     and ap.is_grant = false
                     and (ap.valid_until is null or ap.valid_until > now())
                     and cms.permissions_overlap(d, p_target));
$function$
;

CREATE OR REPLACE FUNCTION cms.account_is_root_managed(p_account_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
    select exists (select 1
                   from cms.accounts a
                            join auth.users u on u.id = a.auth_user_id
                   where a.id = p_account_id
                     and u.raw_app_meta_data ->> 'role' = 'super-admin')
        or exists (select 1
                   from cms.account_roles ar
                            join cms.roles r on r.id = ar.role_id
                   where ar.account_id = p_account_id
                     and r.metadata @> '{"system_role": "root"}'::jsonb);
$function$
;

CREATE OR REPLACE FUNCTION cms.capability_is_grantable(p_permission_type cms.permission_type, p_system_resource cms.system_resource, p_action cms.system_action, p_scope cms.permission_scope, p_schema_name text, p_table_name text, p_column_name text, p_metadata jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
DECLARE
    v_account_id UUID;
    v_target     cms.permissions;
    v_holds      BOOLEAN;
BEGIN
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    v_account_id := cms.get_current_user_account_id();

    IF v_account_id IS NULL OR p_permission_type IS NULL OR p_action IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 1. ¿La cuenta tiene la capacidad?
    IF p_permission_type = 'system' AND p_system_resource IS NOT NULL THEN
        v_holds := cms.has_admin_permission(p_system_resource, p_action);
    ELSIF p_permission_type = 'data' AND p_scope IN ('table', 'column') THEN
        v_holds := cms.has_data_permission(p_action, p_schema_name, p_table_name);
    ELSIF p_permission_type = 'data' AND p_scope = 'storage' THEN
        v_holds := cms.storage_capability_is_grantable(
            p_action,
            p_metadata ->> 'bucket_name',
            p_metadata ->> 'path_pattern');
    ELSE
        v_holds := FALSE;
    END IF;

    IF NOT coalesce(v_holds, FALSE) THEN
        RETURN FALSE;
    END IF;

    -- 2. ¿Alguna denegación suya se solapa con lo que quiere conceder?
    v_target.permission_type := p_permission_type;
    v_target.system_resource := p_system_resource;
    v_target.action := p_action;
    v_target.scope := p_scope;
    v_target.schema_name := p_schema_name;
    v_target.table_name := p_table_name;
    v_target.column_name := p_column_name;
    v_target.metadata := p_metadata;

    RETURN NOT cms.account_has_overlapping_deny(v_account_id, v_target);
END;
$function$
;

CREATE OR REPLACE FUNCTION cms.capability_values_overlap(p_a text, p_b text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
    select p_a is null
        or p_b is null
        or p_a = '*'
        or p_b = '*'
        or p_a = p_b;
$function$
;

CREATE OR REPLACE FUNCTION cms.count_role_members(p_role_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
BEGIN
    IF p_role_id IS NULL OR NOT cms.verify_admin_access() THEN
        RETURN 0;
    END IF;

    RETURN (SELECT count(*)::INTEGER FROM cms.account_roles ar WHERE ar.role_id = p_role_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION cms.current_account_outranks(p_account_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
BEGIN
    IF p_account_id IS NULL OR NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    -- Dentro de esta función `current_user` es el propietario, así que
    -- `get_user_max_role_rank` responde también por la otra cuenta.
    RETURN coalesce(
        cms.get_user_max_role_rank(cms.get_current_user_account_id())
            > cms.get_user_max_role_rank(p_account_id),
        FALSE);
END;
$function$
;

CREATE OR REPLACE FUNCTION cms.permissions_overlap(p_a cms.permissions, p_b cms.permissions)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
BEGIN
    IF p_a.permission_type IS DISTINCT FROM p_b.permission_type THEN
        RETURN FALSE;
    END IF;

    -- La acción se compara siempre (sistema, tabla y almacenamiento).
    IF NOT cms.capability_values_overlap(p_a.action::TEXT, p_b.action::TEXT) THEN
        RETURN FALSE;
    END IF;

    IF p_a.permission_type = 'system' THEN
        RETURN p_a.system_resource IS NULL
            OR p_b.system_resource IS NULL
            OR p_a.system_resource = p_b.system_resource;
    END IF;

    IF p_a.scope IN ('table', 'column') AND p_b.scope IN ('table', 'column') THEN
        RETURN cms.capability_values_overlap(p_a.schema_name, p_b.schema_name)
            AND cms.capability_values_overlap(p_a.table_name, p_b.table_name)
            AND cms.capability_values_overlap(p_a.column_name, p_b.column_name);
    END IF;

    IF p_a.scope = 'storage' AND p_b.scope = 'storage' THEN
        RETURN cms.capability_values_overlap(p_a.metadata ->> 'bucket_name', p_b.metadata ->> 'bucket_name')
            AND cms.storage_path_patterns_overlap(p_a.metadata ->> 'path_pattern',
                                                  p_b.metadata ->> 'path_pattern');
    END IF;

    IF p_a.scope IS NOT NULL AND p_b.scope IS NOT NULL THEN
        -- Almacenamiento frente a tabla o columna: recursos distintos.
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION cms.storage_path_literal_prefix(p_pattern text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
    select left(
        p_pattern,
        least(
            coalesce(nullif(strpos(p_pattern, '*'), 0), length(p_pattern) + 1),
            coalesce(nullif(strpos(p_pattern, '{{'), 0), length(p_pattern) + 1)
        ) - 1);
$function$
;

CREATE OR REPLACE FUNCTION cms.storage_path_patterns_overlap(p_a text, p_b text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
    v_prefix_a TEXT;
    v_prefix_b TEXT;
BEGIN
    IF p_a IS NULL OR p_b IS NULL OR p_a = '' OR p_b = '' THEN
        RETURN TRUE;
    END IF;

    v_prefix_a := cms.storage_path_literal_prefix(p_a);
    v_prefix_b := cms.storage_path_literal_prefix(p_b);

    -- Dos rutas literales: coinciden con la misma ruta solo si son iguales.
    IF v_prefix_a = p_a AND v_prefix_b = p_b THEN
        RETURN p_a = p_b;
    END IF;

    RETURN starts_with(v_prefix_a, v_prefix_b) OR starts_with(v_prefix_b, v_prefix_a);
END;
$function$
;

CREATE OR REPLACE FUNCTION cms.can_action_account(p_target_account_id uuid, p_action cms.system_action)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
DECLARE
    v_account_id            UUID;
    v_account_role_rank int;
    v_target_role_rank  int;
BEGIN
    -- Basic validation
    IF p_target_account_id IS NULL OR p_action IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Verify admin access and permissions
    IF NOT cms.has_admin_permission('account'::cms.system_resource, p_action) THEN
        RETURN FALSE;
    END IF;

    -- Nadie actúa sobre su propia cuenta con esta función (estado, roles,
    -- borrado): el código heredado tenía después un bloque de «auto
    -- modificación» que nunca se alcanzaba y se ha retirado.
    v_account_id := cms.get_current_user_account_id();
    IF v_account_id IS NULL OR v_account_id = p_target_account_id THEN
        RETURN FALSE;
    END IF;

    -- [TFG] RNF-02 · ADR-014 · F2.7a: las cuentas raíz (super-admins de la
    -- plataforma) no se gestionan desde el CMS. Lo garantiza también el rango
    -- (Root = 100, único), pero se comprueba de forma explícita. Se usa la
    -- versión interna (B-47): la pública solo responde sobre otras cuentas a
    -- quien tiene `account:select`, y esta guardia debe aplicarse siempre.
    IF cms.account_is_root_managed(p_target_account_id) THEN
        RETURN FALSE;
    END IF;

    -- Get priorities (simple reads)
    v_account_role_rank := cms.get_user_max_role_rank(v_account_id);
    v_target_role_rank := coalesce(cms.get_user_max_role_rank(p_target_account_id), 0);

    -- Higher role rank can action lower rank accounts
    RETURN v_account_role_rank > v_target_role_rank;
END;
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
BEGIN
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    SELECT * INTO v_permission FROM cms.permissions WHERE id = p_permission_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    RETURN cms.capability_is_grantable(
        v_permission.permission_type,
        v_permission.system_resource,
        v_permission.action,
        v_permission.scope,
        v_permission.schema_name,
        v_permission.table_name,
        v_permission.column_name,
        v_permission.metadata);
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
    -- de forma explícita para no depender de esa coincidencia. Versión
    -- interna (B-47): la pública no responde sobre otras cuentas a quien no
    -- tiene `account:select`, y esta guardia debe aplicarse siempre.
    IF cms.account_is_root_managed(p_target_account_id) THEN
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

CREATE OR REPLACE FUNCTION cms.can_read_audit_log(p_target_account_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
declare
    v_current_account_id        uuid;
    v_current_account_role_rank int;
    v_target_account_role_rank  int;
begin
    if not cms.verify_admin_access() then
        return false;
    end if;

    if not cms.has_admin_permission('log'::cms.system_resource, 'select'::cms.system_action) then
        return false;
    end if;

    v_current_account_id := cms.get_current_user_account_id();

    -- The user is the owner of the audit log
    if p_target_account_id is not null and p_target_account_id = v_current_account_id then
        return true;
    end if;

    select rank
    into v_current_account_role_rank
    from cms.roles
             join cms.account_roles on cms.roles.id = cms.account_roles.role_id
    where cms.account_roles.account_id = v_current_account_id;

    -- Cannot establish the reader's standing: deny.
    if v_current_account_role_rank is null then
        return false;
    end if;

    if p_target_account_id is not null then
        select rank
        into v_target_account_role_rank
        from cms.roles
                 join cms.account_roles on cms.roles.id = cms.account_roles.role_id
        where cms.account_roles.account_id = p_target_account_id;
    end if;

    -- Unknown subject (role-less account, or a row orphaned by ON DELETE SET NULL).
    -- We cannot prove the reader outranks it, so restrict it to the top of the hierarchy
    -- rather than falling through to allow.
    if v_target_account_role_rank is null then
        return v_current_account_role_rank >= (select max(rank) from cms.roles);
    end if;

    return v_current_account_role_rank >= v_target_account_role_rank;
end;
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

    -- Misma regla que `can_grant_permission` (`capability_is_grantable`),
    -- evaluada sobre los valores NUEVOS de la fila: tener la capacidad y que
    -- ninguna denegación propia se solape con ella (B-47).
    IF NOT cms.capability_is_grantable(
               NEW.permission_type,
               NEW.system_resource,
               NEW.action,
               NEW.scope,
               NEW.schema_name,
               NEW.table_name,
               NEW.column_name,
               NEW.metadata) THEN
        IF NEW.scope = 'storage' THEN
            RAISE EXCEPTION 'insufficient_privilege: cannot reshape a permission into a storage capability you do not hold'
                USING ERRCODE = '42501';
        END IF;

        RAISE EXCEPTION 'insufficient_privilege: cannot reshape a permission into a capability you do not hold'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION cms.get_user_max_role_rank(p_account_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_max_rank INTEGER;
BEGIN
    -- Input validation
    IF p_account_id IS NULL THEN
        RETURN null;
    END IF;

    -- Sesión de la API: nada sobre otras cuentas sin `account:select`.
    IF current_user IN ('authenticated', 'anon')
        AND p_account_id IS DISTINCT FROM cms.get_current_user_account_id()
        AND NOT cms.has_admin_permission('account'::cms.system_resource, 'select'::cms.system_action) THEN
        RETURN null;
    END IF;

    -- Simple query, no locks - MVCC handles consistency
    SELECT MAX(r.rank)
    INTO v_max_rank
    FROM cms.account_roles ar
             JOIN cms.roles r ON ar.role_id = r.id
    WHERE ar.account_id = p_account_id
      AND (ar.valid_until IS NULL OR ar.valid_until > NOW())
      AND (r.valid_until IS NULL OR r.valid_until > NOW());

    RETURN COALESCE(v_max_rank, null);
END;
$function$
;

CREATE OR REPLACE FUNCTION cms.is_root_managed_account(p_account_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select cms.verify_admin_access()
        and (p_account_id = cms.get_current_user_account_id()
            or cms.has_admin_permission('account'::cms.system_resource, 'select'::cms.system_action))
        and cms.account_is_root_managed(p_account_id);
$function$
;

CREATE OR REPLACE FUNCTION cms.set_account_active(p_account_id uuid, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
    v_auth_user_id uuid;
begin
    if p_account_id is null or p_is_active is null then
        return jsonb_build_object('success', false, 'error', 'INVALID_ARGUMENTS');
    end if;

    if not cms.is_mfa_compliant() then
        return jsonb_build_object('success', false, 'error', 'MFA_REQUIRED');
    end if;

    if p_account_id = cms.get_current_user_account_id() then
        return jsonb_build_object('success', false, 'error', 'SELF_ACTION');
    end if;

    -- Versión interna (B-47): la guardia no depende de `account:select`.
    if cms.account_is_root_managed(p_account_id) then
        return jsonb_build_object('success', false, 'error', 'PROTECTED');
    end if;

    if not cms.can_action_account(p_account_id, 'update'::cms.system_action) then
        return jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED');
    end if;

    select auth_user_id
    into v_auth_user_id
    from cms.accounts
    where id = p_account_id;

    if not found then
        return jsonb_build_object('success', false, 'error', 'NOT_FOUND');
    end if;

    update cms.accounts
    set is_active = p_is_active,
        updated_at = now()
    where id = p_account_id;

    if v_auth_user_id is not null then
        update auth.users
        set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) ||
                                jsonb_build_object('cms_access', case when p_is_active then 'true' else 'false' end),
            updated_at = now()
        where id = v_auth_user_id;
    end if;

    return jsonb_build_object('success', true);
end;
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
    v_target     cms.permissions;
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

    -- Una denegación que se solape con la capacidad impide delegarla.
    v_target.permission_type := 'data';
    v_target.scope := 'storage';
    v_target.action := p_action;
    v_target.metadata := jsonb_build_object('bucket_name', p_bucket_name, 'path_pattern', p_path_pattern);

    IF cms.account_has_overlapping_deny(v_account_id, v_target) THEN
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


  create policy "delete_account_permissions"
  on "cms"."account_permissions"
  as permissive
  for delete
  to authenticated
using ((cms.has_admin_permission('permission'::cms.system_resource, 'delete'::cms.system_action) AND cms.current_account_outranks(account_id)));



  create policy "insert_account_permissions"
  on "cms"."account_permissions"
  as permissive
  for insert
  to authenticated
with check ((cms.has_admin_permission('permission'::cms.system_resource, 'insert'::cms.system_action) AND cms.current_account_outranks(account_id) AND cms.can_grant_permission(permission_id)));



  create policy "update_account_permissions"
  on "cms"."account_permissions"
  as permissive
  for update
  to authenticated
using ((cms.has_admin_permission('permission'::cms.system_resource, 'update'::cms.system_action) AND cms.current_account_outranks(account_id)))
with check ((cms.has_admin_permission('permission'::cms.system_resource, 'update'::cms.system_action) AND cms.current_account_outranks(account_id) AND cms.can_grant_permission(permission_id)));



  create policy "view_account_permissions"
  on "cms"."account_permissions"
  as permissive
  for select
  to authenticated
using (((account_id = cms.get_current_user_account_id()) OR (cms.has_admin_permission('permission'::cms.system_resource, 'select'::cms.system_action) AND cms.current_account_outranks(account_id))));



  create policy "view_account_roles"
  on "cms"."account_roles"
  as permissive
  for select
  to authenticated
using ((((account_id = cms.get_current_user_account_id()) AND cms.verify_admin_access()) OR cms.has_admin_permission('account'::cms.system_resource, 'select'::cms.system_action)));





-- ---------------------------------------------------------------------------
-- EXECUTE (escrito a mano, B-35). Las funciones auxiliares y las versiones
-- internas solo las llaman otras funciones `security definer`; las tres
-- públicas responden únicamente sobre la cuenta de la sesión.
-- ---------------------------------------------------------------------------

revoke execute on function cms.capability_values_overlap (text, text) from public, anon, authenticated;

revoke execute on function cms.storage_path_literal_prefix (text) from public, anon, authenticated;

revoke execute on function cms.storage_path_patterns_overlap (text, text) from public, anon, authenticated;

revoke execute on function cms.permissions_overlap (cms.permissions, cms.permissions) from public, anon, authenticated;

revoke execute on function cms.account_has_overlapping_deny (uuid, cms.permissions) from public, anon, authenticated;

revoke execute on function cms.account_is_root_managed (uuid) from public, anon, authenticated;

grant execute on function cms.capability_is_grantable (
  cms.permission_type, cms.system_resource, cms.system_action, cms.permission_scope, text, text, text, jsonb
) to authenticated, service_role;

grant execute on function cms.current_account_outranks (uuid) to authenticated, service_role;

grant execute on function cms.count_role_members (uuid) to authenticated, service_role;
