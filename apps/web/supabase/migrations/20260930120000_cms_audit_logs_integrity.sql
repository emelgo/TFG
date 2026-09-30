/*
 * Integridad del registro de auditoría y endurecimiento de la búsqueda
 * global del CMS (PymeKit, F2.6). Refleja los cambios de los esquemas
 * `47-cms-audit-logs.sql` y `48-cms-global-search.sql`.
 *
 * 1. Auditoría de solo lectura para el personal (pendiente de ADR-015: «el
 *    personal puede insertar entradas de auditoría a su nombre»). El código
 *    heredado concedía INSERT sobre `cms.audit_logs` a `authenticated` con una
 *    política que solo exigía `account_id` propio, así que cualquier miembro
 *    del personal podía fabricar entradas (operación, tabla, datos e incluso
 *    un `user_id` ajeno) y `create_audit_log` era ejecutable por todos. Ahora:
 *      - se retira el INSERT y su política (UPDATE/DELETE nunca se
 *        concedieron);
 *      - se retira el EXECUTE de `create_audit_log`: solo la llaman funciones
 *        `security definer` del CMS (CRUD, *triggers*, acceso al CMS);
 *      - el explorador de usuarios registra sus acciones con
 *        `log_auth_user_action`, que exige el permiso `auth_user`, fija
 *        esquema, tabla y gravedad y toma la atribución de la sesión.
 *
 *    Además, `can_read_audit_log_data` decide si el lector puede ver los datos
 *    de fila de una entrada (la API los redacta si no).
 *
 * 2. `global_search`: añade `verify_admin_access` y `validate_schema_access`
 *    (no busca en esquemas protegidos aunque se pidan), acota texto, límite,
 *    desplazamiento y tiempo, deja de devolver `SQLERRM`, lee las claves
 *    primarias (sin repetidos) de `table_metadata.ui_config` y ordena por
 *    relevancia las coincidencias de cada tabla antes de quedarse con 5.
 *
 * Pruebas: `cms-audit-logs-integrity.test.sql`.
 */

drop policy if exists "insert_cms_audit_logs" on "cms"."audit_logs";

revoke insert on table "cms"."audit_logs" from "authenticated";

revoke all on function cms.create_audit_log (text, text, text, text, jsonb, jsonb, cms.audit_log_severity, jsonb) from public, anon, authenticated;

set check_function_bodies = off;

-- SECTION: CAN READ AUDIT LOG DATA
-- ¿Puede la sesión ver los datos de fila (`old_data`/`new_data`) de una
-- entrada de auditoría sobre `esquema.tabla`?
--
-- `can_read_audit_log` decide qué ENTRADAS se ven (por el rango de quien
-- actuó), pero una entrada guarda la fila completa antes y después del
-- cambio, y esa fila puede ser de una tabla que el lector no puede leer (la
-- cambió alguien de rango inferior con otros permisos). La API del CMS usa
-- esta función para devolver esos datos a `null` (redactados) cuando:
--
--  - esquema `cms`: basta `log:select` (es el rastro del propio CMS, lo que
--    ese permiso autoriza a revisar);
--  - `auth.users`: exige `auth_user:select` (explorador de usuarios);
--  - cualquier otro esquema protegido (`auth`, `vault`, `pg_*`…): nunca;
--  - el resto: permiso `select` sobre la tabla (`has_data_permission`).
--
-- SECURITY INVOKER: solo combina funciones de permisos ya concedidas.
-- [TFG] RNF-02 · PymeKit, F2.6.
create or replace function cms.can_read_audit_log_data (
  p_schema_name text,
  p_table_name text
) returns boolean
language plpgsql
stable
set
  search_path = '' as $$
begin
    if p_schema_name is null or p_table_name is null then
        return false;
    end if;

    if p_schema_name = 'cms' then
        return cms.has_admin_permission('log'::cms.system_resource, 'select'::cms.system_action);
    end if;

    if p_schema_name = 'auth' then
        return p_table_name = 'users'
            and cms.has_admin_permission('auth_user'::cms.system_resource, 'select'::cms.system_action);
    end if;

    return cms.validate_schema_access(p_schema_name)
        and cms.has_data_permission('select'::cms.system_action, p_schema_name, p_table_name);
end;
$$;

comment on function cms.can_read_audit_log_data (text, text) is
  'Indica si la sesión puede ver los datos de fila de una entrada de auditoría sobre esa tabla (si no, la API los redacta)';

grant execute on function cms.can_read_audit_log_data (text, text) to authenticated;

CREATE OR REPLACE FUNCTION cms.log_auth_user_action(p_operation text, p_target text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_action cms.system_action;
    v_log_id uuid;
begin
    if not cms.verify_admin_access() then
        raise exception 'Invalid admin access'
            using errcode = 'insufficient_privilege';
    end if;

    v_action := case p_operation
        when 'create_auth_user' then 'insert'::cms.system_action
        when 'invite_auth_user' then 'insert'::cms.system_action
        when 'ban_user' then 'update'::cms.system_action
        when 'unban_user' then 'update'::cms.system_action
        when 'reset_password' then 'update'::cms.system_action
        when 'send_magic_link' then 'update'::cms.system_action
        when 'remove_mfa_factor' then 'update'::cms.system_action
        when 'delete_auth_user' then 'delete'::cms.system_action
        end;

    if v_action is null then
        raise exception 'Unknown auth user operation'
            using errcode = 'invalid_parameter_value';
    end if;

    if not cms.has_admin_permission('auth_user'::cms.system_resource, v_action) then
        raise exception 'Insufficient permissions'
            using errcode = 'insufficient_privilege';
    end if;

    -- El destino es un UUID o, en una invitación fallida, un correo.
    if p_target is null or length(p_target) = 0 or length(p_target) > 320 then
        raise exception 'Invalid target'
            using errcode = 'invalid_parameter_value';
    end if;

    -- Detalles acotados: un objeto pequeño, no un volcado arbitrario.
    if p_details is not null
        and (jsonb_typeof(p_details) <> 'object' or pg_column_size(p_details) > 4096) then
        raise exception 'Invalid details'
            using errcode = 'invalid_parameter_value';
    end if;

    insert into cms.audit_logs (account_id,
                                user_id,
                                operation,
                                schema_name,
                                table_name,
                                record_id,
                                old_data,
                                new_data,
                                severity,
                                metadata)
    values (cms.get_current_user_account_id(),
            auth.uid(),
            p_operation,
            'auth',
            'users',
            p_target,
            null,
            -- La operación va al final para que los detalles no la suplanten.
            coalesce(p_details, '{}'::jsonb) || jsonb_build_object('operation', p_operation),
            'info'::cms.audit_log_severity,
            jsonb_build_object('operation_type', 'auth_user_management'))
    returning id into v_log_id;

    return v_log_id;
end;
$function$
;

comment on function cms.log_auth_user_action (text, text, jsonb) is
  'Registra en la auditoría una acción del explorador de usuarios, a nombre de la sesión y con el permiso auth_user correspondiente';

grant execute on function cms.log_auth_user_action (text, text, jsonb) to authenticated;

CREATE OR REPLACE FUNCTION cms.global_search(p_query_text text, p_limit_val integer DEFAULT 10, p_offset_val integer DEFAULT 0, p_schema_filter text[] DEFAULT ARRAY['public'::text], p_table_filter text[] DEFAULT NULL::text[], p_timeout_seconds integer DEFAULT 15)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
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
$function$
;
