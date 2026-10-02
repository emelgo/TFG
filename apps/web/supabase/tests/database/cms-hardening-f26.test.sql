-- Pruebas de regresión del endurecimiento del CMS tras la revisión
-- `/rls-review` de la F2.6 (migración 20260930130000_cms_hardening_f26).
--
--  W1 · Los datos de fila de la auditoría (`record_id`, `old_data`,
--       `new_data`) se redactan en la BASE DE DATOS: `authenticated` no puede
--       leer esas columnas de `cms.audit_logs` y la vista
--       `cms.audit_logs_readable` las devuelve a `null` si el lector no puede
--       consultar la tabla auditada (se mantiene el filtro por rango).
--  W2 · `cms.global_search` no toca `statement_timeout`: el del llamante
--       queda igual (también por la salida de error), y el límite que fija la
--       API en su transacción cancela de verdad una búsqueda lenta.
--  W3 · Ninguna función del esquema `cms` envía `SQLERRM` al cliente como
--       aviso (`RAISE WARNING/NOTICE/INFO`).
--  W4 · Con `requires_mfa = 'false'`, un usuario con factor verificado y
--       sesión aal1 no pasa `verify_admin_access` (ni busca, ni lee datos de
--       auditoría).
--  Además, la búsqueda escapa los comodines de LIKE (`%`, `_`).
--
-- [TFG] RNF-02 · ADR-015 · bitácora B-31 a B-34.

begin;

select plan(38);

-- Las pruebas funcionales desactivan el MFA obligatorio (como el resto de
-- ficheros `cms-*`); W4 prueba justo lo que pasa en ese modo.
update cms.configuration set value = 'false' where key = 'requires_mfa';

-- ---------------------------------------------------------------------------
-- Preparación (como `postgres`, sin RLS)
-- ---------------------------------------------------------------------------

select cms_tests.create_supabase_user(cms_tests.test_uuid(26001), 'hf26_reader', 'reader@hf26.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(26002), 'hf26_full', 'full@hf26.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(26003), 'hf26_writer', 'writer@hf26.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(26004), 'hf26_high', 'high@hf26.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(26005), 'hf26_mfa', 'mfa@hf26.test');

insert into cms.accounts (id, auth_user_id, is_active) values
    (cms_tests.test_uuid(26101), cms_tests.test_uuid(26001), true),
    (cms_tests.test_uuid(26102), cms_tests.test_uuid(26002), true),
    (cms_tests.test_uuid(26103), cms_tests.test_uuid(26003), true),
    (cms_tests.test_uuid(26104), cms_tests.test_uuid(26004), true),
    (cms_tests.test_uuid(26105), cms_tests.test_uuid(26005), true);

-- Rangos: el lector y el completo superan al que escribió la entrada, pero
-- no al de rango alto.
insert into cms.roles (id, name, rank, description) values
    (cms_tests.test_uuid(26201), 'HF26 reader', 31, 'log:select, sin permiso de tabla'),
    (cms_tests.test_uuid(26202), 'HF26 full', 32, 'log:select + select en las tablas de prueba'),
    (cms_tests.test_uuid(26203), 'HF26 writer', 21, 'autor de la entrada'),
    (cms_tests.test_uuid(26204), 'HF26 high', 91, 'rango superior'),
    (cms_tests.test_uuid(26205), 'HF26 mfa', 33, 'como full, con factor MFA');

insert into cms.account_roles (account_id, role_id) values
    (cms_tests.test_uuid(26101), cms_tests.test_uuid(26201)),
    (cms_tests.test_uuid(26102), cms_tests.test_uuid(26202)),
    (cms_tests.test_uuid(26103), cms_tests.test_uuid(26203)),
    (cms_tests.test_uuid(26104), cms_tests.test_uuid(26204)),
    (cms_tests.test_uuid(26105), cms_tests.test_uuid(26205));

insert into cms.permissions (id, name, permission_type, system_resource, scope, schema_name, table_name, action) values
    (cms_tests.test_uuid(26301), 'hf26_log_select', 'system', 'log', null, null, null, 'select'),
    (cms_tests.test_uuid(26302), 'hf26_items_select', 'data', null, 'table', 'public', 'hf26_items', 'select'),
    (cms_tests.test_uuid(26303), 'hf26_broken_select', 'data', null, 'table', 'public', 'hf26_broken', 'select'),
    (cms_tests.test_uuid(26304), 'hf26_slow_select', 'data', null, 'table', 'public', 'hf26_slow', 'select');

insert into cms.role_permissions (role_id, permission_id) values
    (cms_tests.test_uuid(26201), cms_tests.test_uuid(26301)),
    (cms_tests.test_uuid(26202), cms_tests.test_uuid(26301)),
    (cms_tests.test_uuid(26202), cms_tests.test_uuid(26302)),
    (cms_tests.test_uuid(26202), cms_tests.test_uuid(26303)),
    (cms_tests.test_uuid(26202), cms_tests.test_uuid(26304)),
    (cms_tests.test_uuid(26205), cms_tests.test_uuid(26301)),
    (cms_tests.test_uuid(26205), cms_tests.test_uuid(26302));

-- Tablas buscables:
--  - hf26_items: datos normales, con `%` y `_` literales;
--  - hf26_broken: su metadato declara una columna que no existe (fuerza la
--    salida de error `WHEN OTHERS … RETURN` de la búsqueda);
--  - hf26_slow: una vista que tarda 3 s en responder.
create table public.hf26_items (id text primary key, name text not null);
create table public.hf26_broken (id text primary key);
create view public.hf26_slow as
    select 'slow-1'::text as id, 'hf26 slow needle'::text as name
    from pg_sleep(3);

insert into public.hf26_items (id, name) values
    ('i-1', 'hf26 abc item'),
    ('i-2', 'hf26 50% off'),
    ('i-3', 'hf26 under_score');

insert into cms.table_metadata (schema_name, table_name, display_name, is_searchable, is_visible, columns_config, ui_config)
values
    ('public', 'hf26_items', 'HF26 items', true, true,
     '{"id": {"name": "id", "is_searchable": false}, "name": {"name": "name", "is_searchable": true}}'::jsonb,
     '{"primary_keys": [{"column_name": "id"}]}'::jsonb),
    ('public', 'hf26_broken', 'HF26 broken', true, true,
     '{"id": {"name": "id", "is_searchable": false}, "ghost": {"name": "ghost", "is_searchable": true}}'::jsonb,
     '{"primary_keys": [{"column_name": "id"}]}'::jsonb),
    ('public', 'hf26_slow', 'HF26 slow', true, true,
     '{"id": {"name": "id", "is_searchable": false}, "name": {"name": "name", "is_searchable": true}}'::jsonb,
     '{"primary_keys": [{"column_name": "id"}]}'::jsonb);

-- Entradas de auditoría sobre hf26_items: una del autor de rango bajo (la ven
-- el lector y el completo) y otra del de rango alto (no la ve ninguno).
insert into cms.audit_logs (id, account_id, user_id, operation, schema_name, table_name, record_id, old_data, new_data, severity)
values
    (cms_tests.test_uuid(26401), cms_tests.test_uuid(26103), cms_tests.test_uuid(26003), 'UPDATE',
     'public', 'hf26_items', 'i-1', '{"secret": "old-secret"}'::jsonb, '{"secret": "new-secret"}'::jsonb, 'info'),
    (cms_tests.test_uuid(26402), cms_tests.test_uuid(26104), cms_tests.test_uuid(26004), 'UPDATE',
     'public', 'hf26_items', 'i-2', '{"secret": "high-old"}'::jsonb, '{"secret": "high-new"}'::jsonb, 'info');

-- Devuelve true si la búsqueda se cancela por tiempo. `query_canceled` no lo
-- captura `WHEN OTHERS` (ni el de pgTAP), así que se captura por su nombre.
create function pg_temp.hf26_search_is_canceled(p_query text) returns boolean
language plpgsql as $$
begin
    perform cms.global_search(p_query, 10, 0, array['public'], array['hf26_slow']);
    return false;
exception
    when query_canceled then
        return true;
end;
$$;

grant execute on function pg_temp.hf26_search_is_canceled(text) to authenticated;

-- ---------------------------------------------------------------------------
-- W1 · Privilegios: los datos de fila no se leen de la tabla
-- ---------------------------------------------------------------------------

select ok(
    not has_column_privilege('authenticated', 'cms.audit_logs', 'record_id', 'SELECT')
    and not has_column_privilege('authenticated', 'cms.audit_logs', 'old_data', 'SELECT')
    and not has_column_privilege('authenticated', 'cms.audit_logs', 'new_data', 'SELECT'),
    'W1: authenticated no tiene SELECT sobre record_id, old_data ni new_data');

select ok(
    has_column_privilege('authenticated', 'cms.audit_logs', 'operation', 'SELECT')
    and has_column_privilege('authenticated', 'cms.audit_logs', 'account_id', 'SELECT')
    and not has_table_privilege('authenticated', 'cms.audit_logs', 'SELECT'),
    'W1: el SELECT es por columnas (atribución y operación sí; tabla completa no)');

select ok(
    has_table_privilege('authenticated', 'cms.audit_logs_readable', 'SELECT')
    and not has_table_privilege('anon', 'cms.audit_logs_readable', 'SELECT')
    and not has_table_privilege('authenticated', 'cms.audit_logs_readable', 'INSERT'),
    'W1: la vista de lectura es solo SELECT y solo para authenticated');

select ok(
    (select 'security_invoker=true' = any (reloptions) from pg_class
     where oid = 'cms.audit_logs_readable'::regclass),
    'W1: la vista es security_invoker (RLS de la tabla con la identidad del lector)');

select ok(
    not has_function_privilege('anon', 'cms.get_audit_log_row_data(uuid)', 'EXECUTE'),
    'W1: anon no puede ejecutar get_audit_log_row_data');

-- ---------------------------------------------------------------------------
-- W1 · Lector con rango suficiente pero sin permiso sobre la tabla auditada
-- ---------------------------------------------------------------------------

select cms_tests.authenticate_as('hf26_reader');

select throws_ok(
    $$ select old_data from cms.audit_logs $$,
    '42501', null,
    'W1: el lector no puede seleccionar old_data de la tabla');

select throws_ok(
    $$ select new_data, record_id from cms.audit_logs $$,
    '42501', null,
    'W1: el lector no puede seleccionar new_data ni record_id de la tabla');

select throws_ok(
    $$ select * from cms.audit_logs $$,
    '42501', null,
    'W1: select * sobre la tabla también se rechaza');

select results_eq(
    $$ select record_id, old_data, new_data, data_redacted
       from cms.audit_logs_readable where id = cms_tests.test_uuid(26401) $$,
    $$ values (null::text, null::jsonb, null::jsonb, true) $$,
    'W1: por la vista, la entrada aparece con los datos redactados (null) y marcada');

select is(
    (select operation from cms.audit_logs_readable where id = cms_tests.test_uuid(26401)),
    'UPDATE',
    'W1: la vista sigue mostrando la operación de la entrada');

select is_empty(
    $$ select 1 from cms.audit_logs_readable where id = cms_tests.test_uuid(26402) $$,
    'W1: la vista mantiene el filtro por rango (no ve la entrada de un rango superior)');

select results_eq(
    $$ select record_id, old_data, data_redacted from cms.get_audit_log_row_data(cms_tests.test_uuid(26401)) $$,
    $$ values (null::text, null::jsonb, true) $$,
    'W1: llamada directa a get_audit_log_row_data: datos redactados');

select is_empty(
    $$ select 1 from cms.get_audit_log_row_data(cms_tests.test_uuid(26402)) $$,
    'W1: llamada directa con el id de una entrada no visible: ninguna fila');

-- ---------------------------------------------------------------------------
-- W1 · Lector con permiso sobre la tabla auditada (control)
-- ---------------------------------------------------------------------------

select cms_tests.authenticate_as('hf26_full');

select results_eq(
    $$ select record_id, old_data ->> 'secret', new_data ->> 'secret', data_redacted
       from cms.audit_logs_readable where id = cms_tests.test_uuid(26401) $$,
    $$ values ('i-1'::text, 'old-secret'::text, 'new-secret'::text, false) $$,
    'W1: con select sobre la tabla, la vista devuelve los datos completos');

select is_empty(
    $$ select 1 from cms.audit_logs_readable where id = cms_tests.test_uuid(26402) $$,
    'W1: el permiso de tabla no salta el filtro por rango');

-- ---------------------------------------------------------------------------
-- W2 · statement_timeout del llamante intacto y límite de la API efectivo
-- ---------------------------------------------------------------------------

select set_config('statement_timeout', '37s', true);

select is(
    (cms.global_search('hf26', 10, 0, array['public'], array['hf26_items'], 1)) ->> 'error',
    null,
    'W2: búsqueda normal con p_timeout_seconds = 1 (control)');

select is(
    current_setting('statement_timeout'),
    '37s',
    'W2: tras una búsqueda normal, el statement_timeout del llamante no cambia');

select is(
    (cms.global_search('hf26', 10, 0, array['public'], array['hf26_broken'], 1)) ->> 'error',
    'search_failed',
    'W2: la búsqueda sobre una tabla rota sale por WHEN OTHERS … RETURN (control)');

select is(
    current_setting('statement_timeout'),
    '37s',
    'W2: tras la salida de error, el statement_timeout del llamante no cambia (antes quedaba en 1 s)');

-- Lo que hace la API: fijar el límite en la transacción en una sentencia
-- anterior a la búsqueda. La vista lenta tarda 3 s y el límite es 0,5 s.
select set_config('statement_timeout', '500ms', true);

select ok(
    pg_temp.hf26_search_is_canceled('slow needle'),
    'W2: el statement_timeout fijado antes de llamar cancela una búsqueda lenta (no se traga la cancelación)');

select set_config('statement_timeout', '0', true);

reset role;

-- Las comprobaciones sobre el código fuente quitan antes los comentarios
-- (`--`), que sí explican por qué ya no se usan esas instrucciones.
create function pg_temp.hf26_code(p_fn regprocedure) returns text
language sql stable as $$
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') from pg_proc where oid = p_fn
$$;

select ok(
    pg_temp.hf26_code('cms.global_search(text, integer, integer, text[], text[], integer)') !~* 'statement_timeout',
    'W2: global_search ya no modifica statement_timeout');

select ok(
    pg_temp.hf26_code('cms.global_search(text, integer, integer, text[], text[], integer)') !~* 'when\s+query_canceled',
    'W2: global_search ya no se traga la cancelación por tiempo');

-- ---------------------------------------------------------------------------
-- W3 · Ningún aviso al cliente con el texto interno de PostgreSQL
-- ---------------------------------------------------------------------------

select is_empty(
    $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'cms'
         and pg_temp.hf26_code(p.oid::regprocedure) ~* 'raise\s+(warning|notice|info)\M[^;]*sqlerrm' $$,
    'W3: ninguna función de cms hace RAISE WARNING/NOTICE/INFO con SQLERRM');

select ok(
    (select bool_and(pg_temp.hf26_code(oid::regprocedure) ~* 'raise\s+log\M[^;]*sqlerrm') from pg_proc
     where oid in ('cms.global_search(text, integer, integer, text[], text[], integer)'::regprocedure,
                   'cms.insert_record(text, text, jsonb)'::regprocedure,
                   'cms._update_record_impl(text, text, text[], jsonb)'::regprocedure,
                   'cms._delete_record_impl(text, text, text[])'::regprocedure)),
    'W3: búsqueda y escrituras registran el error con RAISE LOG (solo log del servidor)');

select ok(
    pg_temp.hf26_code('cms.verify_admin_access()') !~* 'raise\s+warning',
    'W3: verify_admin_access no envía avisos al cliente');

-- ---------------------------------------------------------------------------
-- W4 · Factor verificado + aal1 con requires_mfa = 'false'
-- ---------------------------------------------------------------------------

select cms_tests.authenticate_as('hf26_mfa');

select ok(
    cms.verify_admin_access(),
    'W4 (control): sin factor MFA y con aal1, requires_mfa = false deja pasar');

select cms_tests.set_mfa_factor();

select ok(
    not cms.verify_admin_access(),
    'W4: con un factor verificado y aal1, verify_admin_access devuelve false');

select is(
    (cms.global_search('hf26', 10, 0, array['public'], array['hf26_items'])) -> 'results',
    '[]'::jsonb,
    'W4: la búsqueda global no devuelve nada con factor y aal1');

select is_empty(
    $$ select 1 from cms.get_audit_log_row_data(cms_tests.test_uuid(26401)) $$,
    'W4: tampoco se leen datos de auditoría por la función de redacción');

select ok(
    not cms.can_read_audit_log(cms_tests.test_uuid(26103)),
    'W4: can_read_audit_log (que usa verify_admin_access) también lo deniega');

select cms_tests.set_session_aal('aal2');

select ok(
    cms.verify_admin_access(),
    'W4 (control): con el factor y aal2 vuelve a tener acceso');

select is(
    ((cms.global_search('hf26', 10, 0, array['public'], array['hf26_items'])) ->> 'total')::int,
    3,
    'W4 (control): con aal2 la búsqueda encuentra las filas');

-- ---------------------------------------------------------------------------
-- Comodines de LIKE en el texto buscado
-- ---------------------------------------------------------------------------

select cms_tests.authenticate_as('hf26_full');

select is(
    ((cms.global_search('%%', 10, 0, array['public'], array['hf26_items'])) ->> 'total')::int,
    0,
    'LIKE: buscar %% ya no coincide con todas las filas');

select is(
    ((cms.global_search('__', 10, 0, array['public'], array['hf26_items'])) ->> 'total')::int,
    0,
    'LIKE: buscar __ ya no coincide con todas las filas');

select is(
    ((cms.global_search('_b', 10, 0, array['public'], array['hf26_items'])) ->> 'total')::int,
    0,
    'LIKE: _ no actúa como comodín (no encuentra "abc")');

select is(
    ((cms.global_search('0%', 10, 0, array['public'], array['hf26_items'])) -> 'results' -> 0 ->> 'title'),
    'hf26 50% off',
    'LIKE: un % literal se sigue encontrando');

select is(
    ((cms.global_search('r_sc', 10, 0, array['public'], array['hf26_items'])) ->> 'total')::int,
    1,
    'LIKE: un _ literal se sigue encontrando');

select is(
    ((cms.global_search('\x', 10, 0, array['public'], array['hf26_items'])) ->> 'error'),
    null,
    'LIKE: una barra invertida no rompe el patrón');

select * from finish();

rollback;
