-- SECTION: GLOBAL SEARCH
-- Búsqueda global del CMS (paleta Cmd/Ctrl+K): busca un texto en las columnas
-- de todas las tablas marcadas como buscables y devuelve las filas que
-- coinciden, agrupables por tabla.
--
-- Es SECURITY DEFINER (con `row_security = off`) porque tiene que leer las
-- tablas de la aplicación, igual que `query_table`. Por eso aplica las mismas
-- barreras que ella antes de construir ninguna consulta:
--
--  - `verify_admin_access()` (claim, cuenta activa y MFA);
--  - `validate_schema_access()` sobre cada tabla: nunca busca en esquemas
--    protegidos (`auth`, `vault`, `cms`, `pg_*`…) aunque el llamante pase ese
--    esquema en `p_schema_filter` o tenga un permiso comodín como Root;
--  - `has_data_permission('select')` por tabla: solo entran las tablas que el
--    usuario puede leer.
--
-- Todos los valores del usuario entran en el SQL dinámico con `format(%L)` o
-- `%I` (literal o identificador escapado), nunca concatenados.
--
-- [TFG] RNF-02 · Endurecimiento de PymeKit (F2.6) sobre la función heredada:
-- faltaban `verify_admin_access` y `validate_schema_access` (con un permiso
-- comodín, `p_schema_filter => array['auth']` devolvía filas de `auth.users`),
-- el límite, el desplazamiento y el tiempo máximo no tenían tope, el texto
-- tampoco, y ante un error devolvía `SQLERRM` al llamante. Además las claves
-- primarias se leían de un sitio que no existe (`columns_config.ui_config`),
-- así que las tablas sin columna `id` no tenían enlace, y cada tabla aportaba
-- sus 5 primeras coincidencias sin ordenar por relevancia, de modo que una
-- coincidencia exacta podía quedarse fuera.
CREATE OR REPLACE FUNCTION cms.global_search (
  p_query_text TEXT,
  p_limit_val INT DEFAULT 10,
  p_offset_val INT DEFAULT 0,
  p_schema_filter TEXT[] DEFAULT ARRAY['public'],
  p_table_filter TEXT[] DEFAULT NULL,
  p_timeout_seconds INT DEFAULT 15
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET
  row_security = OFF
SET
  search_path = '' AS $$
DECLARE
    result JSONB;
    search_terms TEXT[];
    v_original_timeout TEXT;
    v_search_start_time TIMESTAMPTZ;
    v_elapsed_seconds NUMERIC;
    table_metadata RECORD;
    union_queries TEXT[] := '{}';
    final_sql TEXT;
    total_count BIGINT;
    final_results JSONB;
    tables_searched_count INT := 0;
BEGIN
    -- Record start time for performance monitoring
    v_search_start_time := clock_timestamp();

    -- Textos vacíos, de una letra o desmesurados no se buscan (un texto
    -- enorme multiplica el coste de cada ILIKE en todas las tablas).
    IF p_query_text IS NULL OR length(p_query_text) < 2 OR length(p_query_text) > 200 THEN
        RETURN jsonb_build_object('results', '[]'::jsonb, 'total', 0);
    END IF;

    -- Sin acceso vigente al CMS no se busca nada (falla en cerrado).
    IF NOT cms.verify_admin_access() THEN
        RETURN jsonb_build_object('results', '[]'::jsonb, 'total', 0);
    END IF;

    -- Topes: como mucho 50 resultados por página, un desplazamiento
    -- razonable y nunca más de 15 s de consulta, pida lo que pida el llamante.
    p_limit_val := least(greatest(coalesce(p_limit_val, 10), 1), 50);
    p_offset_val := least(greatest(coalesce(p_offset_val, 0), 0), 1000);
    p_timeout_seconds := least(greatest(coalesce(p_timeout_seconds, 15), 1), 15);

    -- Store original timeout and set protective timeout
    BEGIN
        SHOW statement_timeout INTO v_original_timeout;
    EXCEPTION
        WHEN OTHERS THEN
            v_original_timeout := '0';
    END;

    EXECUTE format('SET LOCAL statement_timeout = %L', p_timeout_seconds * 1000 || 'ms');

    -- Split search query into terms for better matching
    search_terms := regexp_split_to_array(lower(p_query_text), '\s+');

    -- =================================================================
    -- OPTIMIZATION: Build a single UNION ALL query instead of looping
    -- =================================================================

    -- Step 1: Gather all searchable tables and their configurations at once.
    -- This loop does NOT execute queries, it only builds the query string fragments.
    FOR table_metadata IN
        SELECT
            tm.schema_name,
            tm.table_name,
            tm.display_name,
            tm.columns_config,
            tm.ui_config
        FROM cms.table_metadata tm
        WHERE
            tm.is_searchable = TRUE
            AND (p_schema_filter IS NULL OR tm.schema_name = ANY (p_schema_filter))
            AND (p_table_filter IS NULL OR tm.table_name = ANY (p_table_filter))
            -- Nunca esquemas protegidos, aunque haya metadatos y permiso comodín.
            AND cms.validate_schema_access(tm.schema_name)
            -- Solo tablas que el usuario puede leer (antes de construir nada).
            AND cms.has_data_permission('select'::cms.system_action, tm.schema_name, tm.table_name)
            AND tm.columns_config IS NOT NULL
            AND jsonb_typeof(tm.columns_config) = 'object'
        -- Order the tables to prioritize better matches first, just like the original cursor.
        ORDER BY
            CASE
                WHEN tm.table_name ILIKE '%' || p_query_text || '%' THEN 0
                WHEN tm.display_name ILIKE '%' || p_query_text || '%' THEN 1
                ELSE 2
            END,
            tm.ordering NULLS LAST,
            tm.schema_name,
            tm.table_name
        -- Limit the number of tables to prevent creating a monstrously large query.
        LIMIT 20
    LOOP
        -- Step 2: For each table, construct its part of the UNION ALL query.
        DECLARE
            display_column TEXT;
            display_column_fallbacks TEXT[] := '{name,title,label,username,email,description,id}';
            where_clause TEXT;
            score_sql TEXT;
            searchable_cols TEXT[];
            primary_key_columns TEXT[] := '{}';
            col_name TEXT;
            col_keys TEXT[];
            pk_col JSONB;
            term TEXT;
            where_conditions TEXT[] := '{}';
        BEGIN
            -- Extract column names from columns_config
            col_keys := ARRAY(SELECT k FROM jsonb_object_keys(table_metadata.columns_config) AS k);

            -- Claves primarias (para el enlace a la ficha): viven en la columna
            -- `ui_config` de `table_metadata`.
            IF jsonb_typeof(table_metadata.ui_config -> 'primary_keys') = 'array' THEN
                FOR pk_col IN SELECT *
                              FROM jsonb_array_elements(table_metadata.ui_config -> 'primary_keys')
                LOOP
                    -- Sin repetidos: `ui_config` puede listar dos veces la misma.
                    IF NOT (pk_col ->> 'column_name') = ANY (primary_key_columns) THEN
                        primary_key_columns := array_append(primary_key_columns, pk_col ->> 'column_name');
                    END IF;
                END LOOP;
            END IF;
            IF array_length(primary_key_columns, 1) IS NULL THEN
                primary_key_columns := ARRAY['id'];
            END IF;

            -- Find best display column
            FOREACH col_name IN ARRAY display_column_fallbacks LOOP
                IF col_name = ANY(col_keys) THEN
                    display_column := col_name;
                    EXIT;
                END IF;
            END LOOP;
            display_column := COALESCE(display_column, col_keys[1], 'id');

            -- Collect searchable columns
            searchable_cols := ARRAY(
                SELECT key
                FROM jsonb_object_keys(table_metadata.columns_config) key
                WHERE table_metadata.columns_config->key->>'is_searchable' IS DISTINCT FROM 'false'
            );

            IF array_length(searchable_cols, 1) IS NULL THEN
                CONTINUE; -- Skip table if no columns are searchable
            END IF;

            -- Build WHERE clause for this specific table
            FOREACH term IN ARRAY search_terms LOOP
                IF term = '' THEN CONTINUE; END IF;
                DECLARE
                    term_clauses TEXT[] := '{}';
                BEGIN
                    FOREACH col_name IN ARRAY searchable_cols LOOP
                        term_clauses := array_append(term_clauses, format('%I::text ILIKE %L', col_name, '%' || term || '%'));
                    END LOOP;
                    where_conditions := array_append(where_conditions, '(' || array_to_string(term_clauses, ' OR ') || ')');
                END;
            END LOOP;

            IF array_length(where_conditions, 1) = 0 THEN
                CONTINUE; -- No valid search terms, skip table
            END IF;
            where_clause := array_to_string(where_conditions, ' AND ');


            -- Build score calculation
            score_sql := format(
                '(CASE WHEN %I::text ILIKE %L THEN 100.0 WHEN %I::text ILIKE %L THEN 50.0 ELSE 1.0 END)',
                display_column, p_query_text,
                display_column, p_query_text || '%'
            );

            -- Construct the SELECT statement for this table and add it to our array of queries
            union_queries := array_append(union_queries, format(
                $subquery$
                (SELECT
                    %L AS schema_name,
                    %L AS table_name,
                    %L AS table_display,
                    %L::text[] AS primary_keys,
                    %I::text AS title,
                    %s AS rank,
                    to_jsonb(t.*) AS record,
                    jsonb_build_object('schema', %L, 'table', %L, 'id', to_jsonb(t.*)->%L) as url_params
                FROM %I.%I t
                WHERE %s
                ORDER BY rank DESC
                LIMIT 5)
                $subquery$,
                table_metadata.schema_name,
                table_metadata.table_name,
                COALESCE(table_metadata.display_name, table_metadata.table_name),
                primary_key_columns,
                display_column,
                score_sql,
                table_metadata.schema_name,
                table_metadata.table_name,
                primary_key_columns[1],
                table_metadata.schema_name,
                table_metadata.table_name,
                where_clause
            ));
        END;
    END LOOP;

    tables_searched_count := array_length(union_queries, 1);

    -- If no searchable tables were found, exit early.
    IF tables_searched_count IS NULL OR tables_searched_count = 0 THEN
        RETURN jsonb_build_object(
            'results', '[]'::jsonb, 'total', 0, 'tables_count', 0, 'tables_searched', 0,
            'query', p_query_text, 'has_more', false
        );
    END IF;

    -- Step 3: Combine all subqueries into one large query with a final aggregation, ordering, and pagination.
    final_sql := format(
        $finalquery$
        WITH all_results AS (
            %s
        ),
        counted_results AS (
            SELECT *, COUNT(*) OVER() as full_count FROM all_results
        ),
        paginated_results AS (
            SELECT *
            FROM counted_results
            ORDER BY rank DESC, title ASC
            LIMIT %s OFFSET %s
        )
        SELECT
            (SELECT COALESCE(jsonb_agg(pr), '[]'::jsonb) FROM (SELECT schema_name, table_name, table_display, title, rank, primary_keys, record, url_params FROM paginated_results) pr),
            (SELECT full_count FROM counted_results LIMIT 1)
        $finalquery$,
        array_to_string(union_queries, ' UNION ALL '),
        p_limit_val,
        p_offset_val
    );

    -- Step 4: Execute the single, powerful query.
    BEGIN
        EXECUTE final_sql INTO final_results, total_count;
    EXCEPTION
        WHEN query_canceled THEN
            RAISE WARNING 'Global search query timed out.';
            final_results := '[]'::jsonb;
            total_count := 0;
        WHEN OTHERS THEN
            -- El detalle solo va al log del servidor: al llamante nunca le
            -- llega el texto de PostgreSQL (nombres de tablas o columnas).
            RAISE WARNING 'Global search failed: %. SQLSTATE: %', SQLERRM, SQLSTATE;
            RETURN jsonb_build_object('results', '[]'::jsonb, 'total', 0, 'error', 'search_failed');
    END;

    -- Reset timeout to original value
    BEGIN
        IF v_original_timeout IS NOT NULL AND v_original_timeout != '0' THEN
            EXECUTE format('SET LOCAL statement_timeout = %L', v_original_timeout);
        ELSE
            RESET statement_timeout;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not reset statement_timeout: %', SQLERRM;
    END;

    -- Calculate final elapsed time
    v_elapsed_seconds := EXTRACT(EPOCH FROM (clock_timestamp() - v_search_start_time));

    -- Build the final result with performance metrics
    result := jsonb_build_object(
        'results', COALESCE(final_results, '[]'::jsonb),
        'total', COALESCE(total_count, 0),
        'tables_count', tables_searched_count,
        'tables_searched', tables_searched_count,
        'query', p_query_text,
        'has_more', COALESCE(total_count, 0) > (p_limit_val + p_offset_val),
        'performance', jsonb_build_object(
            'elapsed_seconds', round(v_elapsed_seconds, 3),
            'timeout_seconds', p_timeout_seconds,
            'timed_out', v_elapsed_seconds >= p_timeout_seconds
        )
    );

    RETURN result;

EXCEPTION
    WHEN OTHERS THEN
        -- Ensure timeout is reset even on error
        BEGIN
            IF v_original_timeout IS NOT NULL AND v_original_timeout != '0' THEN
                EXECUTE format('SET LOCAL statement_timeout = %L', v_original_timeout);
            ELSE
                RESET statement_timeout;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Emergency timeout reset failed: %', SQLERRM;
        END;
        RAISE WARNING 'Global search failed: %. SQLSTATE: %', SQLERRM, SQLSTATE;
        RETURN jsonb_build_object(
            'results', '[]'::jsonb, 'total', 0, 'error', 'search_failed'
        );
END;
$$;

-- Grant permissions to the global search function
grant
execute on function cms.global_search to authenticated;