-- Garantías de aislamiento del registro de auditoría del CMS demostradas en la
-- revisión /rls-review de la F2.6 (migración
-- 20260930120000_cms_audit_logs_integrity). Complementa a
-- cms-audit-logs-integrity.test.sql con los vectores que allí no se cubren:
--
--  A. Privilegios residuales: ni `anon` ni `service_role` pueden escribir, y
--     nadie más que el propietario puede vaciar la tabla ni usar la función
--     de los *triggers* de auditoría.
--  B. Otras formas de escritura (INSERT ... ON CONFLICT, MERGE, SELECT FOR
--     UPDATE, LOCK) también se rechazan para el personal.
--  C. Las funciones CRUD del explorador (security definer) no sirven de
--     puerta trasera: ni Root con permiso comodín puede escribir en
--     `cms.audit_logs` a través de ellas.
--  D. Barrera de MFA: con AAL1 (y MFA obligatorio) ni siquiera Root lee la
--     auditoría, busca, ve datos de fila ni registra acciones; y con MFA
--     opcional, quien tiene un factor verificado pero entra con AAL1 tampoco
--     lee la auditoría (política RESTRICTIVE).
--  E. `log_auth_user_action` no deja atribuir la entrada a otra persona: los
--     campos `user_id`/`account_id` de los detalles quedan dentro de
--     `new_data`, nunca en las columnas de atribución.
--  F. `global_search` no entra en esquemas protegidos (`pg_catalog`, `vault`,
--     `cms`) aunque existan metadatos buscables y se pidan expresamente, y un
--     texto con forma de inyección no rompe la consulta.
--
-- [TFG] RNF-02 · ADR-015.

begin;

select no_plan();

-- MFA obligatorio (valor por defecto de PymeKit) salvo donde se indique.
update cms.configuration set value = 'true' where key = 'requires_mfa';

-- ---------------------------------------------------------------------------
-- Preparación (como `postgres`, sin RLS)
-- ---------------------------------------------------------------------------

-- Root: super-admin de la plataforma, que el pegamento de ADR-014 convierte
-- en la cuenta del CMS de rango máximo con permisos comodín.
select tests.create_supabase_user('audit_iso_root', 'root@audit-isolation.test');

update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "super-admin", "cms_access": "true"}'::jsonb
where email = 'root@audit-isolation.test';

-- Operador de rango bajo con `auth_user:update` y `log:select`.
select cms_tests.create_supabase_user(cms_tests.test_uuid(9401), 'audit_iso_op', 'op@audit-isolation.test');

insert into cms.accounts (id, auth_user_id, is_active)
values (cms_tests.test_uuid(9411), cms_tests.test_uuid(9401), true);

insert into cms.roles (id, name, rank, description)
values (cms_tests.test_uuid(9421), 'Audit iso operator', 13, 'auth_user update + log select');

insert into cms.account_roles (account_id, role_id)
values (cms_tests.test_uuid(9411), cms_tests.test_uuid(9421));

insert into cms.permissions (id, name, permission_type, system_resource, scope, schema_name, table_name, action) values
    (cms_tests.test_uuid(9431), 'audit_iso_auth_user_update', 'system', 'auth_user', null, null, null, 'update'),
    (cms_tests.test_uuid(9432), 'audit_iso_log_select', 'system', 'log', null, null, null, 'select');

insert into cms.role_permissions (role_id, permission_id) values
    (cms_tests.test_uuid(9421), cms_tests.test_uuid(9431)),
    (cms_tests.test_uuid(9421), cms_tests.test_uuid(9432));

-- Una entrada propia del operador y otra del sistema, con una aguja
-- reconocible para contar después.
insert into cms.audit_logs (account_id, user_id, operation, schema_name, table_name, severity)
values (cms_tests.test_uuid(9411), cms_tests.test_uuid(9401), 'audit-iso-needle', 'public', 'x', 'info'),
       (null, null, 'audit-iso-needle', 'public', 'x', 'info');

-- Metadatos buscables sobre esquemas protegidos: aunque alguien los cree,
-- la búsqueda global no debe entrar nunca.
insert into cms.table_metadata (schema_name, table_name, display_name, is_searchable, is_visible, columns_config)
values
    ('pg_catalog', 'pg_authid', 'Roles', true, true,
     '{"rolname": {"name": "rolname"}, "rolpassword": {"name": "rolpassword"}}'::jsonb),
    ('vault', 'secrets', 'Secretos', true, true, '{"name": {"name": "name"}}'::jsonb),
    ('cms', 'audit_logs', 'Auditoría', true, true, '{"operation": {"name": "operation"}}'::jsonb)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- A. Privilegios residuales
-- ---------------------------------------------------------------------------

select ok(not has_schema_privilege('anon', 'cms', 'USAGE'),
    'anon no tiene USAGE sobre el esquema cms');

select ok(not has_table_privilege('anon', 'cms.audit_logs', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
    'anon no tiene ningún privilegio sobre cms.audit_logs');

select ok(not has_table_privilege('authenticated', 'cms.audit_logs', 'TRUNCATE,REFERENCES,TRIGGER'),
    'authenticated no puede vaciar, referenciar ni poner triggers en cms.audit_logs');

select ok(not has_table_privilege('service_role', 'cms.audit_logs', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
    'service_role solo lee cms.audit_logs');

select ok(not has_function_privilege('anon', 'cms.log_auth_user_action(text, text, jsonb)', 'EXECUTE')
          and not has_function_privilege('anon', 'cms.can_read_audit_log_data(text, text)', 'EXECUTE')
          and not has_function_privilege('anon', 'cms.global_search(text, integer, integer, text[], text[], integer)', 'EXECUTE'),
    'anon no ejecuta las funciones nuevas o endurecidas de la F2.6');

select ok(not has_function_privilege('authenticated', 'cms.audit_trigger_function()', 'EXECUTE'),
    'El personal no puede usar la función de auditoría en triggers propios');

select is_empty(
    $$ select p.oid::regprocedure
       from pg_proc p
       where p.oid in ('cms.log_auth_user_action(text, text, jsonb)'::regprocedure,
                       'cms.global_search(text, integer, integer, text[], text[], integer)'::regprocedure,
                       'cms.can_read_audit_log_data(text, text)'::regprocedure,
                       'cms.create_audit_log(text, text, text, text, jsonb, jsonb, cms.audit_log_severity, jsonb)'::regprocedure,
                       'cms.audit_trigger_function()'::regprocedure)
         and not coalesce('search_path=""' = any (p.proconfig), false) $$,
    'Las funciones de auditoría y búsqueda fijan search_path vacío');

-- ---------------------------------------------------------------------------
-- B. Otras formas de escritura como personal (AAL2)
-- ---------------------------------------------------------------------------

select cms_tests.authenticate_as('audit_iso_op');
select cms_tests.set_session_aal('aal2');

select throws_ok(
    $$ insert into cms.audit_logs (operation, schema_name, table_name, severity)
       values ('forged', 'public', 'x', 'info') on conflict do nothing $$,
    '42501', null,
    'INSERT ... ON CONFLICT también se rechaza');

select throws_ok(
    $$ merge into cms.audit_logs a using (select 1) s on false
       when not matched then insert (operation, schema_name, table_name, severity)
       values ('forged', 'public', 'x', 'info') $$,
    '42501', null,
    'MERGE también se rechaza');

select throws_ok(
    $$ select 1 from cms.audit_logs for update $$,
    '42501', null,
    'SELECT FOR UPDATE (bloqueo de filas) se rechaza');

select throws_ok(
    $$ lock table cms.audit_logs in exclusive mode $$,
    '42501', null,
    'El personal no puede bloquear la tabla en modo exclusivo');

select throws_ok(
    $$ update cms.audit_logs set operation = 'x' where account_id = cms_tests.test_uuid(9411) $$,
    '42501', null,
    'Ni siquiera sus propias entradas se pueden alterar');

-- ---------------------------------------------------------------------------
-- E. Atribución de log_auth_user_action
-- ---------------------------------------------------------------------------

create temporary table audit_iso_log on commit drop as
select cms.log_auth_user_action(
    'ban_user',
    'victim',
    jsonb_build_object('user_id', cms_tests.test_uuid(9999), 'account_id', cms_tests.test_uuid(9999))) as id;

select throws_ok(
    $$ select cms.log_auth_user_action('BAN_USER', 'x', '{}'::jsonb) $$,
    '22023', null,
    'La operación se compara exacta (sin variantes de mayúsculas)');

select throws_ok(
    $$ select cms.log_auth_user_action('ban_user', 'x', 'null'::jsonb) $$,
    '22023', null,
    'Un JSON null no pasa por objeto de detalles');

select throws_ok(
    $$ select cms.log_auth_user_action('ban_user', 'x', jsonb_build_object('a', repeat('a', 10000))) $$,
    '22023', null,
    'Los detalles de más de 4 KB se rechazan');

reset role;

select results_eq(
    $$ select account_id, user_id from cms.audit_logs where id = (select id from audit_iso_log) $$,
    $$ values (cms_tests.test_uuid(9411), cms_tests.test_uuid(9401)) $$,
    'Los user_id/account_id de los detalles no suplantan la atribución de la sesión');

-- ---------------------------------------------------------------------------
-- C. Las funciones CRUD no escriben en cms.audit_logs (Root, AAL2)
-- ---------------------------------------------------------------------------

select tests.authenticate_as('audit_iso_root');
select makerkit.set_session_aal('aal2');

select ok(cms.verify_admin_access(), 'Root con AAL2 tiene acceso al CMS (control del test)');

select is(
    cms.insert_record('cms', 'audit_logs',
        '{"operation": "forged", "schema_name": "x", "table_name": "x", "severity": "info"}'::jsonb) ->> 'success',
    'false',
    'insert_record rechaza el esquema cms aunque Root tenga permiso comodín');

select is(
    cms.update_record_by_conditions('cms', 'audit_logs',
        '{"operation": "audit-iso-needle"}'::jsonb, '{"operation": "forged"}'::jsonb) ->> 'success',
    'false',
    'update_record_by_conditions rechaza el esquema cms');

select is(
    cms.delete_record_by_conditions('cms', 'audit_logs', '{"operation": "audit-iso-needle"}'::jsonb) ->> 'success',
    'false',
    'delete_record_by_conditions rechaza el esquema cms');

-- ---------------------------------------------------------------------------
-- F. Búsqueda global y esquemas protegidos (Root, AAL2)
-- ---------------------------------------------------------------------------

select is(
    (cms.global_search('postgres', 50, 0, null) -> 'results'),
    '[]'::jsonb,
    'Sin filtro de esquema, la búsqueda no entra en pg_catalog.pg_authid');

select is(
    (cms.global_search('audit-iso-needle', 50, 0, array['cms', 'vault', 'pg_catalog', 'auth']) -> 'total')::int,
    0,
    'Pedir expresamente esquemas protegidos no devuelve nada');

select is(
    (cms.global_search($q$zz' OR 1=1 --$q$, 50, 0, null) -> 'error'),
    null,
    'Un texto con forma de inyección se trata como literal (sin error)');

reset role;

select is(
    (select count(*)::int from cms.audit_logs where operation = 'audit-iso-needle'),
    2,
    'Las entradas sembradas siguen intactas tras los intentos');

-- ---------------------------------------------------------------------------
-- D. Barrera de MFA
-- ---------------------------------------------------------------------------

-- Root con AAL1 y MFA obligatorio: todo cerrado.
select tests.authenticate_as('audit_iso_root');
select makerkit.set_session_aal('aal1');

select is_empty(
    $$ select 1 from cms.audit_logs $$,
    'Root con AAL1 no lee ninguna entrada de auditoría');

select is(
    (cms.global_search('audit-iso-needle', 50, 0, null) -> 'results'),
    '[]'::jsonb,
    'Root con AAL1 no busca');

select ok(not cms.can_read_audit_log_data('cms', 'accounts'),
    'Root con AAL1 no ve datos de fila');

select throws_ok(
    $$ select cms.log_auth_user_action('ban_user', 'x', '{}'::jsonb) $$,
    '42501', null,
    'Root con AAL1 no registra acciones del explorador de usuarios');

-- MFA opcional, pero el operador tiene un factor verificado y entra con AAL1:
-- la política RESTRICTIVE le oculta la auditoría.
reset role;
update cms.configuration set value = 'false' where key = 'requires_mfa';

select cms_tests.authenticate_as('audit_iso_op');
select cms_tests.set_mfa_factor();

select is_empty(
    $$ select 1 from cms.audit_logs $$,
    'Con factor verificado y AAL1, la política restrictiva oculta la auditoría');

select cms_tests.set_session_aal('aal2');

select ok(
    exists (select 1 from cms.audit_logs where operation = 'audit-iso-needle'),
    'Con AAL2 vuelve a leer sus propias entradas (control del test)');

select is_empty(
    $$ select 1 from cms.audit_logs where operation = 'audit-iso-needle' and account_id is null $$,
    'Un rango bajo no lee las entradas del sistema (sin cuenta)');

select * from finish();

rollback;
