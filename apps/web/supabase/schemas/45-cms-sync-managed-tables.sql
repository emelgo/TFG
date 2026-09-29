
-- SECTION: SYNC MANAGED TABLES
-- In this section, we define the sync managed tables function. This function is used to sync the managed tables. By default, it will sync all tables in the public schema.
-- If a table name is provided, it will sync only that table. If a schema name is provided, it will sync all tables in that schema.
create or replace function cms.sync_managed_tables (
  p_schema_name TEXT default 'public',
  p_table_name TEXT default null
) RETURNS void
set
  SEARCH_PATH to '' as $$
DECLARE
    v_table_record       RECORD;
    v_col_record         RECORD;
    v_rel_record         RECORD;
    v_key_record         RECORD; -- For primary key detection
    v_uniq_record        RECORD; -- For unique constraint detection
    v_columns            JSONB;
    v_is_primary_key     BOOLEAN;
    v_relations          JSONB;
    v_existing           JSONB;
    v_col_config         JSONB;
    v_relation           JSONB;
    v_existing_rel       JSONB;
    v_is_enum            BOOLEAN;
    v_enum_type          TEXT;
    v_enum_values        JSONB;
    v_primary_keys       JSONB; -- To store primary key info
    v_unique_constraints JSONB; -- To store unique constraints
    v_table_config       JSONB; -- To store table-level metadata
    i                    INTEGER;
    v_relation_idx       TEXT;
    v_inverse_relations  JSONB;
BEGIN
    -- Sanitize inputs for security
    p_schema_name := cms.sanitize_identifier(p_schema_name);

    IF p_table_name IS NOT NULL THEN
        p_table_name := cms.sanitize_identifier(p_table_name);
    END IF;

    -- Note: We don't delete existing metadata here because we want to preserve
    -- custom values like display_name, description, etc. The INSERT ... ON CONFLICT
    -- logic below will handle merging new schema data with existing custom values.

    -- Build the query to get tables based on parameters
    FOR v_table_record IN
        EXECUTE format(
                'SELECT table_schema, table_name
             FROM information_schema.tables
             WHERE table_schema = %L
               AND table_type = ''BASE TABLE''
               %s
             ORDER BY table_name',
                p_schema_name,
                CASE
                    WHEN p_table_name IS NOT NULL
                        THEN format('AND table_name = %L', p_table_name)
                    ELSE ''
                    END
                )
        LOOP
            -- Build columns config JSONB
            v_columns := '{}'::jsonb;
            v_primary_keys := '[]'::jsonb;
            v_unique_constraints := '[]'::jsonb;
            v_table_config := '{}'::jsonb;
            v_relations := '[]'::jsonb;
            -- Initialize v_relations

            -- Get existing columns_config if any
            SELECT columns_config, ui_config, relations_config
            INTO v_existing, v_table_config, v_relations
            FROM cms.table_metadata
            WHERE schema_name = v_table_record.table_schema
              AND table_name = v_table_record.table_name;

            -- Initialize configs if null
            IF v_table_config IS NULL THEN
                v_table_config := '{}'::jsonb;
            END IF;

            IF v_relations IS NULL THEN
                v_relations := '[]'::jsonb;
            END IF;

            -- 1. IDENTIFY PRIMARY KEYS
            -- Query to find primary key columns
            FOR v_key_record IN
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                         JOIN information_schema.key_column_usage kcu
                              ON tc.constraint_name = kcu.constraint_name
                WHERE tc.table_schema = v_table_record.table_schema
                  AND tc.table_name = v_table_record.table_name
                  AND tc.constraint_type = 'PRIMARY KEY'
                ORDER BY kcu.ordinal_position
                LOOP
                    -- Add to primary keys array
                    v_primary_keys := v_primary_keys || jsonb_build_object(
                            'column_name', v_key_record.column_name
                                                        );
                END LOOP;

            -- 2. IDENTIFY UNIQUE CONSTRAINTS
            FOR v_uniq_record IN
                SELECT tc.constraint_name,
                       jsonb_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS columns
                FROM information_schema.table_constraints tc
                         JOIN information_schema.key_column_usage kcu
                              ON tc.constraint_name = kcu.constraint_name
                WHERE tc.table_schema = v_table_record.table_schema
                  AND tc.table_name = v_table_record.table_name
                  AND tc.constraint_type = 'UNIQUE'
                GROUP BY tc.constraint_name
                LOOP
                    -- Add to unique constraints array
                    v_unique_constraints := v_unique_constraints || jsonb_build_object(
                            'constraint_name', v_uniq_record.constraint_name,
                            'columns', v_uniq_record.columns
                                                                    );
                END LOOP;

            -- Update table_config with primary key and unique constraint information
            v_table_config := jsonb_set(
                    v_table_config,
                    ARRAY ['primary_keys'],
                    v_primary_keys
                              );

            v_table_config := jsonb_set(
                    v_table_config,
                    ARRAY ['unique_constraints'],
                    v_unique_constraints
                              );

            -- Process columns
            FOR v_col_record IN
                SELECT column_name,
                       data_type,
                       character_maximum_length,
                       column_default,
                       is_nullable,
                       ordinal_position,
                       udt_name,
                       udt_schema
                FROM information_schema.columns
                WHERE table_schema = v_table_record.table_schema
                  AND table_name = v_table_record.table_name
                ORDER BY ordinal_position
                LOOP
                    -- Check if this column is a primary key
                    v_is_primary_key := (SELECT EXISTS (SELECT 1
                                                        FROM jsonb_array_elements(v_primary_keys)
                                                        WHERE value ->> 'column_name' = v_col_record.column_name));

                    -- Check if column type is an enum
                    v_is_enum := FALSE;
                    IF v_col_record.data_type = 'USER-DEFINED' THEN
                        -- Check if the UDT is an enum
                        SELECT EXISTS (SELECT 1
                                       FROM pg_type t
                                                JOIN pg_enum e ON t.oid = e.enumtypid
                                       WHERE t.typname = v_col_record.udt_name)
                        INTO v_is_enum;

                        IF v_is_enum THEN
                            v_enum_type := v_col_record.udt_name;

                            -- Get enum values
                            SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
                            FROM pg_enum e
                                     JOIN pg_type t ON e.enumtypid = t.oid
                            WHERE t.typname = v_enum_type
                            INTO v_enum_values;
                        END IF;
                    END IF;

                    v_col_config := jsonb_build_object(
                            'name', v_col_record.column_name,
                            'display_name', cms.generate_display_name(v_col_record.column_name),
                            'description', '',
                            'ordering', v_col_record.ordinal_position,
                            'is_required', v_col_record.is_nullable = 'NO',
                            'is_visible_in_table', true,
                            'is_visible_in_detail', true,
                            'is_filterable', true,
                            'is_searchable',
                            cms.is_textual_data_type(v_col_record.data_type, v_col_record.udt_name,
                                                          v_col_record.udt_schema),
                            'is_sortable', true,
                            'is_editable', NOT (v_is_primary_key OR v_col_record.column_name = 'id' OR
                                                v_col_record.column_name LIKE '%\_at'),
                            'is_primary_key', v_is_primary_key,
                            'default_value', v_col_record.column_default,
                            'ui_config', jsonb_build_object(
                                    'data_type', v_col_record.data_type,
                                    'max_length', v_col_record.character_maximum_length,
                                    'is_enum', v_is_enum,
                                    'enum_type', CASE WHEN v_is_enum THEN v_enum_type ELSE NULL END,
                                    'enum_values', CASE WHEN v_is_enum THEN v_enum_values ELSE NULL END
                                         )
                                    );

                    -- Preserve existing custom settings if any
                    IF v_existing IS NOT NULL AND v_existing ? v_col_record.column_name THEN
                        v_col_config := v_col_config || v_existing -> v_col_record.column_name;
                    END IF;

                    -- Add to columns collection
                    v_columns := v_columns || jsonb_build_object(v_col_record.column_name, v_col_config);
                END LOOP;

            -- 3. PROCESS FOREIGN KEY RELATIONSHIPS
            -- Use system catalogs instead of information_schema for cross-schema compatibility
            FOR v_rel_record IN
                SELECT 
                    a.attname as source_column,
                    fn.nspname as target_schema,
                    ft.relname as target_table,
                    fa.attname as target_column
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_namespace n ON t.relnamespace = n.oid
                JOIN pg_class ft ON c.confrelid = ft.oid
                JOIN pg_namespace fn ON ft.relnamespace = fn.oid
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
                JOIN pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attnum = ANY(c.confkey)
                WHERE n.nspname = v_table_record.table_schema
                  AND t.relname = v_table_record.table_name
                  AND c.contype = 'f'
                LOOP
                    -- Create relation object
                    v_relation := jsonb_build_object(
                            'source_column', v_rel_record.source_column,
                            'target_schema', v_rel_record.target_schema,
                            'target_table', v_rel_record.target_table,
                            'target_column', v_rel_record.target_column,
                            'relation_type', 'many_to_one',
                            'display_fields', '[]'::jsonb
                                  );

                    -- Check if relation already exists and preserve custom settings
                    v_existing_rel := NULL;
                    IF jsonb_typeof(v_relations) = 'array' THEN
                        FOR i IN 0..jsonb_array_length(v_relations) - 1
                            LOOP
                                IF (v_relations -> i ->> 'source_column' = v_rel_record.source_column AND
                                    v_relations -> i ->> 'target_table' = v_rel_record.target_table) THEN
                                    v_existing_rel := v_relations -> i;
                                    EXIT;
                                END IF;
                            END LOOP;
                    END IF;

                    -- Merge with existing relation config if found
                    IF v_existing_rel IS NOT NULL THEN
                        v_relation := v_relation || v_existing_rel;
                    END IF;

                    -- Convert array index to text for use in jsonb_set
                    v_relation_idx := jsonb_array_length(v_relations)::text;

                    -- Add to relations array (FIXED)
                    v_relations := jsonb_set(
                            v_relations,
                            ARRAY [v_relation_idx],
                            v_relation
                                   );
                END LOOP;

            -- 4. PROCESS INCOMING FOREIGN KEY RELATIONSHIPS (one-to-many)
            -- Find foreign keys from other tables that reference this table
            -- Use system catalogs for cross-schema compatibility
            FOR v_rel_record IN
                SELECT 
                    sn.nspname as source_schema,
                    st.relname as source_table,
                    sa.attname as source_column,
                    ta.attname as target_column
                FROM pg_constraint c
                JOIN pg_class st ON c.conrelid = st.oid
                JOIN pg_namespace sn ON st.relnamespace = sn.oid
                JOIN pg_class tt ON c.confrelid = tt.oid
                JOIN pg_namespace tn ON tt.relnamespace = tn.oid
                JOIN pg_attribute sa ON sa.attrelid = c.conrelid AND sa.attnum = ANY(c.conkey)
                JOIN pg_attribute ta ON ta.attrelid = c.confrelid AND ta.attnum = ANY(c.confkey)
                WHERE tn.nspname = v_table_record.table_schema
                  AND tt.relname = v_table_record.table_name
                  AND c.contype = 'f'
                  -- Avoid duplicating relationships already found in the outgoing scan
                  AND NOT (sn.nspname = v_table_record.table_schema 
                          AND st.relname = v_table_record.table_name)
                LOOP
                    -- Create incoming relation object (one-to-many)
                    v_relation := jsonb_build_object(
                            'source_column', v_rel_record.target_column,  -- This table's column
                            'target_schema', v_rel_record.source_schema,  -- The referencing schema
                            'target_table', v_rel_record.source_table,    -- The referencing table
                            'target_column', v_rel_record.source_column,  -- The referencing column
                            'relation_type', 'one_to_many',               -- Inverse relationship type
                            'display_fields', '[]'::jsonb
                                  );

                    -- Check if relation already exists and preserve custom settings
                    v_existing_rel := NULL;
                    IF jsonb_typeof(v_relations) = 'array' THEN
                        FOR i IN 0..jsonb_array_length(v_relations) - 1
                            LOOP
                                IF (v_relations -> i ->> 'source_column' = v_rel_record.target_column AND
                                    v_relations -> i ->> 'target_table' = v_rel_record.source_table AND
                                    v_relations -> i ->> 'target_schema' = v_rel_record.source_schema) THEN
                                    v_existing_rel := v_relations -> i;
                                    EXIT;
                                END IF;
                            END LOOP;
                    END IF;

                    -- Merge with existing relation config if found
                    IF v_existing_rel IS NOT NULL THEN
                        v_relation := v_relation || v_existing_rel;
                    END IF;

                    -- Convert array index to text for use in jsonb_set
                    v_relation_idx := jsonb_array_length(v_relations)::text;

                    -- Add to relations array
                    v_relations := jsonb_set(
                            v_relations,
                            ARRAY [v_relation_idx],
                            v_relation
                                   );
                END LOOP;

            -- Insert or update table_metadata
            INSERT INTO cms.table_metadata (schema_name,
                                                 table_name,
                                                 display_name,
                                                 columns_config,
                                                 relations_config,
                                                 ui_config)
            VALUES (v_table_record.table_schema,
                    v_table_record.table_name,
                    cms.generate_display_name(v_table_record.table_name),
                    v_columns,
                    v_relations,
                    v_table_config)
            ON CONFLICT (schema_name, table_name) DO UPDATE
                SET
                    -- Preserve existing custom values, fall back to new generated values
                    display_name     = COALESCE(table_metadata.display_name, EXCLUDED.display_name),
                    description      = COALESCE(table_metadata.description, EXCLUDED.description),
                    is_visible       = COALESCE(table_metadata.is_visible, EXCLUDED.is_visible),
                    ordering         = COALESCE(table_metadata.ordering, EXCLUDED.ordering),
                    is_searchable    = COALESCE(table_metadata.is_searchable, EXCLUDED.is_searchable),

                    -- Always update schema-derived configs with new scan data
                    keys_config      = EXCLUDED.keys_config,
                    relations_config = EXCLUDED.relations_config,
                    ui_config        = (
                        -- Merge ui_config: preserve existing custom fields while updating schema-derived fields
                        -- Use EXCLUDED || existing to let existing custom fields override schema defaults
                        CASE
                            WHEN table_metadata.ui_config IS NULL THEN EXCLUDED.ui_config
                            ELSE EXCLUDED.ui_config || table_metadata.ui_config
                            END
                        ),
                    columns_config   = (SELECT jsonb_object_agg(
                                                       column_key,
                                                       CASE
                                                           -- If column exists in both old and new config, merge them
                                                           WHEN table_metadata.columns_config ? column_key THEN
                                                               -- Start with new schema-derived data
                                                               EXCLUDED.columns_config -> column_key ||
                                                                   -- Overlay preserved custom fields from existing config
                                                               jsonb_build_object(
                                                                       'display_name', COALESCE(
                                                                       (table_metadata.columns_config -> column_key ->> 'display_name'),
                                                                       (EXCLUDED.columns_config -> column_key ->> 'display_name')
                                                                                       ),
                                                                       'description', COALESCE(
                                                                               (table_metadata.columns_config -> column_key ->> 'description'),
                                                                               (EXCLUDED.columns_config -> column_key ->> 'description')
                                                                                      ),
                                                                       'is_visible_in_table', COALESCE(
                                                                               (table_metadata.columns_config -> column_key ->> 'is_visible_in_table')::boolean,
                                                                               (EXCLUDED.columns_config -> column_key ->> 'is_visible_in_table')::boolean
                                                                                              ),
                                                                       'is_visible_in_detail', COALESCE(
                                                                               (table_metadata.columns_config -> column_key ->> 'is_visible_in_detail')::boolean,
                                                                               (EXCLUDED.columns_config -> column_key ->> 'is_visible_in_detail')::boolean
                                                                                               ),
                                                                       'is_filterable', COALESCE(
                                                                               (table_metadata.columns_config -> column_key ->> 'is_filterable')::boolean,
                                                                               (EXCLUDED.columns_config -> column_key ->> 'is_filterable')::boolean
                                                                                        ),
                                                                       'is_sortable', COALESCE(
                                                                               (table_metadata.columns_config -> column_key ->> 'is_sortable')::boolean,
                                                                               (EXCLUDED.columns_config -> column_key ->> 'is_sortable')::boolean
                                                                                      ),
                                                                       'is_editable', COALESCE(
                                                                               (table_metadata.columns_config -> column_key ->> 'is_editable')::boolean,
                                                                               (EXCLUDED.columns_config -> column_key ->> 'is_editable')::boolean
                                                                                      )
                                                               )
                                                           -- If column only exists in new config, use it as-is
                                                           ELSE EXCLUDED.columns_config -> column_key
                                                           END
                                               )
                                        FROM jsonb_object_keys(EXCLUDED.columns_config) AS column_key),

                    -- Always update timestamp
                    updated_at       = NOW();
        END LOOP;
END;
$$ LANGUAGE plpgsql;

revoke all on function cms.sync_managed_tables
from
  public;