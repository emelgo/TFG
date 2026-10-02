/*
 * Endurecimiento del CMS tras la revisión `/rls-review` de la F2.6 (PymeKit).
 * Refleja los cambios de los esquemas `23-cms-auth.sql`,
 * `46-cms-crud-functions.sql`, `47-cms-audit-logs.sql` y
 * `48-cms-global-search.sql`. La revisión concluyó que el aislamiento entre
 * cuentas se mantenía (veredicto ISOLATED), pero señaló cuatro debilidades de
 * defensa en profundidad que se corrigen aquí:
 *
 * W1 · Redacción de la auditoría en la base de datos (bitácora B-31).
 *      `record_id`, `old_data` y `new_data` solo se redactaban en la API
 *      (`readLogs`): con SQL directo, cualquier lector con rango suficiente
 *      leía los datos de filas de tablas que no puede consultar. Ahora
 *      `authenticated` tiene SELECT por columnas (sin esas tres) y la lectura
 *      va por la vista `cms.audit_logs_readable` (`security_invoker`), que
 *      obtiene los datos con `cms.get_audit_log_row_data` ya redactados.
 *
 * W2 · Tiempo máximo de la búsqueda global (bitácora B-32). El
 *      `SET LOCAL statement_timeout` interno no reiniciaba el temporizador de
 *      la sentencia en curso y, por la salida de error, dejaba el límite de
 *      la búsqueda activo en la transacción del llamante. Se elimina: la API
 *      fija el límite en su transacción antes de llamar. Además se escapan
 *      los comodines de LIKE del texto buscado.
 *
 * W3 · Avisos con texto interno (bitácora B-33). `RAISE WARNING … SQLERRM`
 *      enviaba el mensaje de PostgreSQL al cliente como aviso del protocolo
 *      (`global_search`, `insert_record`, `_update_record_impl`,
 *      `_delete_record_impl`, y el valor de `requires_mfa` en
 *      `verify_admin_access`). Pasa a `RAISE LOG`, que solo llega al log del
 *      servidor.
 *
 * W4 · MFA con `requires_mfa = 'false'` (bitácora B-34).
 *      `verify_admin_access` aceptaba a un usuario con factor verificado y
 *      sesión aal1. Ahora exige también `cms.is_mfa_compliant()`.
 *
 * Nada es destructivo: las funciones se redefinen con `create or replace` y
 * la vista y la función de lectura son nuevas.
 *
 * Nota: `supabase db diff` (migra) no compara los privilegios por columna ni
 * las opciones de las vistas (`security_invoker`), así que no los detectaría
 * si faltaran. Los comprueba `cms-hardening-f26.test.sql`.
 *
 * [TFG] RNF-02 · ADR-015. Pruebas: `cms-hardening-f26.test.sql`.
 */

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- W4 (y W3) · cms.verify_admin_access: MFA coherente y sin avisos al cliente
-- ---------------------------------------------------------------------------

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

    -- [TFG] RNF-02 · Endurecimiento F2.6 (bitácora B-34). Quien tiene un factor
    -- MFA verificado tiene que haber entrado con él (aal2), valga lo que valga
    -- `requires_mfa`. Antes, con `requires_mfa = 'false'`, un usuario con
    -- factor y sesión aal1 (solo contraseña) pasaba esta comprobación: las
    -- políticas RESTRICTIVE de las tablas le ocultaban las filas, pero las
    -- funciones `security definer` que confían en esta función (búsqueda
    -- global, escrituras del explorador, auditoría…) seguían adelante. Es la
    -- misma regla que `cms.is_mfa_compliant()` aplica en las políticas, ahora
    -- también en el punto de control común.
    if not cms.is_mfa_compliant() then
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
        -- Valor sospechoso: se anota solo en el log del servidor (`raise log`).
        -- Un `raise warning` llegaría al cliente como aviso del protocolo con
        -- un dato de configuración interno (bitácora B-33).
        raise log 'Invalid requires_mfa configuration value: %', requires_mfa;
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

-- ---------------------------------------------------------------------------
-- W1 · Datos de fila de la auditoría: redactados en la base de datos
-- ---------------------------------------------------------------------------

-- [TFG] RNF-02 · El SELECT pasa a concederse por columnas, sin `record_id`,
-- `old_data` ni `new_data` (ver `47-cms-audit-logs.sql`). Revocar el SELECT de
-- tabla no toca los *grants* de columna, así que el orden es seguro.
revoke select on table "cms"."audit_logs" from "authenticated";

grant
select
  (
    id,
    created_at,
    account_id,
    user_id,
    operation,
    schema_name,
    table_name,
    severity,
    metadata
  ) on cms.audit_logs to authenticated;

-- El comentario de la función de redacción cambia: ahora la usa también la
-- vista (el cuerpo no cambia).
comment on function cms.can_read_audit_log_data (text, text) is
  'Indica si la sesión puede ver los datos de fila de una entrada de auditoría sobre esa tabla (si no, la vista cms.audit_logs_readable y la API los redactan)';

-- SECTION: AUDIT LOG ROW DATA (lectura redactada)
-- [TFG] RNF-02 · Redacción de los datos de fila en la base de datos
-- (bitácora B-31, endurecimiento F2.6).
--
-- Devuelve `record_id`, `old_data` y `new_data` de UNA entrada, o `null` en
-- los tres (con `data_redacted = true`) si la sesión no puede ver los datos
-- de esa tabla (`cms.can_read_audit_log_data`).
--
-- Es SECURITY DEFINER porque `authenticated` ya no tiene SELECT sobre esas
-- tres columnas (ver los *grants*): la función las lee como propietaria de
-- la tabla. Como cualquiera con EXECUTE puede llamarla con un id arbitrario,
-- repite ella misma las dos políticas de la tabla antes de devolver nada:
--
--  - `cms.is_mfa_compliant()` (política RESTRICTIVE `restrict_mfa_audit_logs`);
--  - `cms.can_read_audit_log(account_id)` (política `select_cms_audit_logs`:
--    acceso vigente, `log:select` y jerarquía de rangos).
--
-- Si la entrada no existe o no es visible, no devuelve ninguna fila: ni los
-- datos ni la pista de que la entrada existe. `auth.uid()` y los *claims*
-- siguen siendo los de la petición dentro de la función, así que todas las
-- comprobaciones se hacen para el usuario real.
create or replace function cms.get_audit_log_row_data (p_log_id uuid) returns table (
  record_id text,
  old_data jsonb,
  new_data jsonb,
  data_redacted boolean
) language plpgsql stable security definer
-- Siempre devuelve como mucho una fila y es cara (varias comprobaciones de
-- permisos): con `rows 1` y un coste alto, el planificador ordena y limita la
-- página de la vista ANTES de llamarla, así que solo se evalúa para las filas
-- que se devuelven y no para todo el registro.
rows 1
cost 1000
set
  search_path = '' as $$
declare
    v_log cms.audit_logs%rowtype;
begin
    select *
    into v_log
    from cms.audit_logs a
    where a.id = p_log_id;

    if not found then
        return;
    end if;

    if not cms.is_mfa_compliant() or not cms.can_read_audit_log(v_log.account_id) then
        return;
    end if;

    if cms.can_read_audit_log_data(v_log.schema_name, v_log.table_name) then
        return query select v_log.record_id, v_log.old_data, v_log.new_data, false;
    else
        return query select null::text,
                            null::jsonb,
                            null::jsonb,
                            (v_log.record_id is not null
                                or v_log.old_data is not null
                                or v_log.new_data is not null);
    end if;
end;
$$;

comment on function cms.get_audit_log_row_data (uuid) is
  'Datos de fila (record_id, old_data, new_data) de una entrada de auditoría visible para la sesión, redactados si no puede leer la tabla auditada';

-- Solo el personal del CMS (y el servidor) la ejecuta; `anon` nunca.
revoke all on function cms.get_audit_log_row_data (uuid) from public, anon;

grant execute on function cms.get_audit_log_row_data (uuid) to authenticated, service_role;

-- Vista de lectura del registro de auditoría: las columnas de la tabla, con
-- los datos de fila ya redactados por `get_audit_log_row_data`.
--
-- `security_invoker = true`: la vista se evalúa con los permisos de quien la
-- consulta, así que las políticas RLS de `cms.audit_logs` (rango y MFA) se
-- siguen aplicando para decidir qué entradas aparecen. La vista no lee las
-- columnas protegidas de la tabla; solo la función, y únicamente para las
-- filas que el lector ya puede ver. Es la ruta de lectura que usa la API del
-- CMS (`packages/cms/audit-logs`).
create or replace view cms.audit_logs_readable
with
  (security_invoker = true) as
select
  a.id,
  a.created_at,
  a.account_id,
  a.user_id,
  a.operation,
  a.schema_name,
  a.table_name,
  d.record_id,
  d.old_data,
  d.new_data,
  coalesce(d.data_redacted, false) as data_redacted,
  a.severity,
  a.metadata
from
  cms.audit_logs a
  left join lateral cms.get_audit_log_row_data (a.id) d on true;

comment on view cms.audit_logs_readable is
  'Registro de auditoría con los datos de fila redactados según los permisos del lector (lectura del CMS)';

-- Solo lectura, y solo para quien ya puede leer la tabla. `anon` no recibe
-- nada (los valores por defecto de Supabase le concederían todo).
revoke all on cms.audit_logs_readable from anon, authenticated, service_role;

grant select on cms.audit_logs_readable to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- W2 y W3 · cms.global_search: sin statement_timeout interno, sin avisos con
-- SQLERRM y con los comodines de LIKE escapados
-- ---------------------------------------------------------------------------

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
    -- Texto con los comodines de LIKE escapados (ver más abajo).
    v_query_like TEXT;
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

    -- Sin `SET LOCAL statement_timeout` aquí: no reiniciaría el temporizador
    -- de la sentencia en curso y podría quedarse activo en la transacción del
    -- llamante. El límite lo fija la API antes de llamar (ver la cabecera).

    -- En un patrón LIKE, `%` y `_` son comodines y `\` es el carácter de
    -- escape por defecto. Se escapan (primero la barra) para que el texto del
    -- usuario se busque literalmente.
    v_query_like := replace(replace(replace(p_query_text, '\', '\\'), '%', '\%'), '_', '\_');

    -- Split search query into terms for better matching (ya escapados: el
    -- escape no contiene espacios, así que no altera la división).
    search_terms := regexp_split_to_array(lower(v_query_like), '\s+');

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
                WHEN tm.table_name ILIKE '%' || v_query_like || '%' THEN 0
                WHEN tm.display_name ILIKE '%' || v_query_like || '%' THEN 1
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
                display_column, v_query_like,
                display_column, v_query_like || '%'
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
    -- Un tiempo agotado (`query_canceled`) no se captura: `WHEN OTHERS` no lo
    -- incluye, así que llega a la API como error y esta responde con un
    -- código estable en vez de devolver una lista vacía engañosa.
    BEGIN
        EXECUTE final_sql INTO final_results, total_count;
    EXCEPTION
        WHEN OTHERS THEN
            -- `RAISE LOG`: el detalle solo va al log del servidor. Al
            -- llamante no le llega el texto de PostgreSQL (nombres de tablas
            -- o columnas), ni en la respuesta ni como aviso del protocolo.
            RAISE LOG 'Global search failed: %. SQLSTATE: %', SQLERRM, SQLSTATE;
            RETURN jsonb_build_object('results', '[]'::jsonb, 'total', 0, 'error', 'search_failed');
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
        -- Solo al log del servidor (ver el bloque anterior).
        RAISE LOG 'Global search failed: %. SQLSTATE: %', SQLERRM, SQLSTATE;
        RETURN jsonb_build_object(
            'results', '[]'::jsonb, 'total', 0, 'error', 'search_failed'
        );
END;
$$;

-- ---------------------------------------------------------------------------
-- W3 · Escrituras del explorador: el fallo al auditar va al log, no al cliente
-- ---------------------------------------------------------------------------

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
            -- [TFG] RNF-02 · `RAISE LOG` y no `WARNING` (bitácora B-33): un
            -- aviso llega al cliente con el texto interno de PostgreSQL; el
            -- log solo lo ve quien administra el servidor.
            RAISE LOG 'Failed to log insert operation: %', SQLERRM;
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
            -- [TFG] RNF-02 · `RAISE LOG` y no `WARNING` (bitácora B-33): un
            -- aviso llega al cliente con el texto interno de PostgreSQL; el
            -- log solo lo ve quien administra el servidor.
            RAISE LOG 'Failed to log update operation: %', SQLERRM;
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

    -- Add audit log entry
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
            -- Don't fail the operation if audit logging fails
            -- [TFG] RNF-02 · `RAISE LOG` y no `WARNING` (bitácora B-33): un
            -- aviso llega al cliente con el texto interno de PostgreSQL; el
            -- log solo lo ve quien administra el servidor.
            RAISE LOG 'Failed to log delete operation: %', SQLERRM;
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
