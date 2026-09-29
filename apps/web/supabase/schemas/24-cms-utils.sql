
-- SECTION: UPDATE UPDATED AT COLUMN
-- In this section, we define the update updated at column function. This function is used to update the updated at column of the table.
create or replace function cms.update_updated_at_column () RETURNS TRIGGER
set
  search_path = '' as $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- SECTION: SANITIZE IDENTIFIER
-- In this section, we define the sanitize identifier function to prevent SQL injection attacks. This is normally not required when using an ORM however it is useful should the user ever be using raw SQL.
-- ---------------------------------------------------------------------------
-- cms.sanitize_identifier()
--   • Normalises to lowercase
--   • Enforces PostgreSQL identifier rules
--   • Rejects *any* reserved / type / column keyword returned by pg_get_keywords()
-- ---------------------------------------------------------------------------
create or replace function cms.sanitize_identifier (identifier TEXT) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE STRICT
set
  search_path = ''
 as $$
DECLARE
    v_norm TEXT := lower(identifier);      -- identifiers are case-insensitive
BEGIN
    --------------------------------------------------------------------------
    -- 1. Non-empty
    --------------------------------------------------------------------------
    IF v_norm IS NULL OR length(trim(v_norm)) = 0 THEN
        RAISE EXCEPTION
            'Identifier cannot be null or empty';
    END IF;

    --------------------------------------------------------------------------
    -- 2. Allowed characters & length
    --    • Must start with a letter or underscore
    --    • Subsequent chars: letters, digits, underscores
    --    • 63-byte limit (PostgreSQL internal limit for unquoted identifiers)
    --------------------------------------------------------------------------
    IF v_norm !~ '^[a-z_][a-z0-9_]{0,62}$' THEN
        RAISE EXCEPTION
            'Invalid identifier "%": must match ^[a-z_][a-z0-9_]{0,62}$',
            identifier;
    END IF;

    --------------------------------------------------------------------------
    -- 3. Reserved keyword check
    --    pg_get_keywords() categorises keywords with catcode:
    --      R = reserved, T = type keyword, C = colname keyword
    --    Any of those would behave unpredictably if used as an identifier.
    --------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1
        FROM   pg_get_keywords()
        WHERE  word = v_norm
        AND    catcode IN ('R', 'T', 'C')
    ) THEN
        RAISE EXCEPTION
            'Identifier "%": reserved SQL/type/column keyword', identifier;
    END IF;

    --------------------------------------------------------------------------
    -- 4. All good – return the safe, normalised identifier
    --------------------------------------------------------------------------
    RETURN v_norm;
END;
$$;

grant
execute on function cms.sanitize_identifier (text) to authenticated,
service_role;

-- SECTION: VALIDATE COLUMN NAME
-- In this section, we define the validate column name function. This function is used to validate the column name. It checks if the column name exists in the table.
create or replace function cms.validate_column_name (p_schema text, p_table text, p_column text) RETURNS boolean
set
  search_path = '' as $$
DECLARE
    v_exists boolean;
BEGIN
    SELECT EXISTS (SELECT 1
                   FROM information_schema.columns
                   WHERE table_schema = p_schema
                     AND table_name = p_table
                     AND column_name = p_column)
    INTO v_exists;

    RETURN v_exists;
END;
$$ LANGUAGE plpgsql STABLE;

-- SECTION: VALIDATE SCHEMA ACCESS
-- In this section, we define the validate schema access function. This function prevents write operations on private Supabase schemas.
create or replace function cms.validate_schema_access (p_schema text) RETURNS boolean
set
  search_path = '' as $$
DECLARE
    v_protected_schemas text[] := ARRAY [
        'auth',
        'cron',
        'extensions',
        'information_schema',
        'net',
        'pgsodium',
        'pgsodium_masks',
        'pgbouncer',
        'pgtle',
        'realtime',
        'storage',
        'supabase_functions',
        'supabase_migrations',
        'vault',
        'graphql',
        'graphql_public',
        'pgmq_public',
        'cms'
        ];
BEGIN
    -- Check if the schema is in the protected list
    IF p_schema = ANY (v_protected_schemas) THEN
        RETURN false;
    END IF;

    -- [TFG] RNF-02 · Corrección de PymeKit (hallada en la refutación de
    -- /rls-review): la lista heredada no incluía los catálogos del sistema.
    -- Con un permiso comodín (Root), `pg_catalog.pg_authid` devolvía los hashes
    -- de contraseña de los roles de Postgres. Se bloquea cualquier esquema
    -- `pg_*` (pg_catalog, pg_toast, pg_temp_N…), reservados por PostgreSQL.
    IF p_schema IS NULL OR p_schema LIKE 'pg\_%' THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

grant
execute on function cms.validate_schema_access (text) to authenticated,
service_role;


-- SECTION: GET ENUM VALUES
-- In this section, we define the get enum values function. This function is used to get the values of an enum for display purposes. We require SECURITY DEFINER because we need to access the pg_type and pg_enum tables.
create or replace function cms.get_enum_values (p_enum_name text) RETURNS JSONB SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_result JSONB;
BEGIN
    if not cms.verify_admin_access() then
        raise exception 'You do not have permission to view enum values';
    end if;

    -- Validate input
    p_enum_name := cms.sanitize_identifier(p_enum_name);

    -- Query PostgreSQL system catalogs for enum values
    SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
    INTO v_result
    FROM pg_type t
             JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = p_enum_name;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Grant execution rights
grant
execute on FUNCTION cms.get_enum_values to authenticated,
service_role;

-- SECTION: GENERATE DISPLAY NAME
-- In this section, we define the generate display name function. This function is used to generate a display name for a column.
create or replace function cms.generate_display_name (name text) RETURNS text LANGUAGE plpgsql
set
  search_path = '' as $$
DECLARE
    display_name text;
BEGIN
    display_name := name;

    -- Remove common abbreviations. Ex "account_id" becomes "account".
    display_name := replace(display_name, '_id', ' ');

    -- Replace underscores with spaces
    display_name := replace(display_name, '_', ' ');

    -- Capitalize first letter of each word
    display_name := initcap(display_name);

    RETURN display_name;
END;
$$;

-- SECTION: ENHANCED TYPE-AWARE VALUE FORMATTING
-- Helper function to format values based on PostgreSQL data types
create or replace function cms.format_typed_value (
  p_value jsonb,
  p_data_type text,
  p_udt_name text default null,
  p_udt_schema text default null
) RETURNS text
set
  search_path = '' as $$
DECLARE
    v_text_value    text;
    v_numeric_value text;
BEGIN
    -- Handle NULL values
    IF p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN
        RETURN 'NULL';
    END IF;

    -- Extract text representation
    v_text_value := p_value #>> '{}';

    -- Handle empty strings for non-text types
    IF v_text_value = '' AND p_data_type NOT IN ('text', 'varchar', 'char', 'character varying', 'character') THEN
        RETURN 'NULL';
    END IF;

    -- Format based on data type
    CASE p_data_type
        -- UUID type
        WHEN 'uuid' THEN -- Validate UUID format
        IF NOT v_text_value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            RAISE EXCEPTION 'Invalid UUID format: %. Expected format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', v_text_value
                USING ERRCODE = 'invalid_text_representation';
        END IF;
        RETURN format('%L::uuid', v_text_value);

        -- Integer types
        WHEN 'integer', 'int4' THEN v_numeric_value := trim(v_text_value);
                                    IF NOT v_numeric_value ~ '^-?[0-9]+$' THEN
                                        RAISE EXCEPTION 'Invalid integer value: %. Must be a whole number between -2147483648 and 2147483647', v_text_value
                                            USING ERRCODE = 'invalid_text_representation';
                                    END IF;
        -- Check bounds for 32-bit integer
                                    IF v_numeric_value::numeric NOT BETWEEN -2147483648 AND 2147483647 THEN
                                        RAISE EXCEPTION 'Integer value out of range: %. Must be between -2147483648 and 2147483647', v_text_value
                                            USING ERRCODE = '22003';
                                    END IF;
                                    RETURN v_numeric_value;

        WHEN 'bigint', 'int8' THEN v_numeric_value := trim(v_text_value);
                                   IF NOT v_numeric_value ~ '^-?[0-9]+$' THEN
                                       RAISE EXCEPTION 'Invalid bigint value: %. Must be a whole number', v_text_value
                                           USING ERRCODE = 'invalid_text_representation';
                                   END IF;
                                   RETURN v_numeric_value;

        WHEN 'smallint', 'int2' THEN v_numeric_value := trim(v_text_value);
                                     IF NOT v_numeric_value ~ '^-?[0-9]+$' THEN
                                         RAISE EXCEPTION 'Invalid smallint value: %. Must be a whole number between -32768 and 32767', v_text_value
                                             USING ERRCODE = 'invalid_text_representation';
                                     END IF;
                                     IF v_numeric_value::numeric NOT BETWEEN -32768 AND 32767 THEN
                                         RAISE EXCEPTION 'Smallint value out of range: %. Must be between -32768 and 32767', v_text_value
                                             USING ERRCODE = 'numeric_value_out_of_range';
                                     END IF;
                                     RETURN v_numeric_value;

        -- Decimal/Numeric types
        WHEN 'numeric', 'decimal' THEN v_numeric_value := trim(v_text_value);
                                       IF NOT v_numeric_value ~ '^-?[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?$' THEN
                                           RAISE EXCEPTION 'Invalid numeric value: %. Must be a valid decimal number', v_text_value
                                               USING ERRCODE = 'invalid_text_representation';
                                       END IF;
                                       RETURN v_numeric_value;

        -- Floating point types
        WHEN 'real', 'float4', 'double precision', 'float8' THEN v_numeric_value := trim(v_text_value);
        -- Allow special values for floating point
                                                                 IF v_numeric_value IN ('Infinity', '-Infinity', 'NaN') THEN
                                                                     RETURN format('%L::%s', v_numeric_value, p_data_type);
                                                                 END IF;
                                                                 IF NOT v_numeric_value ~ '^-?[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?$' THEN
                                                                     RAISE EXCEPTION 'Invalid floating point value: %. Must be a valid decimal number', v_text_value
                                                                         USING ERRCODE = 'invalid_text_representation';
                                                                 END IF;
                                                                 RETURN format('%s::%s', v_numeric_value, p_data_type);

        -- Boolean type
        WHEN 'boolean', 'bool' THEN CASE lower(trim(v_text_value))
            WHEN 'true', 't', '1', 'yes', 'y', 'on' THEN RETURN 'true';
            WHEN 'false', 'f', '0', 'no', 'n', 'off' THEN RETURN 'false';
            ELSE RAISE EXCEPTION 'Invalid boolean value: %. Must be true/false, t/f, 1/0, yes/no, y/n, or on/off', v_text_value
                USING ERRCODE = '22P02';
            END CASE;

        -- Date and time types
        WHEN 'date' THEN -- Validate date format
        BEGIN
            PERFORM v_text_value::date;
            RETURN format('%L::date', v_text_value);
        EXCEPTION
            WHEN OTHERS THEN
                RAISE EXCEPTION 'Invalid date value: %. Expected format: YYYY-MM-DD', v_text_value
                    USING ERRCODE = 'invalid_datetime_format';
        END;

        WHEN 'time', 'time without time zone' THEN BEGIN
            PERFORM v_text_value::time;
            RETURN format('%L::time', v_text_value);
        EXCEPTION
            WHEN OTHERS THEN
                RAISE EXCEPTION 'Invalid time value: %. Expected format: HH:MM:SS or HH:MM:SS.ffffff', v_text_value
                    USING ERRCODE = 'invalid_datetime_format';
        END;

        WHEN 'timestamp', 'timestamp without time zone' THEN BEGIN
            PERFORM v_text_value::timestamp;
            RETURN format('%L::timestamp', v_text_value);
        EXCEPTION
            WHEN OTHERS THEN
                RAISE EXCEPTION 'Invalid timestamp value: %. Expected format: YYYY-MM-DD HH:MM:SS', v_text_value
                    USING ERRCODE = 'invalid_datetime_format';
        END;

        WHEN 'timestamptz', 'timestamp with time zone' THEN BEGIN
            PERFORM v_text_value::timestamptz;
            RETURN format('%L::timestamptz', v_text_value);
        EXCEPTION
            WHEN OTHERS THEN
                RAISE EXCEPTION 'Invalid timestamptz value: %. Expected format: YYYY-MM-DD HH:MM:SS+TZ', v_text_value
                    USING ERRCODE = 'invalid_datetime_format';
        END;

        -- JSON types
        WHEN 'json' THEN BEGIN
            -- Validate JSON
            PERFORM p_value::json;
            RETURN format('%L::json', p_value::text);
        EXCEPTION
            WHEN OTHERS THEN
                RAISE EXCEPTION 'Invalid JSON value: %', p_value::text
                    USING ERRCODE = 'invalid_json';
        END;

        WHEN 'jsonb' THEN BEGIN
            -- Validate JSONB
            PERFORM p_value::jsonb;
            RETURN format('%L::jsonb', p_value::text);
        EXCEPTION
            WHEN OTHERS THEN
                RAISE EXCEPTION 'Invalid JSONB value: %', p_value::text
                    USING ERRCODE = 'invalid_json';
        END;

        -- Array types
        WHEN 'ARRAY' THEN IF jsonb_typeof(p_value) != 'array' THEN
            RAISE EXCEPTION 'Expected array value for array column, got: %', jsonb_typeof(p_value)
                USING ERRCODE = 'invalid_parameter_value';
                          END IF;
                          RETURN format('%L::%s', p_value::text, p_udt_name);

        -- User-defined types (enums, etc.)
        WHEN 'USER-DEFINED' THEN DECLARE
            v_qualified_type_name text;
            v_schema_condition    text;
        BEGIN
            -- Build qualified type name for casting
            IF p_udt_schema IS NOT NULL THEN
                v_qualified_type_name := format('%I.%I', p_udt_schema, p_udt_name);
                v_schema_condition := 'AND n.nspname = ' || quote_literal(p_udt_schema);
            ELSE
                v_qualified_type_name := quote_ident(p_udt_name);
                v_schema_condition := 'AND n.nspname = ''public''';
            END IF;

            -- First validate schema exists if specified
            IF p_udt_schema IS NOT NULL AND NOT EXISTS (SELECT 1
                                                        FROM pg_namespace
                                                        WHERE nspname = p_udt_schema) THEN
                RAISE EXCEPTION 'Schema does not exist: %', p_udt_schema
                    USING ERRCODE = 'invalid_schema_name';
            END IF;

            -- Check if it's an enum with schema awareness
            IF EXISTS (SELECT 1
                       FROM pg_type t
                                JOIN pg_namespace n ON t.typnamespace = n.oid
                                JOIN pg_enum e ON t.oid = e.enumtypid
                       WHERE t.typname = p_udt_name
                         AND (p_udt_schema IS NULL OR n.nspname = p_udt_schema)
                       LIMIT 1) THEN
                -- Validate enum value with schema awareness
                IF NOT EXISTS (SELECT 1
                               FROM pg_enum e
                                        JOIN pg_type t ON e.enumtypid = t.oid
                                        JOIN pg_namespace n ON t.typnamespace = n.oid
                               WHERE t.typname = p_udt_name
                                 AND (p_udt_schema IS NULL OR n.nspname = p_udt_schema)
                                 AND e.enumlabel = v_text_value) THEN
                    RAISE EXCEPTION 'Invalid enum value: % for type %. Valid values are: %',
                        v_text_value,
                        COALESCE(v_qualified_type_name, p_udt_name),
                        (SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
                         FROM pg_enum e
                                  JOIN pg_type t ON e.enumtypid = t.oid
                                  JOIN pg_namespace n ON t.typnamespace = n.oid
                         WHERE t.typname = p_udt_name
                           AND (p_udt_schema IS NULL OR n.nspname = p_udt_schema))
                        USING ERRCODE = 'invalid_parameter_value';
                END IF;
                RETURN format('%L::%s', v_text_value, v_qualified_type_name);
            ELSE
                -- For other user-defined types, cast with qualified type name
                RETURN format('%L::%s', v_text_value, v_qualified_type_name);
            END IF;
        END;

        -- Text types (default case)
        ELSE RETURN quote_literal(v_text_value);
        END CASE;

EXCEPTION
    WHEN OTHERS THEN
        -- Re-raise with additional context
        RAISE EXCEPTION 'Failed to format value "%" for data type "%": %',
            COALESCE(v_text_value, 'NULL'),
            COALESCE(p_data_type, 'unknown'),
            SQLERRM
            USING ERRCODE = SQLSTATE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- SECTION: IS TEXTUAL DATA TYPE
-- In this section, we define the is textual data type function. This function is used to check if a data type is textual.
create or replace function cms.is_textual_data_type (
  p_data_type text,
  p_udt_name text default null,
  p_udt_schema text default null
) RETURNS boolean
set
  search_path = '' as $$
BEGIN
    -- Primary textual types
    IF p_data_type IN (
                       'text',
                       'uuid',
                       'varchar',
                       'character varying',
                       'char',
                       'character'
        ) THEN
        RETURN true;
    END IF;

    -- Check for user-defined types that might be textual (like enums)
    IF p_data_type = 'USER-DEFINED' AND p_udt_name IS NOT NULL THEN
        -- Check if it's an enum (enums are searchable as text) with schema awareness
        IF EXISTS (SELECT 1
                   FROM pg_type t
                            JOIN pg_namespace n ON t.typnamespace = n.oid
                            JOIN pg_enum e ON t.oid = e.enumtypid
                   WHERE t.typname = p_udt_name
                     AND (p_udt_schema IS NULL OR n.nspname = p_udt_schema)
                   LIMIT 1) THEN
            RETURN true;
        END IF;

        -- You could add other user-defined textual types here
        -- For now, assume non-enum user-defined types are not searchable
        RETURN false;
    END IF;

    -- All other types (numeric, date, boolean, json, uuid, etc.) are not textual
    RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
-- [TFG] RNF-02: PymeKit revoca por defecto el EXECUTE de PUBLIC sobre todas las
-- funciones nuevas (00-privileges.sql), así que cada función que un usuario
-- deba invocar necesita un `grant` explícito. `format_typed_value` es una
-- función pura (convierte un valor JSON a literal SQL tipado) e
-- `is_textual_data_type` solo consulta el catálogo de tipos; ninguna lee datos
-- de negocio, por lo que exponerlas a `authenticated` no abre vías de lectura.
grant execute on function cms.format_typed_value (jsonb, text, text, text) to authenticated;

grant execute on function cms.is_textual_data_type (text, text, text) to authenticated;
