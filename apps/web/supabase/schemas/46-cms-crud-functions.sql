
-- SECTION: GET RECORD BY KEYS
-- In this section, we define the get record by keys function. This function is used to get a record by its keys. We require SECURITY DEFINER because we need to access to the end application's tables. Access is verified by the has_data_permission function.
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

grant
execute on function cms.get_record_by_keys to authenticated,
service_role;

-- SECTION: BUILD CRUD RESPONSE
-- In this section, we define the build crud response function. This function is used to build a response for the crud operations.
create or replace function cms.build_crud_response (
  p_success boolean,
  p_action cms.system_action,
  p_data jsonb default null,
  p_error text default null,
  p_meta jsonb default '{}'::jsonb
) RETURNS jsonb IMMUTABLE
set
  search_path = '' as $$
BEGIN
    RETURN jsonb_build_object(
            'success', p_success,
            'action', p_action,
            'data', p_data,
            'error', p_error,
            'meta', p_meta,
            'timestamp', extract(epoch from now())
           );
END;
$$ LANGUAGE plpgsql;

-- Mutation Functions
-- SECTION: INSERT RECORD
-- In this section, we define the insert record function. This function is used to insert a record into a table. We require SECURITY DEFINER because we need to access to the end application's tables. Access is verified by the has_data_permission function.
create or replace function cms.insert_record (p_schema text, p_table text, p_data jsonb) RETURNS jsonb SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
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
                    USING ERRCODE = 'not_null_violation';
            ELSE
                RAISE EXCEPTION 'Insert failed for table %.%: % (SQLSTATE: %)',
                    p_schema, p_table, SQLERRM, SQLSTATE
                    USING ERRCODE = SQLSTATE;
            END IF;
    END;

    -- [TFG] RF-10 · RNF-02 · Auditoría que falla en cerrado (F2.7a, pendiente
    -- de ADR-015). El código heredado capturaba cualquier error de esta
    -- llamada y seguía adelante: si la entrada de auditoría no se podía
    -- escribir, el cambio se guardaba igualmente SIN rastro. Ahora el fallo se
    -- anota en el log del servidor y se relanza con un SQLSTATE propio
    -- (`PKA01`, «no se pudo auditar»): el manejador del final de la función
    -- revierte TODO lo hecho en ella (el cambio incluido) y devuelve
    -- `success = false`; la API lo traduce a `RECORD_WRITE_FAILED` (500).
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
            RAISE LOG 'Audit log write failed for insert: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
            RAISE EXCEPTION 'Audit log write failed'
                USING ERRCODE = 'PKA01';
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
$$ LANGUAGE plpgsql;

grant
execute on function cms.insert_record to authenticated;

-- SECTION: UPDATE RECORD
-- In this section, we define the update record function. This function is used to update a record in a table. We require SECURITY DEFINER because we need to access to the end application's tables. Access is verified by the has_data_permission function.
create or replace function cms._update_record_impl (
  p_schema text,
  p_table text,
  p_where_clauses text[],
  p_data jsonb
) RETURNS jsonb SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
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

    -- [TFG] RF-10 · RNF-02 · Auditoría que falla en cerrado (F2.7a, pendiente
    -- de ADR-015). El código heredado capturaba cualquier error de esta
    -- llamada y seguía adelante: si la entrada de auditoría no se podía
    -- escribir, el cambio se guardaba igualmente SIN rastro. Ahora el fallo se
    -- anota en el log del servidor y se relanza con un SQLSTATE propio
    -- (`PKA01`, «no se pudo auditar»): el manejador del final de la función
    -- revierte TODO lo hecho en ella (el cambio incluido) y devuelve
    -- `success = false`; la API lo traduce a `RECORD_WRITE_FAILED` (500).
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
            RAISE LOG 'Audit log write failed for update: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
            RAISE EXCEPTION 'Audit log write failed'
                USING ERRCODE = 'PKA01';
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
$$ LANGUAGE plpgsql;

-- SECTION: UPDATE RECORD BY ID
-- In this section, we define the update record by id function. This function is used to update a record in a table by its id. We require SECURITY DEFINER because we need to access to the end application's tables. Access is verified by the has_data_permission function.
create or replace function cms.update_record (
  p_schema text,
  p_table text,
  p_id text,
  p_data jsonb
) RETURNS jsonb SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
BEGIN
    RETURN cms._update_record_impl(
            p_schema,
            p_table,
            ARRAY [format('id = %L', p_id)],
            p_data
           );
END;
$$ LANGUAGE plpgsql;

grant
execute on function cms.update_record to authenticated;

-- SECTION: UPDATE RECORD BY CONDITIONS
-- In this section, we define the update record by conditions function when a primary key is not provided. This function is used to update a record in a table by a set of conditions.
create or replace function cms.update_record_by_conditions (
  p_schema text,
  p_table text,
  p_where_conditions jsonb,
  p_data jsonb
) RETURNS jsonb SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
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
$$ LANGUAGE plpgsql;

grant
execute on function cms.update_record_by_conditions to authenticated;

-- SECTION: DELETE RECORD
-- In this section, we define the delete record function. This function is used to delete a record from a table. We require SECURITY DEFINER because we need to access to the end application's tables. Access is verified by the has_data_permission function.
create or replace function cms._delete_record_impl (
  p_schema text,
  p_table text,
  p_where_clauses text[]
) RETURNS jsonb SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_sql          text;
    v_exists       boolean;
    v_old_data     jsonb;
    v_record_id    text := NULL;
    v_audit_log_id uuid;
BEGIN
    -- Validate schema and table names
    p_schema := cms.sanitize_identifier(p_schema);
    p_table := cms.sanitize_identifier(p_table);

    -- Check if schema is protected
    IF NOT cms.validate_schema_access(p_schema) THEN
        RAISE EXCEPTION 'Write operations are not allowed on protected schema: %. This schema is managed by Supabase and is critical to the functionality of your project.', p_schema
            USING ERRCODE = 'insufficient_privilege',
                HINT = 'You can only perform write operations on user-defined schemas';
    END IF;

    -- JWT and permission checks
    IF NOT cms.verify_admin_access() THEN
        RAISE EXCEPTION 'Invalid admin access';
    END IF;

    IF NOT cms.has_data_permission('delete'::cms.system_action, p_schema, p_table) THEN
        RAISE EXCEPTION 'The user does not have permission to delete this record';
    END IF;

    -- First fetch AND LOCK the current data for audit logging
    EXECUTE format(
            'SELECT to_jsonb(%I.*) FROM %I.%I WHERE %s FOR UPDATE', -- Added FOR UPDATE
            p_table, p_schema, p_table, array_to_string(p_where_clauses, ' AND ')
            ) INTO v_old_data;

    -- If the record is not found, return a proper error response
    IF v_old_data IS NULL THEN
        RETURN cms.build_crud_response(
                false,
                'delete'::cms.system_action,
                NULL,
                'Record not found.',
                jsonb_build_object('affected_rows', 0)
               );
    END IF;

    -- Extract ID for audit log if available
    v_record_id := v_old_data ->> 'id';

    -- Perform the deletion
    v_sql := format('DELETE FROM %I.%I WHERE %s',
                    p_schema, p_table, array_to_string(p_where_clauses, ' AND '));

    BEGIN
        EXECUTE v_sql;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Error deleting record: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    END;

    -- [TFG] RF-10 · RNF-02 · Auditoría que falla en cerrado (F2.7a, pendiente
    -- de ADR-015). El código heredado capturaba cualquier error de esta
    -- llamada y seguía adelante: si la entrada de auditoría no se podía
    -- escribir, el cambio se guardaba igualmente SIN rastro. Ahora el fallo se
    -- anota en el log del servidor y se relanza con un SQLSTATE propio
    -- (`PKA01`, «no se pudo auditar»): el manejador del final de la función
    -- revierte TODO lo hecho en ella (el cambio incluido) y devuelve
    -- `success = false`; la API lo traduce a `RECORD_WRITE_FAILED` (500).
    BEGIN
        v_audit_log_id := cms.create_audit_log(
                'DELETE',
                p_schema,
                p_table,
                v_record_id,
                v_old_data,
                NULL
                          );
    EXCEPTION
        WHEN OTHERS THEN
            RAISE LOG 'Audit log write failed for delete: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
            RAISE EXCEPTION 'Audit log write failed'
                USING ERRCODE = 'PKA01';
    END;

    RETURN jsonb_build_object(
            'success', true,
            'action', 'delete',
            'data', v_old_data, -- Return what was deleted
            'meta', jsonb_build_object(
                    'affected_rows', 1,
                    'audit_log_id', v_audit_log_id
                    )
           );
EXCEPTION
    WHEN OTHERS THEN
        RETURN cms.build_crud_response(
                false,
                'delete'::cms.system_action,
                NULL,
                SQLERRM,
                jsonb_build_object('sqlstate', SQLSTATE)
               );
END;
$$ LANGUAGE plpgsql;

-- SECTION: DELETE RECORD BY ID
-- In this section, we define the delete record by id function. This function is used to delete a record from a table by its id.
-- [TFG] RNF-02 · Corrección de PymeKit (BITACORA B-45): pasa a SECURITY
-- DEFINER, igual que `update_record`, para que `authenticated` no necesite
-- ejecutar directamente `_delete_record_impl`, que acepta cláusulas WHERE en
-- crudo. La función interna comprueba igualmente acceso y permisos.
create or replace function cms.delete_record (p_schema text, p_table text, p_id text) RETURNS jsonb SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
BEGIN
    RETURN cms._delete_record_impl(
            p_schema,
            p_table,
            ARRAY [format('id = %L', p_id)]
           );
END;
$$ LANGUAGE plpgsql;

grant
execute on function cms.delete_record to authenticated;

-- SECTION: DELETE RECORD BY CONDITIONS
-- In this section, we define the delete record by conditions function. This function is used to delete a record from a table by its conditions. Uses SECURITY DEFINER because we need to access to the end application's tables. Access is verified by the has_data_permission function.
create or replace function cms.delete_record_by_conditions (
  p_schema text,
  p_table text,
  p_where_conditions jsonb
) RETURNS jsonb SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_where_clauses                 text[] := '{}';
    v_column                        text;
    v_value                         jsonb;
    v_column_info                   RECORD;
    v_formatted_value               text;
    v_condition_count               int    := 0;
    v_max_conditions       CONSTANT int    := 10; -- Prevent overly complex conditions
    v_record_count                  int    := 0;
    v_max_records_affected CONSTANT int    := 25; -- Safety limit for bulk deletes
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

    -- Permission check
    IF NOT cms.has_data_permission('delete'::cms.system_action, p_schema, p_table) THEN
        RAISE EXCEPTION 'Permission denied for delete operation on %.%', p_schema, p_table
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Validate where conditions
    IF p_where_conditions IS NULL OR jsonb_typeof(p_where_conditions) != 'object' THEN
        RAISE EXCEPTION 'Where conditions must be a valid JSON object'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Check for empty conditions - CRITICAL for delete operations
    IF NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_where_conditions)) THEN
        RAISE EXCEPTION 'Where conditions cannot be empty for delete operations. This is a safety measure to prevent accidental bulk deletions'
            USING ERRCODE = 'invalid_parameter_value',
                HINT = 'Specify at least one condition to identify the records to delete';
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

    -- SAFETY CHECK: Count records that would be affected before deletion
    EXECUTE format(
            'SELECT COUNT(*) FROM %I.%I WHERE %s',
            p_schema, p_table, array_to_string(v_where_clauses, ' AND ')
            ) INTO v_record_count;

    -- Prevent accidental bulk deletions
    IF v_record_count > v_max_records_affected THEN
        RAISE EXCEPTION 'Delete operation would affect % records, which exceeds the safety limit of %. This appears to be a bulk deletion that should be reviewed',
            v_record_count, v_max_records_affected
            USING ERRCODE = 'invalid_parameter_value',
                HINT = 'If this bulk deletion is intentional, contact your administrator to increase the safety limit';
    END IF;

    -- Log the planned deletion for audit purposes
    RAISE NOTICE 'Delete operation will affect % record(s) in %.%', v_record_count, p_schema, p_table;

    -- If no records match, return early with clear message
    IF v_record_count = 0 THEN
        RETURN cms.build_crud_response(
                false,
                'delete'::cms.system_action,
                NULL,
                'No records found matching the specified conditions',
                jsonb_build_object(
                        'affected_rows', 0,
                        'conditions_checked', p_where_conditions
                )
               );
    END IF;

    -- Delegate to the existing implementation
    RETURN cms._delete_record_impl(
            p_schema,
            p_table,
            v_where_clauses
           );

EXCEPTION
    WHEN OTHERS THEN
        -- Enhanced error logging with context
        RAISE LOG 'delete_record_by_conditions failed - Schema: %, Table: %, Conditions: %, Error: %',
            p_schema, p_table, p_where_conditions::text, SQLERRM;

        -- Return structured error response
        RETURN cms.build_crud_response(
                false,
                'delete'::cms.system_action,
                NULL,
                format('Delete failed: %s', SQLERRM),
                jsonb_build_object(
                        'sqlstate', SQLSTATE,
                        'schema', p_schema,
                        'table', p_table,
                        'error_detail', SQLERRM,
                        'conditions', p_where_conditions
                )
               );
END;
$$ LANGUAGE plpgsql;

grant
execute on function cms.delete_record_by_conditions to authenticated;

-- SECTION: BUILD WHERE CLAUSE (FIXED)
-- This function builds a secure WHERE clause for queries with proper SQL injection prevention
create or replace function cms.build_where_clause (p_schema text, p_table text, p_filters jsonb) RETURNS text
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_filter                         jsonb;
    v_column                         text;
    v_operator                       text;
    v_value                          jsonb;
    v_clauses                        text[]      := '{}';
    v_allowed_ops                    text[]      := ARRAY ['=', '!=', '<', '>', '<=', '>=', 'LIKE', 'ILIKE', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL'];
    v_column_type                    text;
    v_typed_value                    text;
    v_temp_value                     text;
    v_array_elements                 text[]      := '{}';
    v_element                        jsonb;
    v_formatted_element              text;

    -- 🔒 ENHANCED COMPLEXITY LIMITS (Implementing expert recommendation #12)
    v_max_filters           CONSTANT int         := 20; -- Max number of filter objects
    v_max_array_size        CONSTANT int         := 50; -- Max size per individual array
    v_max_total_conditions  CONSTANT int         := 200; -- Max total conditions across all filters
    v_max_string_length     CONSTANT int         := 1000; -- Max length of individual values
    v_max_total_arrays      CONSTANT int         := 10; -- NEW: Max number of IN/NOT IN arrays total
    v_max_filter_complexity CONSTANT int         := 500; -- NEW: Max complexity score per filter

    -- Complexity tracking
    v_total_conditions               int         := 0;
    v_total_arrays                   int         := 0;
    v_current_array_size             int;
    v_filter_complexity              int;
    v_total_complexity               int         := 0;

    -- Performance monitoring
    v_start_time                     TIMESTAMPTZ := clock_timestamp();
    v_processing_time                INTERVAL;
BEGIN
    -- Input validation
    IF p_filters IS NULL OR jsonb_typeof(p_filters) != 'array' THEN
        RETURN NULL;
    END IF;

    -- 🚨 GUARD: Prevent excessive filter count
    IF jsonb_array_length(p_filters) > v_max_filters THEN
        RAISE EXCEPTION 'Too many filters provided (max %, got %)',
            v_max_filters, jsonb_array_length(p_filters)
            USING ERRCODE = 'data_exception',
                HINT = 'Reduce the number of filters or increase pagination';
    END IF;

    -- Process each filter with comprehensive tracking
    FOR v_filter IN SELECT * FROM jsonb_array_elements(p_filters)
        LOOP
            -- Reset per-filter complexity
            v_filter_complexity := 0;

            -- 🚨 GUARD: Check total complexity before processing each filter
            IF v_total_conditions >= v_max_total_conditions THEN
                RAISE EXCEPTION 'Query too complex: exceeds maximum of % total conditions',
                    v_max_total_conditions
                    USING ERRCODE = 'data_exception',
                        HINT = 'Simplify your filters or use pagination';
            END IF;

            -- Validate filter structure
            IF NOT (v_filter ? 'column' AND v_filter ? 'operator') THEN
                RAISE EXCEPTION 'Invalid filter structure: missing column or operator'
                    USING ERRCODE = 'invalid_parameter_value',
                        HINT = 'Each filter must have "column" and "operator" fields';
            END IF;

            v_column := v_filter ->> 'column';
            v_operator := v_filter ->> 'operator';
            v_value := v_filter -> 'value';

            -- 🔍 VALIDATION: Column name checks
            IF v_column IS NULL OR length(v_column) = 0 OR length(v_column) > 63 THEN
                RAISE EXCEPTION 'Invalid column name length (max 63 characters)'
                    USING ERRCODE = 'invalid_parameter_value';
            END IF;

            IF NOT cms.validate_column_name(p_schema, p_table, v_column) THEN
                RAISE EXCEPTION 'Column does not exist in table: %', v_column
                    USING ERRCODE = 'undefined_column';
            END IF;

            -- 🔍 VALIDATION: Operator checks
            IF v_operator IS NULL OR NOT v_operator = ANY (v_allowed_ops) THEN
                RAISE EXCEPTION 'Invalid or unsupported operator: %', COALESCE(v_operator, 'NULL')
                    USING ERRCODE = 'invalid_parameter_value',
                        HINT = format('Allowed operators: %s', array_to_string(v_allowed_ops, ', '));
            END IF;

            -- Get column data type for proper casting
            SELECT data_type
            INTO v_column_type
            FROM information_schema.columns
            WHERE table_schema = p_schema
              AND table_name = p_table
              AND column_name = v_column;

            -- 🎯 OPERATOR HANDLING with enhanced complexity tracking
            IF v_operator IN ('IS NULL', 'IS NOT NULL') THEN
                v_clauses := array_append(v_clauses, format('%I %s', v_column, v_operator));
                v_total_conditions := v_total_conditions + 1;
                v_filter_complexity := v_filter_complexity + 1;

            ELSIF v_operator IN ('IN', 'NOT IN') THEN
                -- 🚨 ENHANCED ARRAY VALIDATION (Expert recommendation #12)
                IF v_value IS NULL OR jsonb_typeof(v_value) != 'array' THEN
                    RAISE EXCEPTION 'IN/NOT IN operator requires array value'
                        USING ERRCODE = 'invalid_parameter_value';
                END IF;

                v_current_array_size := jsonb_array_length(v_value);

                -- Guard against empty arrays
                IF v_current_array_size = 0 THEN
                    RAISE EXCEPTION 'IN/NOT IN array cannot be empty'
                        USING ERRCODE = 'invalid_parameter_value';
                END IF;

                -- 🔒 NEW PROTECTION: Limit individual array size
                IF v_current_array_size > v_max_array_size THEN
                    RAISE EXCEPTION 'IN/NOT IN array too large (max % items, got %)',
                        v_max_array_size, v_current_array_size
                        USING ERRCODE = 'data_exception',
                            HINT = 'Break large arrays into multiple smaller filters';
                END IF;

                -- 🔒 NEW PROTECTION: Limit total number of arrays
                IF v_total_arrays >= v_max_total_arrays THEN
                    RAISE EXCEPTION 'Too many IN/NOT IN arrays (max %, got %)',
                        v_max_total_arrays, v_total_arrays + 1
                        USING ERRCODE = 'data_exception',
                            HINT = 'Reduce the number of array-based filters';
                END IF;

                -- 🔒 ENHANCED PROTECTION: Check if adding this array would exceed total complexity
                IF v_total_conditions + v_current_array_size > v_max_total_conditions THEN
                    RAISE EXCEPTION 'Query too complex: would exceed maximum of % total conditions (current: %, adding: %)',
                        v_max_total_conditions, v_total_conditions, v_current_array_size
                        USING ERRCODE = 'data_exception',
                            HINT = 'Reduce array sizes or number of filters';
                END IF;

                -- Process array elements with enhanced validation
                v_array_elements := '{}';
                FOR v_element IN SELECT * FROM jsonb_array_elements(v_value)
                    LOOP
                        v_temp_value := v_element #>> '{}';

                        -- 🔍 VALIDATION: String length check
                        IF length(v_temp_value) > v_max_string_length THEN
                            RAISE EXCEPTION 'Array element too long (max % characters, got %)',
                                v_max_string_length, length(v_temp_value)
                                USING ERRCODE = 'string_data_length_mismatch',
                                    HINT = 'Reduce the length of individual array values';
                        END IF;

                        -- 🎯 TYPE-SPECIFIC FORMATTING with enhanced validation
                        CASE v_column_type
                            WHEN 'uuid' THEN IF NOT v_temp_value ~
                                                    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                                RAISE EXCEPTION 'Invalid UUID format in array: %', v_temp_value
                                    USING ERRCODE = 'invalid_text_representation';
                                             END IF;
                                             v_formatted_element := format('%L::uuid', v_temp_value);

                            WHEN 'integer', 'bigint', 'smallint' THEN IF NOT v_temp_value ~ '^-?\d+$' THEN
                                RAISE EXCEPTION 'Invalid integer format in array: %', v_temp_value
                                    USING ERRCODE = 'invalid_text_representation';
                                                                      END IF;
                            -- Check for integer overflow
                                                                      BEGIN
                                                                          PERFORM v_temp_value::bigint;
                                                                      EXCEPTION
                                                                          WHEN numeric_value_out_of_range THEN
                                                                              RAISE EXCEPTION 'Integer value out of range in array: %', v_temp_value;
                                                                      END;
                                                                      v_formatted_element := v_temp_value;

                            WHEN 'numeric', 'decimal', 'real', 'double precision'
                                THEN IF NOT v_temp_value ~ '^-?\d*\.?\d+([eE][+-]?\d+)?$' THEN
                                    RAISE EXCEPTION 'Invalid numeric format in array: %', v_temp_value
                                        USING ERRCODE = 'invalid_text_representation';
                                     END IF;
                                     v_formatted_element := v_temp_value;

                            WHEN 'boolean' THEN IF NOT v_temp_value IN
                                                       ('true', 'false', 't', 'f', '1', '0', 'yes', 'no', 'on',
                                                        'off') THEN
                                RAISE EXCEPTION 'Invalid boolean format in array: %', v_temp_value
                                    USING ERRCODE = 'invalid_text_representation';
                                                END IF;
                                                v_formatted_element := format('%L::boolean', v_temp_value);

                            WHEN 'date', 'timestamp', 'timestamptz' THEN -- Validate date format
                            BEGIN
                                PERFORM v_temp_value::timestamp;
                            EXCEPTION
                                WHEN invalid_datetime_format THEN
                                    RAISE EXCEPTION 'Invalid date/timestamp format in array: %', v_temp_value
                                        USING ERRCODE = 'invalid_datetime_format';
                            END;
                            v_formatted_element := format('%L::%s', v_temp_value, v_column_type);

                            ELSE -- Default: string types with escaping
                            v_formatted_element := quote_literal(v_temp_value);
                            END CASE;

                        v_array_elements := array_append(v_array_elements, v_formatted_element);
                    END LOOP;

                -- Build the final IN/NOT IN clause
                v_clauses := array_append(v_clauses,
                                          format('%I %s (%s)', v_column, v_operator,
                                                 array_to_string(v_array_elements, ', '))
                             );

                -- Update complexity counters
                v_total_conditions := v_total_conditions + v_current_array_size;
                v_total_arrays := v_total_arrays + 1;
                v_filter_complexity := v_filter_complexity + v_current_array_size;

            ELSE
                -- 🎯 REGULAR COMPARISON OPERATORS
                IF v_value IS NULL OR jsonb_typeof(v_value) = 'null' THEN
                    RAISE EXCEPTION 'Cannot use operator % with NULL value. Use IS NULL/IS NOT NULL instead', v_operator
                        USING ERRCODE = 'invalid_parameter_value';
                END IF;

                v_temp_value := v_value #>> '{}';

                -- 🔍 VALIDATION: String length check
                IF length(v_temp_value) > v_max_string_length THEN
                    RAISE EXCEPTION 'Value too long (max % characters, got %)',
                        v_max_string_length, length(v_temp_value)
                        USING ERRCODE = 'string_data_length_mismatch';
                END IF;

                -- 🎯 TYPE-SAFE FORMATTING (same logic as arrays)
                CASE v_column_type
                    WHEN 'uuid'
                        THEN IF NOT v_temp_value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' THEN
                            RAISE EXCEPTION 'Invalid UUID format: %', v_temp_value
                                USING ERRCODE = 'invalid_text_representation';
                             END IF;
                             v_typed_value := format('%L::uuid', v_temp_value);

                    WHEN 'integer', 'bigint', 'smallint' THEN IF NOT v_temp_value ~ '^-?\d+' THEN
                        RAISE EXCEPTION 'Invalid integer format: %', v_temp_value
                            USING ERRCODE = 'invalid_text_representation';
                                                              END IF;
                    -- Validate range
                                                              BEGIN
                                                                  PERFORM v_temp_value::bigint;
                                                              EXCEPTION
                                                                  WHEN numeric_value_out_of_range THEN
                                                                      RAISE EXCEPTION 'Integer value out of range: %', v_temp_value;
                                                              END;
                                                              v_typed_value := v_temp_value;

                    WHEN 'numeric', 'decimal', 'real', 'double precision'
                        THEN IF NOT v_temp_value ~ '^-?\d*\.?\d+([eE][+-]?\d+)?' THEN
                            RAISE EXCEPTION 'Invalid numeric format: %', v_temp_value
                                USING ERRCODE = 'invalid_text_representation';
                             END IF;
                             v_typed_value := v_temp_value;

                    WHEN 'boolean'
                        THEN IF NOT v_temp_value IN ('true', 'false', 't', 'f', '1', '0', 'yes', 'no', 'on', 'off') THEN
                            RAISE EXCEPTION 'Invalid boolean format: %', v_temp_value
                                USING ERRCODE = 'invalid_text_representation';
                             END IF;
                             v_typed_value := format('%L::boolean', v_temp_value);

                    WHEN 'date', 'timestamp', 'timestamptz' THEN BEGIN
                                                                     PERFORM v_temp_value::timestamp;
                                                                 EXCEPTION
                                                                     WHEN invalid_datetime_format THEN
                                                                         RAISE EXCEPTION 'Invalid date/timestamp format: %', v_temp_value
                                                                             USING ERRCODE = 'invalid_datetime_format';
                                                                 END;
                                                                 v_typed_value := format('%L::%s', v_temp_value, v_column_type);

                    ELSE -- Default: string types
                    v_typed_value := quote_literal(v_temp_value);
                    END CASE;

                v_clauses := array_append(v_clauses, format('%I %s %s', v_column, v_operator, v_typed_value));
                v_total_conditions := v_total_conditions + 1;
                v_filter_complexity := v_filter_complexity + 1;
            END IF;

            -- 🔒 NEW PROTECTION: Check per-filter complexity
            IF v_filter_complexity > v_max_filter_complexity THEN
                RAISE EXCEPTION 'Individual filter too complex (max %, got %)',
                    v_max_filter_complexity, v_filter_complexity
                    USING ERRCODE = 'data_exception',
                        HINT = 'Simplify this filter or break it into multiple filters';
            END IF;

            v_total_complexity := v_total_complexity + v_filter_complexity;
        END LOOP;

    -- Calculate processing time for monitoring
    v_processing_time := clock_timestamp() - v_start_time;

    -- 🔍 PERFORMANCE MONITORING: Log if query is approaching limits
    IF v_total_conditions > v_max_total_conditions * 0.8 THEN
        RAISE WARNING 'WHERE clause approaching complexity limit: % of % conditions used (%.3f ms to build)',
            v_total_conditions, v_max_total_conditions,
            EXTRACT(MILLISECONDS FROM v_processing_time);
    END IF;

    -- 📊 COMPLEXITY REPORTING for monitoring
    IF v_total_arrays > v_max_total_arrays * 0.7 THEN
        RAISE WARNING 'High array usage in WHERE clause: % of % arrays used',
            v_total_arrays, v_max_total_arrays;
    END IF;

    -- Return the built WHERE clause
    IF array_length(v_clauses, 1) > 0 THEN
        RETURN array_to_string(v_clauses, ' AND ');
    ELSE
        RETURN NULL;
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        -- 🚨 ENHANCED ERROR REPORTING with context
        RAISE EXCEPTION 'WHERE clause build failed: % (Filter context: schema=%, table=%, total_conditions=%, total_arrays=%)',
            SQLERRM, p_schema, p_table, v_total_conditions, v_total_arrays
            USING ERRCODE = SQLSTATE,
                HINT = 'Check filter syntax, data types, and complexity limits';
END;
$$ LANGUAGE plpgsql STABLE security definer;

-- SECTION: BUILD SORT CLAUSE
-- In this section, we define the build sort clause function. This function is used to build the sort clause for a query.
create or replace function cms.build_sort_clause (p_schema text, p_table text, p_sort jsonb) RETURNS text
set
  search_path = '' as $$
DECLARE
    v_column    text;
    v_direction text;
    v_clauses   text[] := '{}';
BEGIN
    IF p_sort IS NULL OR jsonb_typeof(p_sort) != 'object' THEN
        RETURN NULL;
    END IF;

    FOR v_column, v_direction IN
        SELECT key, value::text FROM jsonb_each_text(p_sort)
        LOOP
            -- Validate column name
            IF NOT cms.validate_column_name(p_schema, p_table, v_column) THEN
                RAISE EXCEPTION 'Invalid sort column: %', v_column;
            END IF;

            -- Validate direction
            IF v_direction NOT IN ('ASC', 'DESC', 'asc', 'desc') THEN
                RAISE EXCEPTION 'Invalid sort direction: %', v_direction;
            END IF;

            v_clauses := array_append(v_clauses, quote_ident(v_column) || ' ' || upper(v_direction));
        END LOOP;

    IF cardinality(v_clauses) > 0 THEN
        RETURN 'ORDER BY ' || array_to_string(v_clauses, ', ');
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- SECTION: QUERY TABLE
-- In this section, we define the query table function. This function is used to query a table. We require SECURITY DEFINER because we need to access to the end application's tables. Access is verified by the has_data_permission function.
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
-- [TFG] RNF-02: `grant` explícitos que sustituyen al EXECUTE implícito de
-- PUBLIC, que PymeKit elimina por defecto (00-privileges.sql).
--  - `query_table`: punto de entrada del explorador de datos. Es SECURITY
--    DEFINER, pero valida los identificadores y exige `has_data_permission`.
--  - `build_where_clause`: construye el WHERE a partir de filtros JSON y
--    valida cada columna contra el catálogo; no ejecuta la consulta.
-- `_update_record_impl`, `_delete_record_impl`, `build_sort_clause`,
-- `validate_column_name` y `build_crud_response` solo se llaman desde
-- funciones SECURITY DEFINER (que se ejecutan como su propietario), así que
-- no se conceden a nadie.
--
-- [TFG] RNF-02 · B-45: en la F2.1 se concedió aquí `_delete_record_impl` a
-- `authenticated` para que funcionara `delete_record` (entonces SECURITY
-- INVOKER). Como la función interna concatena `p_where_clauses` sin validar
-- y se ejecuta con RLS desactivado, cualquiera con permiso de borrado en una
-- tabla podía leer cualquier dato de la BD a través del texto de error. Se
-- revoca de forma explícita (por si una BD ya tenía el permiso).
revoke execute on function cms._delete_record_impl (text, text, text[]) from public, anon, authenticated;

grant execute on function cms.query_table (text, text, jsonb, jsonb, jsonb) to authenticated;

grant execute on function cms.build_where_clause (text, text, jsonb) to authenticated;
