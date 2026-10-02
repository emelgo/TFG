/*
 * Endurecimiento de seguridad del CMS (PymeKit, F2.1).
 *
 * Correcciones derivadas de la revisión /rls-review sobre el código heredado
 * del CMS. El detalle y el porqué de cada una está comentado en los esquemas
 * declarativos correspondientes (schemas/23, 40, 46, 52 y 53) y en ADR-015.
 *
 *  1. WITH CHECK en las políticas UPDATE de role_permissions,
 *     account_permissions y permission_group_permissions (brecha de escalada).
 *  2. verify_admin_access: el MFA falla en cerrado si falta la opción.
 *  3. query_table / get_record_by_keys: exigen acceso de admin y bloquean
 *     esquemas protegidos (auth, vault, cms…).
 *  4. Paneles: can_access/can_edit/list exigen acceso de admin vigente.
 *  5. Unicidad de los marcadores del rol y grupo raíz.
 */

drop policy if exists update_role_permissions on cms.role_permissions;

create policy update_role_permissions on cms.role_permissions
for update
  to authenticated using (
    cms.can_action_role (role_id, 'update')
    and cms.has_admin_permission ('permission'::cms.system_resource, 'update')
  )
with
  check (
    cms.can_action_role (role_id, 'update')
    and cms.has_admin_permission ('permission'::cms.system_resource, 'update')
    and cms.can_grant_permission (permission_id)
  );

drop policy if exists update_account_permissions on cms.account_permissions;

create policy update_account_permissions on cms.account_permissions
for update
  to authenticated using (
    cms.has_admin_permission (
      'permission'::cms.system_resource,
      'update'::cms.system_action
    )
    and cms.get_user_max_role_rank (cms.get_current_user_account_id ()) > cms.get_user_max_role_rank (account_id)
  )
with
  check (
    cms.has_admin_permission (
      'permission'::cms.system_resource,
      'update'::cms.system_action
    )
    and cms.get_user_max_role_rank (cms.get_current_user_account_id ()) > cms.get_user_max_role_rank (account_id)
    and cms.can_grant_permission (permission_id)
  );

drop policy if exists update_permission_group_permissions on cms.permission_group_permissions;

create policy update_permission_group_permissions on cms.permission_group_permissions
for update
  to authenticated using (
    cms.can_modify_permission_group_permissions (group_id, 'update'::cms.system_action)
  )
with
  check (
    cms.can_modify_permission_group_permissions (group_id, 'update'::cms.system_action)
    and cms.can_grant_permission (permission_id)
  );

create or replace function cms.verify_admin_access () RETURNS boolean
set
  search_path = '' as $$
declare
    v_auth_user_id   uuid;
    has_admin_access boolean;
    requires_mfa     text;
    has_mfa          boolean;
begin
    -- Check if user has admin access flag in JWT
    select cms.account_has_admin_access() into has_admin_access;

    -- Early return if user doesn't have admin access
    if not coalesce(has_admin_access, false) then
        return false;
    end if;

    v_auth_user_id := (select auth.uid());

    -- The JWT claim survives deactivation (GoTrue re-mints app_metadata on every
    -- refresh), so the claim alone is not proof of access.
    if v_auth_user_id is null or not cms.auth_user_has_active_account(v_auth_user_id) then
        return false;
    end if;

    -- Get MFA requirement from configuration
    -- Se lee con cms.get_mfa_requirement() para no fallar en abierto (ver arriba).
    select lower(cms.get_mfa_requirement()) into requires_mfa;

    -- [TFG] ADR-014 · En PymeKit el MFA es obligatorio salvo que se desactive
    -- de forma explícita (requires_mfa = 'false'). Una opción ausente (NULL)
    -- o con un valor no válido se trata como «obligatorio»: si alguien borra
    -- la fila de configuración, el control falla en cerrado, no en abierto.
    if requires_mfa is null then
        requires_mfa := 'true';
    elsif requires_mfa not in ('true', 'false') then
        -- Log suspicious configuration value
        raise warning 'Invalid requires_mfa configuration value: %', requires_mfa;
        -- Default to requiring MFA for security
        requires_mfa := 'true';
    end if;

    -- Handle MFA check based on configuration
    if requires_mfa = 'true' then
        -- MFA is required, check if user has aal2 access
        select cms.is_aal2() into has_mfa;
    else
        -- MFA is not required or not configured, allow access
        has_mfa := true;
    end if;

    -- Return true only if user has admin access AND meets MFA requirements
    return coalesce(has_mfa, false);
end
$$ language plpgsql;

create or replace function cms.get_record_by_keys (p_schema text, p_table text, p_key_values jsonb) RETURNS jsonb SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_sql               text;
    v_result            jsonb;
    v_where_clauses     text[] := '{}';
    v_key               text;
    v_value             jsonb;
    v_column_info       RECORD;
    v_formatted_value   text;
    v_key_count         int    := 0;
    v_max_keys CONSTANT int    := 10; -- Security limit
BEGIN
    -- Security: Validate schema and table names
    p_schema := cms.sanitize_identifier(p_schema);
    p_table := cms.sanitize_identifier(p_table);

    -- Security: Verify JWT claim
    IF NOT cms.verify_admin_access() THEN
        RAISE EXCEPTION 'Invalid admin access'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- [TFG] RNF-02 · Corrección de PymeKit: igual que insert/update/delete,
    -- la lectura tampoco puede alcanzar esquemas protegidos (auth, vault, cms…),
    -- aunque el permiso de datos sea comodín (`*.*`, como el de Root). Sin esto,
    -- el CMS podía devolver `auth.users` con los hashes de contraseña.
    IF NOT cms.validate_schema_access(p_schema) THEN
        RAISE EXCEPTION 'Access to schema % is not allowed', p_schema
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Security: Check permissions
    IF NOT cms.has_data_permission('select'::cms.system_action, p_schema, p_table) THEN
        RAISE EXCEPTION 'Permission denied for reading table %.%', p_schema, p_table
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Input validation
    IF p_key_values IS NULL OR jsonb_typeof(p_key_values) != 'object' THEN
        RAISE EXCEPTION 'Key values must be a valid JSON object'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Check for empty keys
    IF NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_key_values)) THEN
        RAISE EXCEPTION 'At least one key-value pair is required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Security: Count keys to prevent overly complex queries
    SELECT COUNT(*) INTO v_key_count FROM jsonb_object_keys(p_key_values);

    IF v_key_count > v_max_keys THEN
        RAISE EXCEPTION 'Too many key conditions: %. Maximum allowed: %',
            v_key_count, v_max_keys
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Build WHERE clause for each key-value pair with type safety
    FOR v_key, v_value IN
        SELECT key, value FROM jsonb_each(p_key_values)
        LOOP
            -- Security: Validate key name
            IF v_key IS NULL OR length(v_key) = 0 OR length(v_key) > 63 THEN
                RAISE EXCEPTION 'Invalid key name: %', COALESCE(v_key, 'NULL')
                    USING ERRCODE = 'invalid_parameter_value';
            END IF;

            v_key := cms.sanitize_identifier(v_key);

            -- Security: Verify column exists
            IF NOT cms.validate_column_name(p_schema, p_table, v_key) THEN
                RAISE EXCEPTION 'Column does not exist in table %.%: %', p_schema, p_table, v_key
                    USING ERRCODE = 'undefined_column';
            END IF;

            -- Get column metadata for type-safe formatting
            SELECT data_type,
                   udt_name,
                   udt_schema,
                   is_nullable
            INTO v_column_info
            FROM information_schema.columns
            WHERE table_schema = p_schema
              AND table_name = p_table
              AND column_name = v_key;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Column metadata not found for: %.%.%', p_schema, p_table, v_key
                    USING ERRCODE = 'undefined_column';
            END IF;

            -- Handle NULL values appropriately
            IF v_value IS NULL OR jsonb_typeof(v_value) = 'null' THEN
                v_where_clauses := array_append(
                        v_where_clauses,
                        format('%I IS NULL', v_key)
                                   );
            ELSE
                -- Type-safe value formatting
                BEGIN
                    v_formatted_value := cms.format_typed_value(
                            v_value,
                            v_column_info.data_type,
                            v_column_info.udt_name,
                            v_column_info.udt_schema
                                         );

                    v_where_clauses := array_append(
                            v_where_clauses,
                            format('%I = %s', v_key, v_formatted_value)
                                       );

                EXCEPTION
                    WHEN OTHERS THEN
                        RAISE EXCEPTION 'Failed to format key "%" with value "%" for type %: %',
                            v_key,
                            COALESCE(v_value::text, 'NULL'),
                            v_column_info.data_type,
                            SQLERRM
                            USING ERRCODE = SQLSTATE;
                END;
            END IF;
        END LOOP;

    -- Build and execute query with WHERE clauses
    v_sql := format(
            'SELECT to_jsonb(%I.*) FROM %I.%I WHERE %s LIMIT 1',
            p_table,
            p_schema,
            p_table,
            array_to_string(v_where_clauses, ' AND ')
             );

    BEGIN
        EXECUTE v_sql INTO v_result;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Query execution failed for table %.%: %', p_schema, p_table, SQLERRM
                USING ERRCODE = SQLSTATE,
                    HINT = 'Check table structure and key values';
    END;

    -- Return result or raise not found error
    IF v_result IS NULL THEN
        RAISE EXCEPTION 'Record not found in %.% with conditions: %',
            p_schema, p_table, p_key_values::text
            USING ERRCODE = 'no_data_found';
    END IF;

    RETURN v_result;

EXCEPTION
    WHEN OTHERS THEN
        -- Enhanced error logging
        RAISE LOG 'get_record_by_keys failed - Schema: %, Table: %, Keys: %, Error: %',
            p_schema, p_table, p_key_values::text, SQLERRM;

        -- Re-raise with preserved context
        RAISE;
END;
$$ LANGUAGE plpgsql;

create or replace function cms.query_table (
  p_schema text,
  p_table text,
  p_filters jsonb default '[]',
  p_sort jsonb default '{}',
  p_pagination jsonb default '{"limit": 25, "offset": 0}'
) RETURNS table (records jsonb, total_count bigint) SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_sql        text;
    v_where      text;
    v_sort       text;
    v_limit      int;
    v_offset     int;
    v_start_time TIMESTAMPTZ := clock_timestamp();
    v_query_time INTERVAL;
BEGIN
    -- Validate schema and table names
    p_schema := cms.sanitize_identifier(p_schema);
    p_table := cms.sanitize_identifier(p_table);

    -- [TFG] RNF-02 · Corrección de PymeKit: esta función salta RLS
    -- (security definer + row_security off), así que antes de nada exige
    -- acceso de administración válido (claim, cuenta activa y MFA) y bloquea
    -- los esquemas protegidos (auth, vault, cms…), como ya hacen las funciones
    -- de escritura.
    IF NOT cms.verify_admin_access() THEN
        RAISE EXCEPTION 'Invalid admin access'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT cms.validate_schema_access(p_schema) THEN
        RAISE EXCEPTION 'Access to schema % is not allowed', p_schema
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Permission check
    IF NOT cms.has_data_permission('select'::cms.system_action, p_schema, p_table) THEN
        RAISE EXCEPTION 'The user does not have permission to read this table'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_where := cms.build_where_clause(p_schema, p_table, p_filters);
    v_sort := cms.build_sort_clause(p_schema, p_table, p_sort);

    -- Safely extract pagination parameters
    v_limit := COALESCE((p_pagination ->> 'limit')::int, 25);
    v_offset := COALESCE((p_pagination ->> 'offset')::int, 0);

    IF v_limit < 1 THEN
        v_limit := 1;
    ELSIF v_limit > 50 THEN
        RAISE EXCEPTION 'Limit too large (max 1000, requested %)', v_limit
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF v_offset < 0 THEN
        v_offset := 0;
    ELSIF v_offset > 1000000 THEN
        RAISE EXCEPTION 'Offset too large (max 1,000,000, requested %)', v_offset
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- 🔧 FIXED: Use CTE to properly separate total count from paginated results
    v_sql := format(
            'WITH total_count_query AS (
                SELECT COUNT(*) as total_records
                FROM %I.%I t
                WHERE %s
            ),
            paginated_query AS (
                SELECT to_jsonb(t.*) as record_data
                FROM %I.%I t
                WHERE %s %s
                LIMIT %s OFFSET %s
            )
            SELECT
                COALESCE(jsonb_agg(record_data), ''[]''::jsonb) AS records,
                (SELECT total_records FROM total_count_query) AS total_count
            FROM paginated_query',
            p_schema, p_table,
            COALESCE(v_where, 'TRUE'),
            p_schema, p_table,
            COALESCE(v_where, 'TRUE'),
            COALESCE(v_sort, ''),
            v_limit,
            v_offset
             );

    RETURN QUERY EXECUTE v_sql;

    -- Performance monitoring
    v_query_time := clock_timestamp() - v_start_time;
    IF EXTRACT(MILLISECONDS FROM v_query_time) > 5000 THEN
        RAISE WARNING 'Slow query detected: %.3f ms for %.%',
            EXTRACT(MILLISECONDS FROM v_query_time), p_schema, p_table;
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Query execution failed for %.%: % (SQLSTATE: %)',
            p_schema, p_table, SQLERRM, SQLSTATE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cms.can_access_dashboard(p_dashboard_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_user_id UUID;
BEGIN
  -- [TFG] RNF-02 · Corrección de PymeKit: sin acceso de administración
  -- vigente (claim, cuenta activa y MFA) no se accede a ningún panel, aunque
  -- siga existiendo la cuenta o una compartición antigua.
  IF NOT cms.verify_admin_access() THEN
    RETURN false;
  END IF;

  v_current_user_id := cms.get_current_user_account_id();
  
  RETURN EXISTS (
    SELECT 1 FROM cms.dashboards d
    WHERE d.id = p_dashboard_id
    AND (
      d.created_by = v_current_user_id
      OR EXISTS (
        SELECT 1 FROM cms.dashboard_role_shares drs
        JOIN cms.account_roles ar ON ar.role_id = drs.role_id
        WHERE drs.dashboard_id = d.id
        AND ar.account_id = v_current_user_id
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION cms.can_edit_dashboard(p_dashboard_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_user_id UUID;
BEGIN
  -- [TFG] RNF-02 · Corrección de PymeKit: sin acceso de administración
  -- vigente (claim, cuenta activa y MFA) no se accede a ningún panel, aunque
  -- siga existiendo la cuenta o una compartición antigua.
  IF NOT cms.verify_admin_access() THEN
    RETURN false;
  END IF;

  v_current_user_id := cms.get_current_user_account_id();
  
  RETURN EXISTS (
    SELECT 1 FROM cms.dashboards d
    WHERE d.id = p_dashboard_id
    AND (
      d.created_by = v_current_user_id
      OR EXISTS (
        SELECT 1 FROM cms.dashboard_role_shares drs
        JOIN cms.account_roles ar ON ar.role_id = drs.role_id
        WHERE drs.dashboard_id = d.id
        AND ar.account_id = v_current_user_id
        AND drs.permission_level = ANY(ARRAY['edit', 'owner']::cms.dashboard_permission_level[])
      )
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION cms.list_dashboards(
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20,
  p_search TEXT DEFAULT NULL,
  p_filter VARCHAR(20) DEFAULT 'all'
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_user_id UUID;
  v_offset INTEGER;
  v_dashboards JSONB;
  v_total INTEGER;
BEGIN
  -- [TFG] RNF-02 · Corrección de PymeKit: listar paneles exige acceso de
  -- administración vigente (claim, cuenta activa y MFA).
  IF NOT cms.verify_admin_access() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_current_user_id := cms.get_current_user_account_id();
  
  -- Validate inputs
  p_page := GREATEST(1, p_page);
  p_page_size := LEAST(GREATEST(1, p_page_size), 100);
  v_offset := (p_page - 1) * p_page_size;
  
  WITH accessible AS (
    SELECT DISTINCT
      d.*,
      d.created_by = v_current_user_id AS is_owner,
      CASE 
        WHEN d.created_by = v_current_user_id THEN 'owner'
        ELSE drs.permission_level
      END AS permission_level,
      COUNT(DISTINCT dw.id) AS widget_count
    FROM cms.dashboards d
    LEFT JOIN cms.dashboard_role_shares drs ON 
      drs.dashboard_id = d.id 
      AND EXISTS (
        SELECT 1 FROM cms.account_roles ar 
        WHERE ar.role_id = drs.role_id 
        AND ar.account_id = v_current_user_id
      )
    LEFT JOIN cms.dashboard_widgets dw ON dw.dashboard_id = d.id
    WHERE 
      d.created_by = v_current_user_id OR drs.dashboard_id IS NOT NULL
    GROUP BY d.id, drs.permission_level
  ),
  filtered AS (
    SELECT * FROM accessible
    WHERE 
      (p_search IS NULL OR name ILIKE '%' || cms.sanitize_identifier(p_search) || '%')
      AND (
        p_filter = 'all' OR
        (p_filter = 'owned' AND is_owner) OR
        (p_filter = 'shared' AND NOT is_owner)
      )
  )
  SELECT 
    jsonb_build_object(
      'dashboards', jsonb_agg(row_to_json(f) ORDER BY f.updated_at DESC),
      'pagination', jsonb_build_object(
        'page', p_page,
        'page_size', p_page_size,
        'total', COUNT(*) OVER()
      )
    ) INTO v_dashboards
  FROM (
    SELECT * FROM filtered
    LIMIT p_page_size OFFSET v_offset
  ) f;
  
  RETURN COALESCE(v_dashboards, jsonb_build_object(
    'dashboards', '[]'::jsonb,
    'pagination', jsonb_build_object('page', 1, 'page_size', p_page_size, 'total', 0)
  ));
END;
$$ LANGUAGE plpgsql;

create unique index if not exists cms_roles_system_role_unique
  on cms.roles ((metadata ->> 'system_role'))
  where metadata ? 'system_role';

create unique index if not exists cms_permission_groups_system_group_unique
  on cms.permission_groups ((metadata ->> 'system_group'))
  where metadata ? 'system_group';
