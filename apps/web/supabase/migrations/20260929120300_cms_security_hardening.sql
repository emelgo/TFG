-- HAS_UNTRACKABLE_DEPENDENCIES: Dependencies, i.e. other functions used in the function body, of non-sql functions cannot be tracked. As a result, we cannot guarantee that function dependencies are ordered properly relative to this statement. For adds, this means you need to ensure that all functions this function depends on are created/altered before this statement.
CREATE OR REPLACE FUNCTION cms._update_record_impl(p_schema text, p_table text, p_where_clauses text[], p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
DECLARE
    v_sql                  text;
    v_result               jsonb;
    v_old_data             jsonb;
    v_sets                 text[] := '{}';
    v_column               text;
    v_value                jsonb;
    v_column_info          RECORD;
    v_audit_log_id         uuid;
    v_columns_config       jsonb;
    v_is_editable          boolean;
    v_non_editable_columns text[] := '{}';
BEGIN
    IF NOT cms.verify_admin_access() THEN
        RAISE EXCEPTION 'Invalid admin access';
    END IF;

    -- Validate schema and table names
    p_schema := cms.sanitize_identifier(p_schema);
    p_table := cms.sanitize_identifier(p_table);

    -- Check if schema is protected
    IF NOT cms.validate_schema_access(p_schema) THEN
        RAISE EXCEPTION 'Write operations are not allowed on protected schema: %. This schema is managed by Supabase and is critical to the functionality of your project.', p_schema
            USING ERRCODE = 'insufficient_privilege',
                HINT = 'You can only perform write operations on user-defined schemas';
    END IF;

    -- Permission check
    IF NOT cms.has_data_permission('update'::cms.system_action, p_schema, p_table) THEN
        RAISE EXCEPTION 'Permission denied';
    END IF;

    -- First fetch AND LOCK the current data for audit logging
    EXECUTE format(
            'SELECT to_jsonb(%I.*) FROM %I.%I WHERE %s FOR UPDATE', -- Added FOR UPDATE
            p_table, p_schema, p_table, array_to_string(p_where_clauses, ' AND ')
            ) INTO v_old_data;

    IF v_old_data IS NULL THEN
        RAISE EXCEPTION 'No record found matching the specified conditions in %.%', p_schema, p_table;
    END IF;

    -- Get columns configuration to check editability
    SELECT columns_config
    INTO v_columns_config
    FROM cms.table_metadata
    WHERE schema_name = p_schema
      AND table_name = p_table;

    -- Build SET clauses for update
    FOR v_column, v_value IN
        SELECT key, value FROM jsonb_each(p_data)
        LOOP
            -- Validate column name
            IF NOT cms.validate_column_name(p_schema, p_table, v_column) THEN
                RAISE EXCEPTION 'Invalid column: %', v_column;
            END IF;

            -- Security: a column is writable ONLY when table metadata explicitly
            -- marks it editable (fail closed). Without an explicit is_editable
            -- entry the column is treated as read-only, preventing mass-assignment
            -- of primary keys, ownership, audit or privilege columns on unsynced
            -- tables or columns added after the last sync.
            v_is_editable := false;

            IF v_columns_config IS NOT NULL AND v_columns_config ? v_column THEN
                v_is_editable := coalesce((v_columns_config -> v_column ->> 'is_editable')::boolean, false);
            END IF;

            -- Skip non-editable columns
            IF NOT v_is_editable THEN
                v_non_editable_columns := array_append(v_non_editable_columns, v_column);
                CONTINUE;
            END IF;

            -- Get column metadata for type-safe formatting
            SELECT data_type,
                   udt_name,
                   udt_schema
            INTO v_column_info
            FROM information_schema.columns
            WHERE table_schema = p_schema
              AND table_name = p_table
              AND column_name = v_column;

            -- Handle NULL values
            IF v_value IS NULL OR jsonb_typeof(v_value) = 'null' THEN
                v_sets := array_append(v_sets, quote_ident(v_column) || ' = NULL');
            ELSE
                -- Use the enhanced format_typed_value function for type safety
                BEGIN
                    DECLARE
                        v_formatted_value text;
                    BEGIN
                        v_formatted_value := cms.format_typed_value(
                                v_value,
                                v_column_info.data_type,
                                v_column_info.udt_name,
                                v_column_info.udt_schema
                                             );

                        v_sets := array_append(
                                v_sets,
                                format('%I = %s', v_column, v_formatted_value)
                                  );
                    END;

                EXCEPTION
                    WHEN OTHERS THEN
                        RAISE EXCEPTION 'Failed to format value for column "%" of type %: %',
                            v_column, v_column_info.data_type, SQLERRM
                            USING ERRCODE = SQLSTATE,
                                HINT = format('Provided value: %s', COALESCE(v_value::text, 'NULL'));
                END;
            END IF;
        END LOOP;

    -- Warn if non-editable columns were skipped
    IF cardinality(v_non_editable_columns) > 0 THEN
        RAISE WARNING 'Skipped non-editable columns: %', array_to_string(v_non_editable_columns, ', ');
    END IF;

    -- If no editable columns were found, return the original data
    IF cardinality(v_sets) = 0 THEN
        RETURN cms.build_crud_response(
                true, -- Or false, depending on if this is considered a "successful no-op"
                'update'::cms.system_action,
                v_old_data,
                'No editable columns provided or all values matched existing data.', -- Optional message
                NULL
               );
    END IF;

    -- Build and execute query safely
    v_sql := format(
            'UPDATE %I.%I SET %s WHERE %s RETURNING to_jsonb(%I.*)',
            p_schema,
            p_table,
            array_to_string(v_sets, ', '),
            array_to_string(p_where_clauses, ' AND '),
            p_table
             );

    BEGIN
        EXECUTE v_sql INTO v_result;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Error updating record: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    END;

    -- Add audit log entry
    BEGIN
        v_audit_log_id := cms.create_audit_log(
                'UPDATE',
                p_schema,
                p_table,
                v_result ->> 'id',
                v_old_data,
                v_result
                          );
    EXCEPTION
        WHEN OTHERS THEN
            -- Don't fail the operation if audit logging fails
            RAISE WARNING 'Failed to log update operation: %', SQLERRM;
    END;

    RETURN cms.build_crud_response(
            true,
            'update'::cms.system_action,
            v_result,
            NULL,
            NULL
           );
EXCEPTION
    WHEN OTHERS THEN
        RETURN cms.build_crud_response(
                false,
                'update'::cms.system_action,
                NULL,
                SQLERRM,
                jsonb_build_object('sqlstate', SQLSTATE)
               );
END;
$function$
;

-- HAS_UNTRACKABLE_DEPENDENCIES: Dependencies, i.e. other functions used in the function body, of non-sql functions cannot be tracked. As a result, we cannot guarantee that function dependencies are ordered properly relative to this statement. For adds, this means you need to ensure that all functions this function depends on are created/altered before this statement.
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

    -- A user may grant a permission only if they themselves possess the capability
    -- it confers. We use the resource/action capability checks (NOT a per-id
    -- has_permission lookup) so that explicit-deny precedence is honored: a user
    -- who is denied a capability cannot re-delegate it to a sockpuppet to bypass
    -- the deny. A user can therefore never grant a broader capability than they
    -- currently effectively hold.
    IF v_permission.permission_type = 'system' THEN
        RETURN cms.has_admin_permission(v_permission.system_resource, v_permission.action);
    ELSIF v_permission.permission_type = 'data' AND v_permission.scope IN ('table', 'column') THEN
        RETURN cms.has_data_permission(v_permission.action, v_permission.schema_name, v_permission.table_name);
    END IF;

    -- Storage / other scopes have no resource/action capability check, so fall
    -- back to exact-holder re-delegation (the user must already hold this permission).
    RETURN cms.has_permission(v_account_id, p_permission_id);
END;
$function$
;

-- HAS_UNTRACKABLE_DEPENDENCIES: Dependencies, i.e. other functions used in the function body, of non-sql functions cannot be tracked. As a result, we cannot guarantee that function dependencies are ordered properly relative to this statement. For adds, this means you need to ensure that all functions this function depends on are created/altered before this statement.
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
    v_is_self_modification BOOLEAN;
BEGIN
    -- Input validation
    IF p_account_id IS NULL OR p_target_account_id IS NULL OR p_role_id IS NULL OR p_action IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check if user has admin access (JWT validation)
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    -- First check: Does user have admin permission to modify roles at all?
    IF NOT cms.has_admin_permission('role'::cms.system_resource, p_action) THEN
        RETURN FALSE;
    END IF;

    -- Determine if this is self-modification
    v_is_self_modification := (p_account_id = p_target_account_id);

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

    -- RULE 2: Self-modification restrictions
    IF v_is_self_modification THEN
        CASE p_action
            WHEN 'delete' THEN -- Users cannot remove their own highest rank role (prevents lockout)
            IF v_role_rank = v_user_max_rank THEN
                RETURN FALSE;
            END IF;

            WHEN 'insert', 'update' THEN -- Users cannot assign themselves equal/higher roles (prevents escalation)
            IF v_role_rank >= v_user_max_rank THEN
                RETURN FALSE;
            END IF;

            ELSE -- Other actions allowed if user has higher rank
            NULL;
            END CASE;

        RETURN TRUE; -- Self-modification allowed for lower rank roles
    END IF;

    RETURN v_user_max_rank > v_target_max_rank;
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in can_modify_account_role: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
        RETURN FALSE;
END;
$function$
;

-- HAS_UNTRACKABLE_DEPENDENCIES: Dependencies, i.e. other functions used in the function body, of non-sql functions cannot be tracked. As a result, we cannot guarantee that function dependencies are ordered properly relative to this statement. For adds, this means you need to ensure that all functions this function depends on are created/altered before this statement.
CREATE OR REPLACE FUNCTION cms.has_admin_permission(p_resource cms.system_resource, p_action cms.system_action)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
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
$function$
;

-- HAS_UNTRACKABLE_DEPENDENCIES: Dependencies, i.e. other functions used in the function body, of non-sql functions cannot be tracked. As a result, we cannot guarantee that function dependencies are ordered properly relative to this statement. For adds, this means you need to ensure that all functions this function depends on are created/altered before this statement.
CREATE OR REPLACE FUNCTION cms.has_data_permission(p_action cms.system_action, p_schema_name character varying, p_table_name character varying DEFAULT NULL::character varying)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
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
$function$
;

-- HAS_UNTRACKABLE_DEPENDENCIES: Dependencies, i.e. other functions used in the function body, of non-sql functions cannot be tracked. As a result, we cannot guarantee that function dependencies are ordered properly relative to this statement. For adds, this means you need to ensure that all functions this function depends on are created/altered before this statement.
CREATE OR REPLACE FUNCTION cms.insert_record(p_schema text, p_table text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
DECLARE
    v_sql                  text;
    v_result               jsonb;
    v_columns              text[] := '{}';
    v_values               text[] := '{}';
    v_column               text;
    v_value                jsonb;
    v_column_info          RECORD;
    v_audit_log_id         uuid;
    v_columns_config       jsonb;
    v_is_editable          boolean;
    v_non_editable_columns text[] := '{}';
    v_formatted_value      text;
    v_column_count         int    := 0;
    v_max_columns CONSTANT int    := 100; -- Security limit
BEGIN
    -- Security: Validate schema and table names
    p_schema := cms.sanitize_identifier(p_schema);
    p_table := cms.sanitize_identifier(p_table);

    -- Security: Check if schema is protected from write operations
    IF NOT cms.validate_schema_access(p_schema) THEN
        RAISE EXCEPTION 'Write operations are not allowed on protected schema: %. This schema is managed by Supabase and is critical to the functionality of your project.', p_schema
            USING ERRCODE = 'insufficient_privilege',
                HINT = 'You can only perform write operations on user-defined schemas';
    END IF;

    -- Security: Verify JWT claim
    IF NOT cms.verify_admin_access() THEN
        RAISE EXCEPTION 'Invalid admin access'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Security: Permission check
    IF NOT cms.has_data_permission('insert'::cms.system_action, p_schema, p_table) THEN
        RAISE EXCEPTION 'Permission denied for insert operation on %.%', p_schema, p_table
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Input validation
    IF p_data IS NULL OR jsonb_typeof(p_data) != 'object' THEN
        RAISE EXCEPTION 'Data must be a valid JSON object'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Check for empty data
    IF NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_data)) THEN
        RAISE EXCEPTION 'At least one column-value pair is required for insertion'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Security: Count columns
    SELECT COUNT(*) INTO v_column_count FROM jsonb_object_keys(p_data);

    IF v_column_count > v_max_columns THEN
        RAISE EXCEPTION 'Too many columns provided: %. Maximum allowed: %',
            v_column_count, v_max_columns
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Get columns configuration to check editability
    SELECT columns_config
    INTO v_columns_config
    FROM cms.table_metadata
    WHERE schema_name = p_schema
      AND table_name = p_table;

    -- Process each column with type safety and editability checks
    FOR v_column, v_value IN
        SELECT key, value FROM jsonb_each(p_data)
        LOOP
            -- Security: Validate column name
            IF v_column IS NULL OR length(v_column) = 0 OR length(v_column) > 63 THEN
                RAISE EXCEPTION 'Invalid column name: %', COALESCE(v_column, 'NULL')
                    USING ERRCODE = 'invalid_parameter_value';
            END IF;

            -- Security: Verify column exists
            IF NOT cms.validate_column_name(p_schema, p_table, v_column) THEN
                RAISE EXCEPTION 'Column does not exist in table %.%: %', p_schema, p_table, v_column
                    USING ERRCODE = 'undefined_column';
            END IF;

            -- Security: a column is writable ONLY when table metadata explicitly
            -- marks it editable (fail closed). Columns on unsynced tables, or
            -- columns added after the last sync, have no metadata entry and must
            -- NOT be writable -- otherwise a client could mass-assign primary
            -- keys, ownership, audit or privilege columns it was never granted.
            v_is_editable := false;
            IF v_columns_config IS NOT NULL AND v_columns_config ? v_column THEN
                v_is_editable := COALESCE((v_columns_config -> v_column ->> 'is_editable')::boolean, false);
            END IF;

            IF NOT v_is_editable THEN
                v_non_editable_columns := array_append(v_non_editable_columns, v_column);
                CONTINUE;
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
              AND column_name = v_column;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Column metadata not found for: %.%.%', p_schema, p_table, v_column
                    USING ERRCODE = 'undefined_column';
            END IF;

            -- Add column name to arrays
            v_columns := array_append(v_columns, quote_ident(v_column));

            -- Type-safe value formatting using our robust function
            BEGIN
                v_formatted_value := cms.format_typed_value(
                        v_value,
                        v_column_info.data_type,
                        v_column_info.udt_name,
                        v_column_info.udt_schema
                                     );

                v_values := array_append(v_values, v_formatted_value);

            EXCEPTION
                WHEN OTHERS THEN
                    RAISE EXCEPTION 'Failed to format value for column "%" of type %: %',
                        v_column, v_column_info.data_type, SQLERRM
                        USING ERRCODE = SQLSTATE,
                            HINT = format('Provided value: %s', COALESCE(v_value::text, 'NULL'));
            END;
        END LOOP;

    -- Warn if non-editable columns were skipped
    IF cardinality(v_non_editable_columns) > 0 THEN
        RAISE WARNING 'Skipped non-editable columns: %', array_to_string(v_non_editable_columns, ', ');
    END IF;

    -- If no editable columns were found, raise an exception
    IF cardinality(v_columns) = 0 THEN
        RAISE EXCEPTION 'No editable columns were provided for insertion'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Build and execute query safely
    v_sql := format(
            'INSERT INTO %I.%I (%s) VALUES (%s) RETURNING to_jsonb(%I.*)',
            p_schema,
            p_table,
            array_to_string(v_columns, ', '),
            array_to_string(v_values, ', '),
            p_table
             );

    BEGIN
        EXECUTE v_sql INTO v_result;
    EXCEPTION
        WHEN OTHERS THEN
            -- Enhanced error handling with context
            IF SQLSTATE = '23505' THEN
                RAISE EXCEPTION 'Unique constraint violation: A record with these values already exists in %.%',
                    p_schema, p_table
                    USING ERRCODE = 'unique_violation';
            ELSIF SQLSTATE = '23503' THEN
                RAISE EXCEPTION 'Foreign key constraint violation: Referenced record does not exist in %.%',
                    p_schema, p_table
                    USING ERRCODE = 'foreign_key_violation';
            ELSIF SQLSTATE = '23502' THEN
                RAISE EXCEPTION 'Not null constraint violation: Required field is missing in %.%',
                    p_schema, p_table
                    USING ERRCODE = 'not_nullviolation';
            ELSE
                RAISE EXCEPTION 'Insert failed for table %.%: % (SQLSTATE: %)',
                    p_schema, p_table, SQLERRM, SQLSTATE
                    USING ERRCODE = SQLSTATE;
            END IF;
    END;

    -- Create audit log entry
    BEGIN
        v_audit_log_id := cms.create_audit_log(
                'INSERT',
                p_schema,
                p_table,
                v_result ->> 'id',
                NULL,
                v_result
                          );
    EXCEPTION
        WHEN OTHERS THEN
            -- Don't fail the operation if audit logging fails
            RAISE WARNING 'Failed to log insert operation: %', SQLERRM;
    END;

    RETURN cms.build_crud_response(
            true,
            'insert'::cms.system_action,
            v_result,
            NULL,
            jsonb_build_object('audit_log_id', v_audit_log_id)
           );

EXCEPTION
    WHEN OTHERS THEN
        -- Enhanced error logging
        RAISE LOG 'insert_record failed - Schema: %, Table: %, Data: %, Error: %',
            p_schema, p_table, p_data::text, SQLERRM;

        RETURN cms.build_crud_response(
                false,
                'insert'::cms.system_action,
                NULL,
                SQLERRM,
                jsonb_build_object(
                        'sqlstate', SQLSTATE,
                        'schema', p_schema,
                        'table', p_table
                )
               );
END;
$function$
;

-- HAS_UNTRACKABLE_DEPENDENCIES: Dependencies, i.e. other functions used in the function body, of non-sql functions cannot be tracked. As a result, we cannot guarantee that function dependencies are ordered properly relative to this statement. For adds, this means you need to ensure that all functions this function depends on are created/altered before this statement.
CREATE OR REPLACE FUNCTION cms.update_record_by_conditions(p_schema text, p_table text, p_where_conditions jsonb, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
DECLARE
    v_where_clauses           text[] := '{}';
    v_column                  text;
    v_value                   jsonb;
    v_column_info             RECORD;
    v_formatted_value         text;
    v_condition_count         int    := 0;
    v_max_conditions CONSTANT int    := 10; -- Prevent overly complex conditions
    v_record_count            int;
    v_max_records_affected CONSTANT int := 25; -- Safety limit for bulk updates
BEGIN
    -- Security and admin access check
    IF NOT cms.verify_admin_access() THEN
        RAISE EXCEPTION 'Invalid admin access'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Validate schema and table names
    p_schema := cms.sanitize_identifier(p_schema);
    p_table := cms.sanitize_identifier(p_table);

    -- Check if schema is protected
    IF NOT cms.validate_schema_access(p_schema) THEN
        RAISE EXCEPTION 'Write operations are not allowed on protected schema: %. This schema is managed by Supabase and is critical to the functionality of your project.', p_schema
            USING ERRCODE = 'insufficient_privilege',
                HINT = 'You can only perform write operations on user-defined schemas';
    END IF;

    -- Security: authorize BEFORE validating columns/values. The delegate
    -- (_update_record_impl) also checks this, but doing it here first prevents a
    -- caller without UPDATE permission from using the column-validation errors
    -- below as a pre-authorization column/type enumeration oracle.
    IF NOT cms.has_data_permission('update'::cms.system_action, p_schema, p_table) THEN
        RAISE EXCEPTION 'You do not have permission to update records in this table'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Validate where conditions
    IF p_where_conditions IS NULL OR jsonb_typeof(p_where_conditions) != 'object' THEN
        RAISE EXCEPTION 'Where conditions must be a valid JSON object'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Check for empty conditions
    IF NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_where_conditions)) THEN
        RAISE EXCEPTION 'Where conditions cannot be empty. At least one condition is required for safety'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Count conditions for complexity check
    SELECT COUNT(*) INTO v_condition_count FROM jsonb_object_keys(p_where_conditions);

    IF v_condition_count > v_max_conditions THEN
        RAISE EXCEPTION 'Too many where conditions: %. Maximum allowed: %',
            v_condition_count, v_max_conditions
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Build WHERE clause from conditions with proper type formatting
    FOR v_column, v_value IN
        SELECT key, value FROM jsonb_each(p_where_conditions)
        LOOP
            -- Validate column name
            IF NOT cms.validate_column_name(p_schema, p_table, v_column) THEN
                RAISE EXCEPTION 'Invalid column in where condition: %. Column does not exist in table %.%',
                    v_column, p_schema, p_table
                    USING ERRCODE = 'undefined_column';
            END IF;

            -- Get column information including data type
            SELECT data_type,
                   udt_name,
                   udt_schema,
                   is_nullable,
                   column_name
            INTO v_column_info
            FROM information_schema.columns
            WHERE table_schema = p_schema
              AND table_name = p_table
              AND column_name = v_column;

            -- This should not happen due to validate_column_name check above, but safety first
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Column metadata not found for: %.%.%', p_schema, p_table, v_column
                    USING ERRCODE = 'undefined_column';
            END IF;

            -- Handle NULL values in WHERE clause
            IF v_value IS NULL OR jsonb_typeof(v_value) = 'null' THEN
                v_where_clauses := array_append(
                        v_where_clauses,
                        format('%I IS NULL', v_column)
                                   );
            ELSE
                -- Format value according to its data type
                BEGIN
                    v_formatted_value := cms.format_typed_value(
                            v_value,
                            v_column_info.data_type,
                            v_column_info.udt_name,
                            v_column_info.udt_schema
                                         );

                    v_where_clauses := array_append(
                            v_where_clauses,
                            format('%I = %s', v_column, v_formatted_value)
                                       );

                EXCEPTION
                    WHEN OTHERS THEN
                        -- Provide detailed error context
                        RAISE EXCEPTION 'Failed to format where condition for column "%" with value "%": %',
                            v_column,
                            COALESCE(v_value::text, 'NULL'),
                            SQLERRM
                            USING ERRCODE = SQLSTATE,
                                HINT = format('Column type is: %s', v_column_info.data_type);
                END;
            END IF;
        END LOOP;

    -- SAFETY CHECK: count rows that would be affected before updating, mirroring
    -- delete_record_by_conditions. Prevents an unbounded bulk update from a
    -- single non-unique condition (which would also under-report in the audit
    -- log, where only the first row id is recorded).
    EXECUTE format(
            'SELECT COUNT(*) FROM %I.%I WHERE %s',
            p_schema, p_table, array_to_string(v_where_clauses, ' AND ')
            ) INTO v_record_count;

    IF v_record_count > v_max_records_affected THEN
        RAISE EXCEPTION 'Update operation would affect % records, which exceeds the safety limit of %. This appears to be a bulk update that should be reviewed',
            v_record_count, v_max_records_affected
            USING ERRCODE = 'invalid_parameter_value',
                HINT = 'If this bulk update is intentional, contact your administrator to increase the safety limit';
    END IF;

    -- Delegate to the existing implementation
    RETURN cms._update_record_impl(
            p_schema,
            p_table,
            v_where_clauses,
            p_data
           );

EXCEPTION
    WHEN OTHERS THEN
        -- Enhanced error logging with context
        RAISE LOG 'update_record_by_conditions failed - Schema: %, Table: %, Conditions: %, Data: %, Error: %',
            p_schema, p_table, p_where_conditions::text, p_data::text, SQLERRM;

        -- Return structured error response
        RETURN cms.build_crud_response(
                false,
                'update'::cms.system_action,
                NULL,
                format('Update failed: %s', SQLERRM),
                jsonb_build_object(
                        'sqlstate', SQLSTATE,
                        'schema', p_schema,
                        'table', p_table,
                        'error_detail', SQLERRM
                )
               );
END;
$function$
;

-- HAS_UNTRACKABLE_DEPENDENCIES: Dependencies, i.e. other functions used in the function body, of non-sql functions cannot be tracked. As a result, we cannot guarantee that function dependencies are ordered properly relative to this statement. For adds, this means you need to ensure that all functions this function depends on are created/altered before this statement.
CREATE OR REPLACE FUNCTION cms.verify_admin_access()
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
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

    -- Get MFA requirement from configuration
    select lower(cms.get_configuration_value('requires_mfa')) into requires_mfa;

    -- Validate requires_mfa value to ensure it's either 'true' or 'false'.
    -- A missing (NULL) configuration means MFA is optional (the product default);
    -- only an explicit invalid value conservatively defaults to requiring MFA.
    if requires_mfa is not null and requires_mfa not in ('true', 'false') then
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
    return coalesce(has_admin_access, false) and coalesce(has_mfa, false);
end
$function$
;

-- AUTHZ_UPDATE: Altering a policy could cause queries to fail if not correctly configured or allow unauthorized access to data.
ALTER POLICY "insert_account_permissions" ON "cms"."account_permissions"
	WITH CHECK ((cms.has_admin_permission('permission'::cms.system_resource, 'insert'::cms.system_action) AND (cms.get_user_max_role_rank(cms.get_current_user_account_id()) > cms.get_user_max_role_rank(account_id)) AND cms.can_grant_permission(permission_id)));

-- AUTHZ_UPDATE: Altering a policy could cause queries to fail if not correctly configured or allow unauthorized access to data.
ALTER POLICY "insert_permission_group_permissions" ON "cms"."permission_group_permissions"
	WITH CHECK ((cms.can_modify_permission_group_permissions(group_id, 'insert'::cms.system_action) AND cms.can_grant_permission(permission_id)));

-- AUTHZ_UPDATE: Altering a policy could cause queries to fail if not correctly configured or allow unauthorized access to data.
ALTER POLICY "delete_permissions" ON "cms"."permissions"
	USING (cms.can_delete_permission(id));

-- AUTHZ_UPDATE: Altering a policy could cause queries to fail if not correctly configured or allow unauthorized access to data.
ALTER POLICY "update_permissions" ON "cms"."permissions"
	USING (cms.can_modify_permission(id, 'update'::cms.system_action))
	WITH CHECK (cms.can_modify_permission(id, 'update'::cms.system_action));

-- AUTHZ_UPDATE: Altering a policy could cause queries to fail if not correctly configured or allow unauthorized access to data.
ALTER POLICY "insert_role_permissions" ON "cms"."role_permissions"
	WITH CHECK ((cms.can_action_role(role_id, 'insert'::cms.system_action) AND cms.has_admin_permission('permission'::cms.system_resource, 'insert'::cms.system_action) AND cms.can_grant_permission(permission_id)));

-- Migration: audit dashboard & widget mutations
--
-- Slice-6 bug-hunt CONF-3: dashboard/widget create/update/delete and dashboard
-- share/unshare (an access-control change) were never audited — the generic
-- cms.audit_trigger_function() was attached only to the RBAC tables, not to
-- cms.dashboards / dashboard_widgets / dashboard_role_shares. This migration
-- closes that audit-coverage gap and gives dashboard_role_shares a clean
-- composite record id in the audit function.

-- 1. Teach the audit function the dashboard_role_shares composite primary key
--    (dashboard_id, role_id) so its audit record_id is stable rather than the
--    full-row JSON fallback.
CREATE OR REPLACE FUNCTION cms.audit_trigger_function () RETURNS trigger
SET row_security = off
SET search_path = '' AS $$
declare
    v_operation   text;
    v_old_data    jsonb;
    v_new_data    jsonb;
    v_record_id   text;
    v_record_json jsonb;
begin
    -- Determine operation type and get record data
    if TG_OP = 'DELETE' then
        v_operation := 'DELETE';
        v_old_data := to_jsonb(OLD);
        v_new_data := null;
        v_record_json := v_old_data;
    elsif TG_OP = 'UPDATE' then
        v_operation := 'UPDATE';
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
        v_record_json := v_new_data;
    elsif TG_OP = 'INSERT' then
        v_operation := 'INSERT';
        v_old_data := null;
        v_new_data := to_jsonb(NEW);
        v_record_json := v_new_data;
    end if;

    -- Generate record ID based on table structure
    if v_record_json ? 'id' then
        v_record_id := (v_record_json ->> 'id')::text;
    else
        case TG_TABLE_NAME
            when 'account_roles'
                then v_record_id := (v_record_json ->> 'account_id') || '|' || (v_record_json ->> 'role_id');
            when 'role_permissions'
                then v_record_id := (v_record_json ->> 'role_id') || '|' || (v_record_json ->> 'permission_id');
            when 'account_permissions'
                then v_record_id := (v_record_json ->> 'account_id') || '|' || (v_record_json ->> 'permission_id');
            when 'permission_group_permissions'
                then v_record_id := (v_record_json ->> 'group_id') || '|' || (v_record_json ->> 'permission_id');
            when 'role_permission_groups'
                then v_record_id := (v_record_json ->> 'role_id') || '|' || (v_record_json ->> 'group_id');
            when 'dashboard_role_shares'
                then v_record_id := (v_record_json ->> 'dashboard_id') || '|' || (v_record_json ->> 'role_id');
            else
            v_record_id := v_record_json::text;
            end case;
    end if;

    -- Create audit log entry
    perform cms.create_audit_log(
            p_operation := v_operation,
            p_schema := TG_TABLE_SCHEMA,
            p_table := TG_TABLE_NAME,
            p_record_id := v_record_id,
            p_old_data := v_old_data,
            p_new_data := v_new_data,
            p_severity := 'info',
            p_metadata := jsonb_build_object(
                    'trigger_name', TG_NAME,
                    'trigger_when', TG_WHEN,
                    'trigger_level', TG_LEVEL
                          )
            );

    if TG_OP = 'DELETE' then
        return OLD;
    else
        return NEW;
    end if;
end;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Attach audit triggers to the dashboard tables (idempotent).
DROP TRIGGER IF EXISTS dashboards_audit_insert_trigger ON cms.dashboards;
CREATE TRIGGER dashboards_audit_insert_trigger
AFTER INSERT ON cms.dashboards
FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

DROP TRIGGER IF EXISTS dashboards_audit_update_trigger ON cms.dashboards;
CREATE TRIGGER dashboards_audit_update_trigger
AFTER UPDATE ON cms.dashboards
FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

DROP TRIGGER IF EXISTS dashboards_audit_delete_trigger ON cms.dashboards;
CREATE TRIGGER dashboards_audit_delete_trigger
AFTER DELETE ON cms.dashboards
FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

DROP TRIGGER IF EXISTS dashboard_widgets_audit_insert_trigger ON cms.dashboard_widgets;
CREATE TRIGGER dashboard_widgets_audit_insert_trigger
AFTER INSERT ON cms.dashboard_widgets
FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

DROP TRIGGER IF EXISTS dashboard_widgets_audit_update_trigger ON cms.dashboard_widgets;
CREATE TRIGGER dashboard_widgets_audit_update_trigger
AFTER UPDATE ON cms.dashboard_widgets
FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

DROP TRIGGER IF EXISTS dashboard_widgets_audit_delete_trigger ON cms.dashboard_widgets;
CREATE TRIGGER dashboard_widgets_audit_delete_trigger
AFTER DELETE ON cms.dashboard_widgets
FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

DROP TRIGGER IF EXISTS dashboard_role_shares_audit_insert_trigger ON cms.dashboard_role_shares;
CREATE TRIGGER dashboard_role_shares_audit_insert_trigger
AFTER INSERT ON cms.dashboard_role_shares
FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

DROP TRIGGER IF EXISTS dashboard_role_shares_audit_update_trigger ON cms.dashboard_role_shares;
CREATE TRIGGER dashboard_role_shares_audit_update_trigger
AFTER UPDATE ON cms.dashboard_role_shares
FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

DROP TRIGGER IF EXISTS dashboard_role_shares_audit_delete_trigger ON cms.dashboard_role_shares;
CREATE TRIGGER dashboard_role_shares_audit_delete_trigger
AFTER DELETE ON cms.dashboard_role_shares
FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

CREATE OR REPLACE FUNCTION cms.enforce_permission_reshape_grantable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
BEGIN
    -- Only re-validate when a capability-defining column changes.
    IF NEW.permission_type IS NOT DISTINCT FROM OLD.permission_type
       AND NEW.system_resource IS NOT DISTINCT FROM OLD.system_resource
       AND NEW.action IS NOT DISTINCT FROM OLD.action
       AND NEW.scope IS NOT DISTINCT FROM OLD.scope
       AND NEW.schema_name IS NOT DISTINCT FROM OLD.schema_name
       AND NEW.table_name IS NOT DISTINCT FROM OLD.table_name
       AND NEW.column_name IS NOT DISTINCT FROM OLD.column_name THEN
        RETURN NEW;
    END IF;

    -- System / service-role context (no CMS account in the JWT) already bypasses RLS
    -- and is fully trusted (seeds, server-side admin client); do not constrain it. The
    -- attacker-reachable path (updatePermission on the RLS-scoped client) always has an account.
    IF cms.get_current_user_account_id() IS NULL THEN
        RETURN NEW;
    END IF;

    -- The caller may only reshape into a capability they themselves effectively hold,
    -- mirroring cms.can_grant_permission evaluated against the NEW values.
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
    ELSE
        -- Storage / other scopes have no resource/action capability check: require the
        -- caller to already hold this exact permission (matches can_grant_permission's fallback).
        IF NOT cms.has_permission(cms.get_current_user_account_id(), NEW.id) THEN
            RAISE EXCEPTION 'insufficient_privilege: cannot reshape a permission you do not hold'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION cms.audit_trigger_function()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
declare
    v_operation   text;
    v_old_data    jsonb;
    v_new_data    jsonb;
    v_record_id   text;
    v_record_json jsonb;
begin
    -- Determine operation type and get record data
    if TG_OP = 'DELETE' then
        v_operation := 'DELETE';
        v_old_data := to_jsonb(OLD);
        v_new_data := null;
        v_record_json := v_old_data;
    elsif TG_OP = 'UPDATE' then
        v_operation := 'UPDATE';
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
        v_record_json := v_new_data;
    elsif TG_OP = 'INSERT' then
        v_operation := 'INSERT';
        v_old_data := null;
        v_new_data := to_jsonb(NEW);
        v_record_json := v_new_data;
    end if;

    -- Generate record ID based on table structure
    -- For tables with single 'id' primary key
    if v_record_json ? 'id' then
        v_record_id := (v_record_json ->> 'id')::text;
    else
        -- For tables with composite primary keys, create a combined ID
        case TG_TABLE_NAME
            when 'account_roles'
                then v_record_id := (v_record_json ->> 'account_id') || '|' || (v_record_json ->> 'role_id');
            when 'role_permissions'
                then v_record_id := (v_record_json ->> 'role_id') || '|' || (v_record_json ->> 'permission_id');
            when 'account_permissions'
                then v_record_id := (v_record_json ->> 'account_id') || '|' || (v_record_json ->> 'permission_id');
            when 'permission_group_permissions'
                then v_record_id := (v_record_json ->> 'group_id') || '|' || (v_record_json ->> 'permission_id');
            when 'role_permission_groups'
                then v_record_id := (v_record_json ->> 'role_id') || '|' || (v_record_json ->> 'group_id');
            when 'dashboard_role_shares'
                then v_record_id := (v_record_json ->> 'dashboard_id') || '|' || (v_record_json ->> 'role_id');
            when 'configuration'
                then v_record_id := (v_record_json ->> 'key');
            when 'table_metadata'
                then v_record_id := (v_record_json ->> 'schema_name') || '|' || (v_record_json ->> 'table_name');
            else -- Fallback: use all non-null fields as record ID
            v_record_id := v_record_json::text;
            end case;
    end if;

    -- Create audit log entry
    perform cms.create_audit_log(
            p_operation := v_operation,
            p_schema := TG_TABLE_SCHEMA,
            p_table := TG_TABLE_NAME,
            p_record_id := v_record_id,
            p_old_data := v_old_data,
            p_new_data := v_new_data,
            p_severity := 'info',
            p_metadata := jsonb_build_object(
                    'trigger_name', TG_NAME,
                    'trigger_when', TG_WHEN,
                    'trigger_level', TG_LEVEL
                          )
            );

    -- Return appropriate record
    if TG_OP = 'DELETE' then
        return OLD;
    else
        return NEW;
    end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION cms.can_delete_permission(p_permission_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE TRIGGER account_roles_audit_update_trigger AFTER UPDATE ON cms.account_roles FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

CREATE TRIGGER accounts_audit_delete_trigger AFTER DELETE ON cms.accounts FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

CREATE TRIGGER accounts_audit_insert_trigger AFTER INSERT ON cms.accounts FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

CREATE TRIGGER accounts_audit_update_trigger AFTER UPDATE ON cms.accounts FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

CREATE TRIGGER configuration_audit_delete_trigger AFTER DELETE ON cms.configuration FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

CREATE TRIGGER configuration_audit_insert_trigger AFTER INSERT ON cms.configuration FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

CREATE TRIGGER configuration_audit_update_trigger AFTER UPDATE ON cms.configuration FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

CREATE TRIGGER permissions_enforce_reshape_grantable_trigger BEFORE UPDATE ON cms.permissions FOR EACH ROW EXECUTE FUNCTION cms.enforce_permission_reshape_grantable();

CREATE TRIGGER table_metadata_audit_delete_trigger AFTER DELETE ON cms.table_metadata FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

CREATE TRIGGER table_metadata_audit_insert_trigger AFTER INSERT ON cms.table_metadata FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();

CREATE TRIGGER table_metadata_audit_update_trigger AFTER UPDATE ON cms.table_metadata FOR EACH ROW EXECUTE FUNCTION cms.audit_trigger_function();
