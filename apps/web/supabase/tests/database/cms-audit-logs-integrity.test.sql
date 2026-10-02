-- Pruebas de la integridad del registro de auditoría y del endurecimiento
-- de la búsqueda global del CMS (PymeKit, F2.6; migración
-- 20260930120000_cms_audit_logs_integrity).
--
-- Auditoría:
--  - el personal (`authenticated`) solo puede LEER `cms.audit_logs`: no puede
--    insertar, modificar ni borrar entradas, ni llamar a `create_audit_log`;
--  - `log_auth_user_action` exige el permiso `auth_user` de la acción, solo
--    acepta operaciones conocidas y atribuye la entrada a la sesión aunque los
--    detalles intenten suplantar la operación;
--  - la lectura respeta la jerarquía de rangos (`can_read_audit_log`);
--  - `can_read_audit_log_data` solo deja ver los datos de fila de tablas que
--    el lector puede leer (la API redacta el resto).
--
-- Búsqueda global:
--  - nunca busca en esquemas protegidos (`auth`) aunque se pidan y el usuario
--    tenga un permiso comodín;
--  - solo devuelve filas de tablas que el usuario puede leer;
--  - acota límite, tiempo y longitud del texto, y lee las claves primarias de
--    `table_metadata.ui_config` (tabla cuya clave no se llama `id`).
--
-- [TFG] RNF-02 · ADR-015.

begin;

select plan(32);

-- Las reglas de MFA se prueban en cms-super-admin-root.test.sql.
update cms.configuration set value = 'false' where key = 'requires_mfa';

-- ---------------------------------------------------------------------------
-- Preparación (como `postgres`, sin RLS)
-- ---------------------------------------------------------------------------

select cms_tests.create_supabase_user(cms_tests.test_uuid(9001), 'audit_operator', 'operator@audit-integrity.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9002), 'audit_low', 'low@audit-integrity.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9003), 'audit_wildcard', 'wildcard@audit-integrity.test');

insert into cms.accounts (id, auth_user_id, is_active) values
    (cms_tests.test_uuid(9101), cms_tests.test_uuid(9001), true),
    (cms_tests.test_uuid(9102), cms_tests.test_uuid(9002), true),
    (cms_tests.test_uuid(9103), cms_tests.test_uuid(9003), true);

insert into cms.roles (id, name, rank, description) values
    (cms_tests.test_uuid(9201), 'Audit operator', 61, 'auth_user update + log select'),
    (cms_tests.test_uuid(9202), 'Audit low', 11, 'log select + one table'),
    (cms_tests.test_uuid(9203), 'Audit wildcard', 62, 'select on every table');

insert into cms.account_roles (account_id, role_id) values
    (cms_tests.test_uuid(9101), cms_tests.test_uuid(9201)),
    (cms_tests.test_uuid(9102), cms_tests.test_uuid(9202)),
    (cms_tests.test_uuid(9103), cms_tests.test_uuid(9203));

insert into cms.permissions (id, name, permission_type, system_resource, scope, schema_name, table_name, action) values
    (cms_tests.test_uuid(9301), 'audit_it_auth_user_update', 'system', 'auth_user', null, null, null, 'update'),
    (cms_tests.test_uuid(9302), 'audit_it_log_select', 'system', 'log', null, null, null, 'select'),
    (cms_tests.test_uuid(9303), 'audit_it_items_select', 'data', null, 'table', 'public', 'audit_it_items', 'select'),
    (cms_tests.test_uuid(9304), 'audit_it_all_select', 'data', null, 'table', '*', '*', 'select');

insert into cms.role_permissions (role_id, permission_id) values
    (cms_tests.test_uuid(9201), cms_tests.test_uuid(9301)),
    (cms_tests.test_uuid(9201), cms_tests.test_uuid(9302)),
    (cms_tests.test_uuid(9202), cms_tests.test_uuid(9302)),
    (cms_tests.test_uuid(9202), cms_tests.test_uuid(9303)),
    (cms_tests.test_uuid(9203), cms_tests.test_uuid(9304));

-- Dos tablas buscables con la misma aguja: una legible por «Audit low» y otra
-- no. La clave primaria de la legible NO se llama `id`.
create table public.audit_it_items (item_key text primary key, name text not null);
create table public.audit_it_secrets (id uuid primary key default gen_random_uuid(), name text not null);

insert into public.audit_it_items (item_key, name) values ('item-1', 'audit-it-needle item');
insert into public.audit_it_secrets (name) values ('audit-it-needle secret');

insert into cms.table_metadata (schema_name, table_name, display_name, is_searchable, is_visible, columns_config, ui_config)
values
    ('public', 'audit_it_items', 'Items', true, true,
     '{"item_key": {"name": "item_key", "is_searchable": false}, "name": {"name": "name", "is_searchable": true}}'::jsonb,
     '{"primary_keys": [{"column_name": "item_key"}]}'::jsonb),
    ('public', 'audit_it_secrets', 'Secrets', true, true,
     '{"id": {"name": "id", "is_searchable": false}, "name": {"name": "name", "is_searchable": true}}'::jsonb,
     '{"primary_keys": [{"column_name": "id"}]}'::jsonb);

-- `auth.users` buscable (como en el *seed*): la búsqueda nunca debe entrar.
insert into cms.table_metadata (schema_name, table_name, display_name, is_searchable, is_visible, columns_config, ui_config)
values ('auth', 'users', 'Users', true, true,
        '{"id": {"name": "id", "is_searchable": false}, "email": {"name": "email", "is_searchable": true}}'::jsonb,
        '{"primary_keys": [{"column_name": "id"}]}'::jsonb)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 1. Privilegios: el personal solo lee la auditoría
-- ---------------------------------------------------------------------------

-- Desde el endurecimiento F2.6 (bitácora B-31) el SELECT es por columnas:
-- sin `record_id`, `old_data` ni `new_data`, que solo se leen redactados por
-- `cms.audit_logs_readable` (ver cms-hardening-f26.test.sql). Por eso se
-- comprueba el privilegio de alguna columna y no el de la tabla completa.
select ok(has_any_column_privilege('authenticated', 'cms.audit_logs', 'SELECT'),
    'authenticated puede leer cms.audit_logs (por columnas, filtrado por RLS)');

select ok(not has_table_privilege('authenticated', 'cms.audit_logs', 'INSERT'),
    'authenticated no tiene INSERT sobre cms.audit_logs');

select ok(not has_table_privilege('authenticated', 'cms.audit_logs', 'UPDATE')
          and not has_table_privilege('authenticated', 'cms.audit_logs', 'DELETE')
          and not has_table_privilege('authenticated', 'cms.audit_logs', 'TRUNCATE'),
    'authenticated no puede modificar, borrar ni vaciar cms.audit_logs');

select ok(not has_function_privilege('authenticated',
          'cms.create_audit_log(text, text, text, text, jsonb, jsonb, cms.audit_log_severity, jsonb)', 'EXECUTE'),
    'authenticated no puede ejecutar cms.create_audit_log');

select is_empty(
    $$ select 1 from pg_policies where schemaname = 'cms' and tablename = 'audit_logs' and cmd <> 'SELECT' and cmd <> 'ALL' $$,
    'cms.audit_logs no tiene políticas de escritura');

-- ---------------------------------------------------------------------------
-- 2. Ataques de falsificación con la sesión de un miembro del personal
-- ---------------------------------------------------------------------------

select cms_tests.authenticate_as('audit_low');

select throws_ok(
    $$ insert into cms.audit_logs (account_id, user_id, operation, schema_name, table_name, severity)
       values (cms_tests.test_uuid(9102), cms_tests.test_uuid(9001), 'DELETE', 'public', 'orders', 'info') $$,
    '42501', null,
    'El personal no puede insertar entradas de auditoría a mano');

select throws_ok(
    $$ select cms.create_audit_log('DELETE', 'public', 'orders', '1', null, '{}'::jsonb) $$,
    '42501', null,
    'El personal no puede llamar a create_audit_log');

select throws_ok(
    $$ update cms.audit_logs set operation = 'SELECT' $$,
    '42501', null,
    'El personal no puede alterar entradas de auditoría');

select throws_ok(
    $$ delete from cms.audit_logs $$,
    '42501', null,
    'El personal no puede borrar entradas de auditoría');

select throws_ok(
    $$ select cms.log_auth_user_action('ban_user', cms_tests.test_uuid(9003)::text, '{}'::jsonb) $$,
    '42501', null,
    'log_auth_user_action exige el permiso auth_user de la acción');

-- ---------------------------------------------------------------------------
-- 3. log_auth_user_action con permiso
-- ---------------------------------------------------------------------------

select cms_tests.authenticate_as('audit_operator');

select throws_ok(
    $$ select cms.log_auth_user_action('DELETE', 'x', '{}'::jsonb) $$,
    '22023', null,
    'log_auth_user_action rechaza operaciones desconocidas');

select throws_ok(
    $$ select cms.log_auth_user_action('create_auth_user', 'new@audit-integrity.test', '{}'::jsonb) $$,
    '42501', null,
    'Crear exige auth_user:insert (el operador solo tiene update)');

select throws_ok(
    $$ select cms.log_auth_user_action('ban_user', cms_tests.test_uuid(9003)::text, '[1, 2]'::jsonb) $$,
    '22023', null,
    'Los detalles tienen que ser un objeto');

create temporary table audit_it_log_id on commit drop as
select cms.log_auth_user_action(
    'ban_user',
    cms_tests.test_uuid(9003)::text,
    '{"banned": true, "operation": "forged"}'::jsonb) as id;

select ok((select id from audit_it_log_id) is not null,
    'Con auth_user:update se registra la acción');

select is(
    (select count(*)::int from cms.audit_logs where id = (select id from audit_it_log_id)),
    1,
    'El operador ve su propia entrada');

-- El personal de rango inferior no ve la entrada de un rango superior.
select cms_tests.authenticate_as('audit_low');

select is_empty(
    $$ select 1 from cms.audit_logs where id = (select id from audit_it_log_id) $$,
    'Un rango inferior no lee la auditoría de un rango superior');

reset role;

select results_eq(
    $$ select account_id, user_id, schema_name, table_name, operation, new_data ->> 'operation', severity::text
       from cms.audit_logs where id = (select id from audit_it_log_id) $$,
    $$ values (cms_tests.test_uuid(9101), cms_tests.test_uuid(9001), 'auth'::text, 'users'::text,
               'ban_user'::text, 'ban_user'::text, 'info'::text) $$,
    'La entrada se atribuye a la sesión, con esquema y tabla fijos y sin operación suplantada');

-- ---------------------------------------------------------------------------
-- 4. Redacción de los datos de fila (can_read_audit_log_data)
-- ---------------------------------------------------------------------------

select cms_tests.authenticate_as('audit_low');

select ok(cms.can_read_audit_log_data('public', 'audit_it_items'),
    'Ve los datos de fila de una tabla que puede leer');

select ok(not cms.can_read_audit_log_data('public', 'audit_it_secrets'),
    'No ve los datos de fila de una tabla sin permiso select');

select ok(cms.can_read_audit_log_data('cms', 'roles'),
    'Con log:select ve los datos del propio esquema cms');

select ok(not cms.can_read_audit_log_data('auth', 'users'),
    'Sin auth_user:select no ve los datos de auth.users');

select cms_tests.authenticate_as('audit_wildcard');

select ok(not cms.can_read_audit_log_data('auth', 'users')
          and not cms.can_read_audit_log_data('vault', 'secrets')
          and not cms.can_read_audit_log_data('pg_catalog', 'pg_authid'),
    'Un permiso comodín no abre los esquemas protegidos');

select ok(not cms.can_read_audit_log_data('cms', 'roles'),
    'Sin log:select tampoco ve los datos del esquema cms');

select cms_tests.set_session_admin_access('false');

select ok(not cms.can_read_audit_log_data('public', 'audit_it_items'),
    'Sin acceso vigente al CMS no ve ningún dato');

-- ---------------------------------------------------------------------------
-- 5. Búsqueda global
-- ---------------------------------------------------------------------------

select cms_tests.authenticate_as('audit_low');

select is(
    (select jsonb_agg(r ->> 'table_name') from jsonb_array_elements(
        cms.global_search('audit-it-needle') -> 'results') r),
    '["audit_it_items"]'::jsonb,
    'Solo devuelve filas de tablas legibles (no la tabla sin permiso)');

select is(
    (select cms.global_search('audit-it-needle') -> 'results' -> 0 -> 'url_params' ->> 'id'),
    'item-1',
    'La clave primaria se lee de ui_config (columna que no se llama id)');

select cms_tests.authenticate_as('audit_wildcard');

select is(
    (select cms.global_search('audit-integrity', 10, 0, array['auth']) -> 'results'),
    '[]'::jsonb,
    'Nunca busca en auth aunque se pida y haya permiso comodín');

select is(
    (select (cms.global_search('audit-it-needle', 10, 0, array['public'], null, 999) -> 'performance' ->> 'timeout_seconds')::int),
    15,
    'El tiempo máximo nunca supera 15 s');

select ok(
    (select jsonb_array_length(cms.global_search('audit-it-needle', 100000) -> 'results') <= 50),
    'El límite de resultados está acotado');

-- Regresión: cada tabla aportaba sus 5 primeras coincidencias sin ordenar,
-- así que una coincidencia exacta insertada después de otras 6 se perdía.
reset role;

insert into public.audit_it_items (item_key, name)
select 'rank-' || n, 'audit-it-rank-exact partial ' || n from generate_series(1, 6) n;

insert into public.audit_it_items (item_key, name) values ('rank-exact', 'audit-it-rank-exact');

select cms_tests.authenticate_as('audit_wildcard');

select is(
    (select cms.global_search('audit-it-rank-exact') -> 'results' -> 0 ->> 'title'),
    'audit-it-rank-exact',
    'La coincidencia exacta aparece primero aunque la tabla tenga más de 5');

select is(
    (select cms.global_search(repeat('a', 201)) -> 'results'),
    '[]'::jsonb,
    'Un texto de más de 200 caracteres no se busca');

select cms_tests.set_session_admin_access('false');

select is(
    (select cms.global_search('audit-it-needle') -> 'results'),
    '[]'::jsonb,
    'Sin acceso vigente al CMS no devuelve nada');

select * from finish();

rollback;
