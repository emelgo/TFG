
-- SECTION: PERMISSIONS
-- This function is used to check if a user has permission for a specific permission. It can be reused for both system and data permissions. Uses SECURITY DEFINER to avoid infinite loops when the function is used within RLS policies.
create or replace function cms.has_permission (p_account_id UUID, p_permission_id UUID) RETURNS BOOLEAN security definer
set
  row_security = off
set
  statement_timeout = '5s'
set
  lock_timeout = '3s'
set
  SEARCH_PATH to '' as $$
BEGIN
    -- First check for explicit denials (which take precedence)
    IF EXISTS (SELECT 1
               FROM cms.account_permissions ap
               WHERE ap.account_id = p_account_id
                 AND ap.permission_id = p_permission_id
                 AND ap.is_grant = FALSE
                 AND (ap.valid_until IS NULL OR ap.valid_until > NOW())) THEN
        RETURN FALSE; -- Explicit denial takes precedence
    END IF;

    -- Check for any valid permission grant path
    RETURN EXISTS (
        -- Direct permission grants
        SELECT 1
        FROM cms.account_permissions ap
        WHERE ap.account_id = p_account_id
          AND ap.permission_id = p_permission_id
          AND ap.is_grant = TRUE
          AND (ap.valid_until IS NULL OR ap.valid_until > NOW())

        UNION

        -- Role-based permissions (direct path)
        SELECT 1
        FROM cms.account_roles ar
                 JOIN cms.role_permissions rp ON ar.role_id = rp.role_id
        WHERE ar.account_id = p_account_id
          AND rp.permission_id = p_permission_id
          AND (ar.valid_until IS NULL OR ar.valid_until > NOW())
          AND (rp.valid_until IS NULL OR rp.valid_until > NOW())

        UNION

        -- Permission group path
        SELECT 1
        FROM cms.account_roles ar
                 JOIN cms.role_permission_groups rpg ON ar.role_id = rpg.role_id
                 JOIN cms.permission_group_permissions pgp ON rpg.group_id = pgp.group_id
        WHERE ar.account_id = p_account_id
          AND pgp.permission_id = p_permission_id
          AND (ar.valid_until IS NULL OR ar.valid_until > NOW())
          AND (rpg.valid_until IS NULL OR rpg.valid_until > NOW()));
END;
$$ LANGUAGE plpgsql;

-- [TFG] RNF-02 · ADR-015 (pendiente cerrado en F2.7b): `has_permission`
-- responde sí/no para CUALQUIER cuenta y permiso. Con el `grant` heredado,
-- cualquier miembro del personal podía preguntar qué permisos tiene otra
-- cuenta (por ejemplo, la de Root). Solo la usan otras funciones
-- `security definer` (que se ejecutan como su propietario), así que no se
-- concede a `authenticated`. La API ya no la llama: para saber si el usuario
-- ve la sección de almacenamiento usa `cms.current_account_has_storage_access`.
revoke execute on function cms.has_permission (uuid, uuid) from public, anon, authenticated;

grant execute on function cms.has_permission (uuid, uuid) to service_role;

-- SECTION: SYSTEM PERMISSIONS
-- This function is used to check if a user has system permission for a specific system resource. System resources are resources that belong to CMS itself, not the end application being managed. For example: table, role, permission, etc. Uses SECURITY DEFINER to avoid infinite loops when the function is used within RLS policies.
create or replace function cms.has_admin_permission (
  p_resource cms.system_resource,
  p_action cms.system_action
) RETURNS BOOLEAN security definer
set
  row_security = off
set
  SEARCH_PATH to '' as $$
DECLARE
    v_permission_id UUID;
BEGIN
    -- Check if user has admin access
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    -- Explicit-deny precedence at the (resource, action) level. has_permission
    -- only applies deny precedence per-permission_id, so without this an explicit
    -- account-level denial of one matching permission could be defeated by a
    -- granted wildcard sibling row covering the same resource/action. Evaluate the
    -- denial across the full matching set FIRST so a deny always wins.
    IF EXISTS (SELECT 1
               FROM cms.permissions p
                        JOIN cms.account_permissions ap ON ap.permission_id = p.id
               WHERE p.permission_type = 'system'
                 AND p.system_resource = p_resource
                 AND (p.action = p_action OR p.action = '*')
                 AND ap.account_id = cms.get_current_user_account_id()
                 AND ap.is_grant = FALSE
                 AND (ap.valid_until IS NULL OR ap.valid_until > NOW())) THEN
        RETURN FALSE;
    END IF;

    -- Find the permission key for the resource and action
    RETURN EXISTS (SELECT 1
                   FROM cms.permissions p
                   WHERE permission_type = 'system'
                     AND system_resource = p_resource
                     AND (action = p_action OR action = '*')
                     AND cms.has_permission(cms.get_current_user_account_id(), p.id));
END;
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.has_admin_permission to authenticated,
service_role;

/*
 * -------------------------------------------------------
 * Sección: solapamiento entre capacidades (denegaciones y delegación)
 *
 * [TFG] RNF-02 · ADR-015 · bitácora B-47. Una denegación explícita
 * (`account_permissions.is_grant = false`) recorta lo que una cuenta puede
 * HACER, pero antes no recortaba lo que podía DELEGAR. Las comprobaciones de
 * «¿tengo esta capacidad?» (`has_data_permission`, `has_admin_permission`)
 * solo miran las denegaciones que CUBREN el objetivo: al preguntar por el
 * comodín `'*'.'*'` solo encontraban una denegación que fuera también
 * `'*'.'*'`. Así, un administrador delegado con lectura `'*'.'*'` y una
 * denegación sobre `public.nominas` podía colgar el permiso comodín de un rol
 * inferior, asignárselo a un segundo inicio de sesión suyo (una cuenta
 * «títere») y leer la tabla denegada a través de ella.
 *
 * La regla correcta para CONCEDER es más estricta que para USAR: solo se
 * delega una capacidad si se tiene y si ninguna denegación vigente de quien
 * la concede SE SOLAPA con ella, es decir, si no existe ningún recurso que
 * quede dentro de la denegación y a la vez dentro de lo que se concede.
 *
 * Las funciones de esta sección son pequeñas y puras (salvo la última) para
 * poder leerlas y probarlas por separado. Ante la duda (valores ausentes,
 * formas desconocidas) responden «se solapan»: para una denegación, eso
 * significa fallar en cerrado.
 * -------------------------------------------------------
 */

/*
 * cms.capability_values_overlap
 *
 * Dos valores de una capacidad (acción, esquema, tabla, columna o *bucket*)
 * se solapan si son iguales o si cualquiera de los dos es el comodín `'*'`.
 * Un valor ausente (NULL) cuenta como «todo»: en la columna significa que el
 * permiso es de tabla completa, y en los demás casos solo aparece en filas
 * antiguas o mal formadas, donde conviene fallar en cerrado.
 */
create or replace function cms.capability_values_overlap (p_a text, p_b text) returns boolean language sql immutable
set
  search_path = '' as $$
    select p_a is null
        or p_b is null
        or p_a = '*'
        or p_b = '*'
        or p_a = p_b;
$$;

revoke execute on function cms.capability_values_overlap (text, text) from public, anon, authenticated;

/*
 * cms.storage_path_literal_prefix
 *
 * Parte literal inicial de un patrón de ruta de almacenamiento: todo lo que
 * hay antes del primer comodín `*` o de la primera variable `{{...}}` (que
 * se sustituye por un id al comprobar el acceso, así que aquí se trata como
 * un comodín más). Para un patrón sin comodines ni variables es el patrón
 * entero.
 */
create or replace function cms.storage_path_literal_prefix (p_pattern text) returns text language sql immutable
set
  search_path = '' as $$
    select left(
        p_pattern,
        least(
            coalesce(nullif(strpos(p_pattern, '*'), 0), length(p_pattern) + 1),
            coalesce(nullif(strpos(p_pattern, '{{'), 0), length(p_pattern) + 1)
        ) - 1);
$$;

revoke execute on function cms.storage_path_literal_prefix (text) from public, anon, authenticated;

/*
 * cms.storage_path_patterns_overlap
 *
 * Decide si dos patrones de ruta PUEDEN coincidir con una misma ruta. La
 * intersección exacta de dos patrones con comodines es costosa y fácil de
 * equivocar, así que se aplica una regla conservadora: solo se declaran
 * disjuntos cuando se puede demostrar con sus prefijos literales.
 *
 *  - Si falta alguno de los dos patrones: se solapan (fallo en cerrado).
 *  - Si los dos son literales (sin `*` ni `{{`): se solapan solo si son
 *    iguales, porque cada uno describe una única ruta.
 *  - En otro caso: se solapan si el prefijo literal de uno empieza por el
 *    del otro. Ejemplo: los patrones de prefijos `team/` y `team/nominas/`
 *    (seguidos de `*`) se solapan; los de `team/` y `public/` no (ninguna
 *    ruta puede empezar a la vez por los dos). `*` tiene prefijo vacío y se
 *    solapa con todo. (Los ejemplos no escriben la barra pegada al `*`
 *    porque dentro de un comentario de bloque SQL esa pareja abre otro
 *    comentario anidado.)
 */
create or replace function cms.storage_path_patterns_overlap (p_a text, p_b text) returns boolean language plpgsql immutable
set
  search_path = '' as $$
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
$$;

revoke execute on function cms.storage_path_patterns_overlap (text, text) from public, anon, authenticated;

/*
 * cms.permissions_overlap
 *
 * Decide si dos permisos comparten algún recurso y acción, es decir, si hay
 * algo que ambos cubren a la vez. Se usa con una denegación (`p_a`) y con la
 * capacidad que se quiere conceder (`p_b`), aunque la relación es simétrica.
 *
 *  - Tipos distintos (sistema frente a datos): nunca se solapan.
 *  - Sistema: mismo recurso (el tipo `system_resource` no tiene comodín) y
 *    acciones que se solapan (`account:*` se solapa con `account:delete`).
 *  - Datos de tabla o columna: se solapan la acción, el esquema, la tabla y
 *    la columna (una columna NULL es la tabla completa, así que una
 *    denegación de columna se solapa con un permiso de tabla).
 *  - Almacenamiento: se solapan la acción, el *bucket* y el patrón de ruta
 *    (`storage_path_patterns_overlap`).
 *  - Almacenamiento frente a tabla: no se solapan (recursos distintos).
 *  - Cualquier otra forma (ámbito ausente en filas mal formadas): se solapan,
 *    fallo en cerrado.
 */
create or replace function cms.permissions_overlap (p_a cms.permissions, p_b cms.permissions) returns boolean language plpgsql immutable
set
  search_path = '' as $$
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
$$;

revoke execute on function cms.permissions_overlap (cms.permissions, cms.permissions) from public, anon, authenticated;

/*
 * cms.account_has_overlapping_deny
 *
 * Indica si la cuenta tiene alguna denegación explícita vigente que se
 * solape con la capacidad `p_target`. Es `security definer` con RLS
 * desactivado porque debe ver todas las denegaciones de la cuenta; no se
 * concede a nadie: solo la llaman `capability_is_grantable` y
 * `storage_capability_is_grantable`, siempre con la cuenta de la sesión.
 */
create or replace function cms.account_has_overlapping_deny (p_account_id uuid, p_target cms.permissions) returns boolean language sql stable security definer
set
  row_security = off
set
  search_path = '' as $$
    select exists (select 1
                   from cms.account_permissions ap
                            join cms.permissions d on d.id = ap.permission_id
                   where ap.account_id = p_account_id
                     and ap.is_grant = false
                     and (ap.valid_until is null or ap.valid_until > now())
                     and cms.permissions_overlap(d, p_target));
$$;

revoke execute on function cms.account_has_overlapping_deny (uuid, cms.permissions) from public, anon, authenticated;

/*
 * cms.has_storage_permission
 *
 * Decide si la cuenta actual puede hacer `p_action` sobre el objeto
 * `p_object_path` del *bucket* `p_bucket_name`. Los permisos de
 * almacenamiento son permisos de datos con ámbito `storage`: su capacidad
 * vive en `metadata->>'bucket_name'` y `metadata->>'path_pattern'` (con `*`
 * como comodín y las variables `{{user_id}}` y `{{account_id}}`).
 *
 * [TFG] RNF-02 · ADR-015 (pendiente cerrado en F2.7b): falla en CERRADO.
 * El código heredado trataba un *bucket* o un patrón ausente como «sin
 * restricción», es decir, como un comodín. Ahora un valor ausente o vacío
 * no concede nada, y el comodín hay que escribirlo de forma explícita
 * (`'*'`), como ya hacía el permiso de almacenamiento de Root. Además, los
 * caracteres `%` y `_` del patrón se escapan antes de convertir `*` en `%`,
 * para que solo `*` actúe como comodín en el `LIKE`.
 */
create or replace function cms.has_storage_permission (
  p_bucket_name TEXT,
  p_action cms.system_action,
  p_object_path TEXT
) RETURNS BOOLEAN SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
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
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.has_storage_permission to authenticated;

/*
 * cms.storage_capability_is_grantable
 *
 * Comprueba si la cuenta actual puede conceder (o dar forma a) un permiso
 * de almacenamiento con esa acción, *bucket* y patrón: debe tener ya uno que
 * lo cubra. Es el equivalente, para el ámbito `storage`, de
 * `has_admin_permission` y `has_data_permission` en `can_grant_permission`.
 * La inclusión de patrones no es decidible aquí, así que se exige
 * coincidencia exacta o un comodín `'*'` explícito.
 *
 * [TFG] RNF-02 · ADR-015 (F2.7b): falla en cerrado. Antes un *bucket* o un
 * patrón ausente en el permiso que se posee contaba como comodín
 * (`coalesce(..., '*')`) y un objetivo ausente coincidía con otro ausente
 * (`is not distinct from`). Ahora los dos lados deben tener valores
 * explícitos.
 *
 * [TFG] B-47: además, ninguna denegación de almacenamiento de quien concede
 * puede solaparse con la capacidad (mismo *bucket* o `'*'`, y patrones que
 * puedan coincidir con una misma ruta). Sin esto, quien tiene el *bucket*
 * `docs` con patrón `*` y una denegación sobre las rutas que empiezan por
 * `nominas/` podría delegar el comodín a una cuenta títere y leer lo
 * denegado por ella.
 */
create or replace function cms.storage_capability_is_grantable (
  p_action cms.system_action,
  p_bucket_name TEXT,
  p_path_pattern TEXT
) RETURNS BOOLEAN security definer
set
  row_security = off
set
  search_path = '' as $$
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
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.storage_capability_is_grantable to authenticated;


-- SECTION: DATA PERMISSIONS
-- This function is used to check if a user has data permission for a specific data resource. Data resources are data that belongs to the end application being managed, not CMS itself. Uses SECURITY DEFINER to avoid infinite loops when the function is used within RLS policies.
create or replace function cms.has_data_permission (
  p_action cms.system_action,
  p_schema_name VARCHAR,
  p_table_name VARCHAR default null
) RETURNS BOOLEAN security definer
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_permission_id UUID;
BEGIN
    -- Check if user has admin access
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    -- Table-level permission
    IF p_schema_name IS NOT NULL AND p_table_name IS NOT NULL THEN
        -- Explicit-deny precedence at the (action, schema, table) level. As with
        -- has_admin_permission, evaluate explicit account-level denials across the
        -- full matching set FIRST so a deny (including a column-scoped deny carving
        -- a sensitive column out of a broader table grant) cannot be defeated by a
        -- granted wildcard sibling row.
        IF EXISTS (SELECT 1
                   FROM cms.permissions p
                            JOIN cms.account_permissions ap ON ap.permission_id = p.id
                   WHERE p.permission_type = 'data'
                     AND (p.action = p_action OR p.action = '*')
                     AND p.scope IN ('table', 'column')
                     AND (p.schema_name = p_schema_name OR p.schema_name = '*')
                     AND (p.table_name = p_table_name OR p.table_name = '*')
                     AND ap.account_id = cms.get_current_user_account_id()
                     AND ap.is_grant = FALSE
                     AND (ap.valid_until IS NULL OR ap.valid_until > NOW())) THEN
            RETURN FALSE;
        END IF;

        IF exists(SELECT 1
                  FROM cms.permissions p
                  WHERE permission_type = 'data'
                    AND (action = p_action OR action = '*')
                    AND scope = 'table'
                    AND (schema_name = p_schema_name OR schema_name = '*')
                    AND (table_name = p_table_name OR table_name = '*')
                    AND cms.has_permission(cms.get_current_user_account_id(), p.id))
        THEN
            RETURN TRUE;
        END IF;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.has_data_permission to authenticated,
service_role;

/*
 * cms.capability_is_grantable
 *
 * Decide si la cuenta de la sesión puede conceder (o dar forma a) la
 * capacidad descrita por los campos de un permiso, esté guardado o no. Es la
 * regla única de delegación que usan `can_grant_permission` (asignaciones),
 * el *trigger* `enforce_permission_reshape_grantable` (edición en el sitio)
 * y la API al validar un permiso antes de guardarlo.
 *
 * Dos condiciones, las dos obligatorias:
 *
 *  1. TENERLA: `has_admin_permission` (sistema), `has_data_permission`
 *     (tabla o columna) o `storage_capability_is_grantable` (almacenamiento).
 *  2. [TFG] B-47: que NINGUNA denegación explícita vigente de la cuenta se
 *     solape con ella (`account_has_overlapping_deny`). Tener `'*'.'*'` no
 *     basta si se tiene denegada una tabla concreta: el comodín incluiría
 *     esa tabla y la denegación se esquivaría delegándolo.
 *
 * Cualquier otra forma de permiso (no la admite `valid_permission_type`)
 * falla en cerrado.
 */
create or replace function cms.capability_is_grantable (
  p_permission_type cms.permission_type,
  p_system_resource cms.system_resource,
  p_action cms.system_action,
  p_scope cms.permission_scope,
  p_schema_name TEXT,
  p_table_name TEXT,
  p_column_name TEXT,
  p_metadata JSONB
) RETURNS BOOLEAN security definer
set
  row_security = off
set
  search_path = '' as $$
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
$$ LANGUAGE plpgsql;

-- Solo responde sobre la cuenta de la sesión. La API la usa para validar un
-- permiso nuevo o editado antes de guardarlo (mismo criterio que la BD).
grant
execute on FUNCTION cms.capability_is_grantable to authenticated,
service_role;

/*
 * cms.can_grant_permission
 *
 * Decide si la cuenta actual puede colgar un permiso de un rol, de una
 * cuenta o de un grupo de permisos. Sin esta comprobación, las políticas de
 * las tablas de asignación solo miraban el RANGO del contenedor y nunca lo
 * que concede el permiso: un administrador de rango bajo con
 * `permission:insert` podía crear un permiso demasiado amplio (por ejemplo,
 * `account` con acción `*` o datos `*`/`*`) y colgarlo de un rol de su rango para
 * escalar privilegios.
 *
 * Regla: solo se concede una capacidad que uno mismo ya tiene. Se evalúa
 * con las comprobaciones de recurso y acción (`has_admin_permission`,
 * `has_data_permission`, `storage_capability_is_grantable`) y no buscando
 * el id del permiso, para que una denegación explícita también impida
 * delegarlo a otra cuenta.
 *
 * [TFG] RNF-02 · ADR-015 · F2.7b: los permisos de almacenamiento se
 * comprueban por su capacidad (*bucket*, patrón y acción). Antes se exigía
 * poseer ESE permiso concreto, así que ni Root podía conceder un permiso de
 * almacenamiento recién creado aunque tuviera el comodín `*`.
 *
 * [TFG] B-47: la decisión la toma `capability_is_grantable`, que además
 * exige que ninguna denegación explícita de quien concede se SOLAPE con el
 * permiso (antes solo contaban las denegaciones que lo cubrían entero). Una
 * forma de permiso desconocida ya no se acepta por tener ese id concreto:
 * falla en cerrado.
 */
create or replace function cms.can_grant_permission (p_permission_id UUID) RETURNS BOOLEAN security definer
set
  row_security = off
set
  search_path = '' as $$
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
$$ LANGUAGE plpgsql;

-- Se usa en las políticas RLS de las tablas de asignación (se evalúan con
-- el rol del usuario) y la API la usa para ofrecer solo lo que se puede
-- conceder. Solo responde sobre la cuenta de la sesión.
grant
execute on FUNCTION cms.can_grant_permission to authenticated,
service_role;


-- SECTION: GET USER MAX ROLE rank
-- In this section, we define the get user max role rank function. This function is used to get the maximum role rank for a specific account.
--
-- [TFG] RNF-02 · B-47: con una sesión de la API (`authenticated`) solo
-- responde sobre la cuenta de la sesión, salvo que quien pregunta pueda
-- consultar las cuentas (`account:select`, como Ajustes > Miembros). Antes
-- cualquier miembro del personal podía preguntar el rango de otra cuenta
-- (por ejemplo, la de Root). La función es SECURITY INVOKER: dentro de una
-- función `security definer` (`can_action_account`,
-- `can_modify_account_role`, `current_account_outranks`...) `current_user`
-- es el propietario y la función responde sobre cualquier cuenta, que es lo
-- que necesitan esas comprobaciones internas. Las políticas RLS que
-- comparan rangos con otra cuenta usan `current_account_outranks`.
create or replace function cms.get_user_max_role_rank (p_account_id UUID) RETURNS INTEGER
set
  search_path = '' as $$
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
$$ LANGUAGE plpgsql;

/*
 * cms.current_account_outranks
 *
 * Indica si la cuenta de la sesión tiene un rango ESTRICTAMENTE superior al
 * de `p_account_id`. La usan las políticas de `cms.account_permissions`, que
 * antes comparaban `get_user_max_role_rank` de las dos cuentas: con esa
 * función ya limitada a la propia cuenta (B-47), la comparación necesita
 * ver el rango ajeno sin exponerlo. Solo devuelve un sí/no relativo al rango
 * propio (lo mismo que ya revelaban las políticas), nunca el rango.
 * Una cuenta sin rol no es superada por nadie (fallo en cerrado, igual que
 * la comparación heredada con NULL).
 */
create or replace function cms.current_account_outranks (p_account_id UUID) RETURNS BOOLEAN security definer
set
  row_security = off
set
  search_path = '' as $$
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
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.current_account_outranks to authenticated,
service_role;

/*
 * cms.count_role_members
 *
 * Número de cuentas que tienen un rol. Desde B-47 la política
 * `view_account_roles` solo deja ver las asignaciones propias a quien no
 * tiene `account:select`, así que contar filas de `account_roles` con la
 * sesión del usuario daría 0 o 1. La pantalla de roles solo necesita el
 * número (quién lo tiene se muestra solo con `account:select`), que no
 * identifica a nadie.
 */
create or replace function cms.count_role_members (p_role_id UUID) RETURNS INTEGER security definer
set
  row_security = off
set
  search_path = '' as $$
BEGIN
    IF p_role_id IS NULL OR NOT cms.verify_admin_access() THEN
        RETURN 0;
    END IF;

    RETURN (SELECT count(*)::INTEGER FROM cms.account_roles ar WHERE ar.role_id = p_role_id);
END;
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.count_role_members to authenticated,
service_role;

/*
 * cms.can_view_permission_group
 *
 * Decide si la cuenta puede ver un grupo de permisos: lo tiene por su rol,
 * lo creó o lo usa un rol de rango igual o inferior al suyo. La usa la
 * política SELECT de `cms.permission_groups` y de sus asignaciones.
 *
 * [TFG] RNF-02 · ADR-015 (F2.7b): la función es `security definer` y
 * recibe la cuenta como parámetro, así que cualquiera podía preguntar qué
 * grupos ve OTRA cuenta (una respuesta sí/no sobre su rol). Ahora solo
 * responde sobre la cuenta de la sesión; las políticas ya la llaman así.
 */
create or replace function cms.can_view_permission_group (p_account_id UUID, p_group_id UUID) RETURNS BOOLEAN security definer
set
  row_security = off
set
  search_path = '' as $$
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
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.can_view_permission_group to authenticated,
service_role;

-- SECTION: LOCK ORDERING UTILITIES
-- Create a function to lock multiple resources in a consistent order
create or replace function cms.lock_resources_ordered (
  p_accounts UUID[] default '{}'::UUID[],
  p_roles UUID[] default '{}'::UUID[],
  p_permission_groups UUID[] default '{}'::UUID[],
  p_permissions UUID[] default '{}'::UUID[]
) RETURNS VOID SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
BEGIN
    -- Order and lock accounts
    IF array_length(p_accounts, 1) IS NOT NULL THEN
        PERFORM id
        FROM cms.accounts
        WHERE id = ANY (p_accounts)
        ORDER BY id
        FOR UPDATE;
    END IF;

    -- Order and lock roles
    IF array_length(p_roles, 1) IS NOT NULL THEN
        PERFORM id
        FROM cms.roles
        WHERE id = ANY (p_roles)
        ORDER BY id
        FOR UPDATE;
    END IF;

    -- Order and lock permission groups
    IF array_length(p_permission_groups, 1) IS NOT NULL THEN
        PERFORM id
        FROM cms.permission_groups
        WHERE id = ANY (p_permission_groups)
        ORDER BY id
        FOR UPDATE;
    END IF;

    -- Order and lock permissions
    IF array_length(p_permissions, 1) IS NOT NULL THEN
        PERFORM id
        FROM cms.permissions
        WHERE id = ANY (p_permissions)
        ORDER BY id
        FOR UPDATE;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- [TFG] RNF-02 · F2.7b: bloquea filas `FOR UPDATE` sin comprobar nada, así
-- que un miembro del personal podía bloquear roles o cuentas ajenos durante
-- su transacción. Solo la llama `can_modify_account_role` (`security
-- definer`, se ejecuta como su propietario), así que no se concede a
-- `authenticated`.
revoke execute on function cms.lock_resources_ordered (uuid[], uuid[], uuid[], uuid[]) from public, anon, authenticated;

-- SECTION: CAN ACTION ACCOUNT
-- In this section, we define the can action account function. This function is used to check if a user can action a specific account. Uses SECURITY DEFINER to avoid infinite loops when the function is used within RLS policies.
create or replace function cms.can_action_account (
  p_target_account_id uuid,
  p_action cms.system_action
) RETURNS boolean SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
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
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.can_action_account to authenticated,
service_role;

-- SECTION: CAN MODIFY PERMISSION
-- In this section, we define the can modify permission function. This function is used to check if a user can modify a specific permission. Uses SECURITY DEFINER to avoid infinite loops when the function is used within RLS policies.
create or replace function cms.can_modify_permission (
  p_permission_id UUID,
  p_action cms.system_action default 'update'
) RETURNS BOOLEAN security definer
set
  row_security = off
set
  search_path = '' as $$
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
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.can_modify_permission to authenticated;

-- SECTION: CAN DELETE PERMISSION
-- In this section, we define the can delete permission function. This function is used to check if a user can delete a specific permission.
-- SECURITY DEFINER + row_security = off (bug-hunt 12x01): the in-use EXISTS probes
-- below (permission_group_permissions / role_permissions / account_permissions)
-- must see ALL linkage rows. Without DEFINER they ran RLS-on as the caller, so a
-- low-rank admin could not see higher-rank usage of the permission -> the guard
-- reported "not in use" -> the delete proceeded and ON DELETE CASCADE silently
-- stripped the permission from higher-rank roles/groups/accounts. Matches the
-- DEFINER posture of its sibling can_modify_permission.
create or replace function cms.can_delete_permission (p_permission_id UUID) RETURNS BOOLEAN security definer
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_user_max_rank             INTEGER;
    v_highest_role_using_permission INTEGER;
    v_is_in_use                     BOOLEAN;
BEGIN
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    -- Basic modification check first
    IF NOT cms.can_modify_permission(p_permission_id, 'delete') THEN
        RETURN FALSE;
    END IF;

    -- Additional checks for deletion:

    -- Check if permission is in use by permission groups
    SELECT EXISTS (SELECT 1
                   FROM cms.permission_group_permissions
                   WHERE permission_id = p_permission_id)
    INTO v_is_in_use;

    IF v_is_in_use THEN
        -- Permission is in use by permission groups - require escalation instead of direct deletion
        RETURN FALSE;
    END IF;

    -- Check if permission is in use by roles
    SELECT EXISTS (SELECT 1
                   FROM cms.role_permissions
                   WHERE permission_id = p_permission_id)
    INTO v_is_in_use;

    IF v_is_in_use THEN
        -- Permission is in use by roles - require escalation or disallow
        RETURN FALSE;
    END IF;

    -- Check if permission is directly assigned to accounts
    SELECT EXISTS (SELECT 1
                   FROM cms.account_permissions
                   WHERE permission_id = p_permission_id)
    INTO v_is_in_use;

    IF v_is_in_use THEN
        -- Permission is directly assigned to accounts - require escalation instead of direct deletion
        RETURN FALSE;
    END IF;

    -- If we get here, permission can be safely deleted
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
grant
execute on FUNCTION cms.can_delete_permission to authenticated;

/*
 * cms.enforce_permission_reshape_grantable (trigger BEFORE UPDATE de
 * `cms.permissions`)
 *
 * Impide «dar forma» a un permiso ya asignado hasta convertirlo en una
 * capacidad que quien lo edita no tiene. `can_grant_permission` protege las
 * ASIGNACIONES (los INSERT en las tablas de asignación), pero no ve un
 * UPDATE en el sitio de la fila del permiso, y `can_modify_permission` solo
 * aplica la regla de rango. Sin este *trigger*, un administrador de rango
 * bajo podía crear un permiso estrecho que sí tiene, colgarlo de un rol
 * inferior y después ensancharlo (por ejemplo, a datos `*`/`*`) para que ese
 * rol lo disfrutara a través del enlace ya existente.
 *
 * Es un *trigger* y no un `WITH CHECK` porque necesita comparar la fila
 * vieja con la nueva: solo se vuelve a validar cuando cambia una columna que
 * define la capacidad. Editar el nombre o la descripción (ya limitado por el
 * rango en `can_modify_permission`) no se bloquea.
 *
 * [TFG] RNF-02 · ADR-015: la API (F2.7b) lo traduce a
 * `PERMISSION_NOT_GRANTABLE`. Desde B-47 aplica `capability_is_grantable`,
 * así que una denegación que se solape con la forma nueva también lo impide.
 */
create or replace function cms.enforce_permission_reshape_grantable () RETURNS trigger security definer
set
  row_security = off
set
  search_path = '' as $$
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
$$ LANGUAGE plpgsql;

-- Es una función de *trigger*: nadie necesita llamarla directamente (los
-- *triggers* no comprueban el EXECUTE de quien modifica la tabla).
revoke execute on function cms.enforce_permission_reshape_grantable () from public, anon, authenticated;

-- SECTION: CAN GRANT PERMISSION GROUP
-- role_permission_groups is the fourth capability-attachment edge. The other three carry
-- can_grant_permission; this one could not, because can_modify_role_permission_group takes
-- no group_id and so never inspects what is being attached.
create or replace function cms.can_grant_permission_group (p_group_id UUID) RETURNS BOOLEAN security definer
set
  row_security = off
set
  search_path = '' as $$
BEGIN
    IF p_group_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Every permission the group confers must itself be grantable by the caller.
    RETURN NOT EXISTS (SELECT 1
                       FROM cms.permission_group_permissions pgp
                       WHERE pgp.group_id = p_group_id
                         AND NOT cms.can_grant_permission(pgp.permission_id));
END;
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.can_grant_permission_group to authenticated;

-- SECTION: CAN MODIFY PERMISSION GROUP PERMISSIONS
-- In this section, we define the can modify permission group permissions function. This function is used to check if a user can modify the permissions of a specific permission group. Uses SECURITY DEFINER to avoid infinite loops when the function is used within RLS policies.
create or replace function cms.can_modify_permission_group_permissions (p_group_id UUID, p_action cms.system_action) RETURNS BOOLEAN security definer
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_user_max_rank             INTEGER;
    v_role_using_group_max_rank INTEGER;
BEGIN
    -- First check: Does user have admin permission to manage permission groups?
    IF NOT cms.has_admin_permission('permission'::cms.system_resource, p_action) THEN
        raise exception 'You do not have permission to manage permission groups';
    END IF;

    -- Check user rank
    v_user_max_rank := cms.get_user_max_role_rank(cms.get_current_user_account_id());

    if v_user_max_rank is null then
        raise exception 'This user does not have any roles';
    end if;

    -- get the highest rank role that uses this group
    select max(r.rank)
    into v_role_using_group_max_rank
    from cms.role_permission_groups rpg
             join cms.roles r on rpg.role_id = r.id
    where rpg.group_id = p_group_id;

    if coalesce(v_role_using_group_max_rank, 0) > v_user_max_rank then
        raise exception 'This user cannot modify this permission group because it is used by a role with a higher rank than their own.';
    end if;

    return true;
END;
$$ LANGUAGE plpgsql;

grant
execute on function cms.can_modify_permission_group_permissions to authenticated;

-- SECTION: CAN MODIFY PERMISSION GROUP
-- In this section, we define the can modify permission group function. This function is used to check if a user can modify a specific permission group. Uses SECURITY DEFINER to avoid infinite loops when the function is used within RLS policies.
create or replace function cms.can_modify_permission_group (p_group_id UUID, p_action cms.system_action) RETURNS BOOLEAN SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_user_max_rank     INTEGER;
    v_current_account_id    UUID;
    v_user_has_this_group   BOOLEAN;
    v_group_locked          RECORD;
    v_highest_role_rank INTEGER;
BEGIN
    -- First check: Does user have admin permission to manage permission groups?
    IF NOT cms.has_admin_permission('permission'::cms.system_resource, p_action) THEN
        RETURN FALSE;
    END IF;

    -- Lock the permission group
    SELECT id, created_by
    INTO v_group_locked
    FROM cms.permission_groups
    WHERE id = p_group_id
        FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Get the current account ID
    v_current_account_id := cms.get_current_user_account_id();

    -- Get the user's maximum role rank
    v_user_max_rank := cms.get_user_max_role_rank(v_current_account_id);

    IF v_user_max_rank IS NULL THEN
        RAISE EXCEPTION 'This user does not have any roles';
    END IF;

    -- For DELETE operations, check if user has this permission group through any of their roles
    IF p_action = 'delete' THEN
        SELECT EXISTS (SELECT 1
                       FROM cms.account_roles ar
                                JOIN cms.role_permission_groups rpg ON ar.role_id = rpg.role_id
                       WHERE ar.account_id = v_current_account_id
                         AND rpg.group_id = p_group_id
                           FOR SHARE -- Just checking
        )
        INTO v_user_has_this_group;

        -- User should not be able to delete groups they are part of
        IF v_user_has_this_group THEN
            RETURN FALSE;
        END IF;
    END IF;

    -- 🔒 SECURITY FIX: Find the HIGHEST rank role that uses this group
    -- First lock the role-group relationships to prevent concurrent changes
    PERFORM 1
    FROM cms.role_permission_groups rpg
    WHERE rpg.group_id = p_group_id
        FOR SHARE;

    -- Then get the highest rank (without locking since we already locked above)
    SELECT MAX(r.rank)
    INTO v_highest_role_rank
    FROM cms.role_permission_groups rpg
             JOIN cms.roles r ON rpg.role_id = r.id
    WHERE rpg.group_id = p_group_id;

    -- If no roles use this group, check if user created it
    IF v_highest_role_rank IS NULL THEN
        RETURN v_group_locked.created_by = v_current_account_id;
    END IF;

    IF p_action = 'delete' THEN
        -- For DELETE: User must have STRICTLY HIGHER rank than ALL roles using the group
        -- This prevents users from deleting groups used by equal or higher rank roles
        RETURN v_user_max_rank > v_highest_role_rank;
    ELSE
        -- For UPDATE/INSERT: User must have HIGHER OR EQUAL rank
        -- This allows users to modify groups assigned to their own role level
        RETURN v_user_max_rank >= v_highest_role_rank;
    END IF;
END;
$$ LANGUAGE plpgsql;

/*
 * cms.can_view_role_permission_group
 *
 * Decide si la cuenta puede ver qué grupos tiene un rol: el suyo o uno de
 * rango igual o inferior. La usa la política SELECT de
 * `cms.role_permission_groups`.
 *
 * [TFG] RNF-02 · F2.7b: solo responde sobre la cuenta de la sesión (antes
 * aceptaba cualquier cuenta como parámetro).
 */
create or replace function cms.can_view_role_permission_group (p_account_id UUID, p_role_id UUID) RETURNS BOOLEAN
set
  search_path = '' as $$
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
$$ LANGUAGE plpgsql;

/*
 * cms.can_modify_role_permission_group
 *
 * Decide si la cuenta puede asignar o quitar grupos de permisos a un rol:
 * necesita el permiso `role` para esa acción y un rango ESTRICTAMENTE
 * superior al del rol (así nadie toca los grupos de su propio rol). Lo que
 * se asigna lo limita aparte `can_grant_permission_group`.
 *
 * [TFG] RNF-02 · F2.7b: solo responde sobre la cuenta de la sesión (antes
 * aceptaba cualquier cuenta como parámetro y permitía preguntar «¿podría
 * Root hacer esto?»).
 */
create or replace function cms.can_modify_role_permission_group (
  p_account_id UUID,
  p_role_id UUID,
  p_action cms.system_action
) RETURNS BOOLEAN VOLATILE
set
  search_path = '' as $$
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
$$ LANGUAGE plpgsql;

-- SECTION: CAN DELETE ROLE
-- In this section, we define the can delete role function. This function is used to check if a user can delete a specific role.
create or replace function cms.can_delete_role (p_role_id UUID) RETURNS BOOLEAN
set
  search_path = '' as $$
DECLARE
    v_user_max_rank  INTEGER;
    v_role_rank      INTEGER;
    v_user_has_role      BOOLEAN;
    v_current_account_id UUID;
BEGIN
    -- Basic checks
    IF p_role_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check admin access
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    -- Check basic admin permission
    IF NOT cms.has_admin_permission('role'::cms.system_resource, 'delete'::cms.system_action) THEN
        RETURN FALSE;
    END IF;

    v_current_account_id := cms.get_current_user_account_id();
    IF v_current_account_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Get role rank (simple read)
    SELECT rank
    INTO v_role_rank
    FROM cms.roles
    WHERE id = p_role_id;

    IF v_role_rank IS NULL THEN
        RETURN FALSE; -- Role doesn't exist
    END IF;

    -- Check if user has this role (simple read)
    SELECT EXISTS (SELECT 1
                   FROM cms.account_roles
                   WHERE account_id = v_current_account_id
                     AND role_id = p_role_id
                     AND (valid_until IS NULL OR valid_until > NOW()))
    INTO v_user_has_role;

    IF v_user_has_role THEN
        RETURN FALSE; -- Can't delete own role
    END IF;

    -- Get user's max rank
    v_user_max_rank := cms.get_user_max_role_rank(v_current_account_id);

    -- Simple comparison - user must have higher rank
    RETURN v_user_max_rank > v_role_rank;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permissions
grant
execute on FUNCTION cms.can_delete_role to authenticated;


-- SECTION: UPDATE ACCOUNT ROLES rank CHECK
-- In this section, we define the update account roles rank check function. This function is used to check if the user can update the rank of a role.
create or replace function cms.update_account_roles_rank_check () RETURNS trigger SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_user_max_rank  integer;
    v_current_account_id UUID;
BEGIN
    v_current_account_id := cms.get_current_user_account_id();
    IF v_current_account_id IS NULL THEN
        RAISE EXCEPTION 'No current user account found';
    END IF;

    -- Get the user's maximum role rank
    v_user_max_rank := cms.get_user_max_role_rank(v_current_account_id);

    -- Check if the new rank is higher than or equal to the user's maximum role rank
    IF NEW.rank >= v_user_max_rank THEN
        RAISE EXCEPTION 'Cannot modify a role with a rank higher than or equal to your maximum role rank (%). Your max rank: %, Role rank: %',
            v_user_max_rank, v_user_max_rank, NEW.rank;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add a trigger to check if the user can update the rank of a role
create trigger update_account_roles_rank_check before
update on cms.roles for each row
execute function cms.update_account_roles_rank_check ();

-- SECTION: GET AUTH USERS PERMISSIONS
-- In this section, we define the get auth users permissions function. This function is used to get the permissions for the Auth users in Supabase.
-- Add can_insert permission to the get_current_user_auth_users_permissions function
create or replace function cms.get_current_user_auth_users_permissions () returns jsonb language plpgsql
set
  search_path = '' as $$
declare
    v_can_read   boolean;
    v_can_update boolean;
    v_can_delete boolean;
    v_can_insert boolean;
begin
    select cms.has_admin_permission('auth_user'::cms.system_resource, 'select'::cms.system_action)
    into v_can_read;

    select cms.has_admin_permission('auth_user'::cms.system_resource, 'update'::cms.system_action)
    into v_can_update;

    select cms.has_admin_permission('auth_user'::cms.system_resource, 'delete'::cms.system_action)
    into v_can_delete;

    select cms.has_admin_permission('auth_user'::cms.system_resource, 'insert'::cms.system_action)
    into v_can_insert;

    return jsonb_build_object('can_read', v_can_read, 'can_update', v_can_update, 'can_delete', v_can_delete,
                              'can_insert', v_can_insert);
end;
$$;

grant
execute on function cms.get_current_user_auth_users_permissions to authenticated;