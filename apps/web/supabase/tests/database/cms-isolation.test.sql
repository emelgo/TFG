-- Pruebas de aislamiento del CMS (revisión /rls-review de la F2.1).
--
-- Cada bloque ejecuta un ataque real como el usuario atacante y comprueba que
-- falla. Documentan las garantías de seguridad del esquema `cms` y sirven de
-- regresión para las correcciones de la migración
-- 20260929120700_cms_rls_hardening.sql (ADR-015):
--
--   A. Un super-admin (raíz del CMS) no puede leer esquemas protegidos
--      (auth, vault, cms…) a través de las funciones de datos.
--   B. MFA: con sesión aal1 no se entra al CMS por ninguna puerta (datos,
--      paneles); con aal2 sí.
--   C. Un usuario normal de PymeKit (sin acceso al CMS) no obtiene nada del
--      esquema `cms` ni puede concederse acceso.
--   D. Solo puede existir un rol y un grupo marcados como raíz.
--   E. Escalada de privilegios y visibilidad en el RBAC: un administrador delegado no puede
--      colgar de un rol inferior un permiso que él no posee cambiando
--      `permission_id` con UPDATE (brecha heredada corregida).
--
-- [TFG] RF-09, RNF-02, RNF-03 · ADR-014 y ADR-015.

begin;

select no_plan();

-- -------------------------------------------------------
-- Preparación: un super-admin (recibe Root por el pegamento de ADR-014) y
-- un usuario normal de la plataforma.
-- -------------------------------------------------------

select tests.create_supabase_user('iso_root', 'iso-root@pymekit.test');
select tests.create_supabase_user('iso_normal', 'iso-normal@pymekit.test');

update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "super-admin"}'::jsonb
where id = tests.get_supabase_uid('iso_root');

-- -------------------------------------------------------
-- A. Esquemas protegidos inaccesibles incluso para Root
-- -------------------------------------------------------

select tests.authenticate_as('iso_root');
select makerkit.set_session_aal('aal2');

select ok(cms.verify_admin_access(), 'A0: el super-admin con aal2 tiene acceso al CMS');

select lives_ok(
    $$ select cms.query_table('public', 'accounts') $$,
    'A1: Root puede consultar tablas de negocio (public.accounts)'
);

-- Antes de la corrección, el permiso comodín de Root devolvía auth.users
-- (con los hashes de contraseña) a través de query_table.
select throws_ilike(
    $$ select cms.query_table('auth', 'users') $$,
    '%not allowed%',
    'A2: query_table no puede leer auth.users'
);

select throws_ilike(
    $$ select cms.get_record_by_keys('auth', 'users', jsonb_build_object('id', tests.get_supabase_uid('iso_normal'))) $$,
    '%not allowed%',
    'A3: get_record_by_keys no puede leer auth.users'
);

select throws_ilike(
    $$ select cms.query_table('cms', 'accounts') $$,
    '%not allowed%',
    'A4: query_table no puede leer el propio esquema cms'
);

select throws_ilike(
    $$ select cms.query_table('vault', 'secrets') $$,
    '%not allowed%',
    'A5: query_table no puede leer vault'
);

-- Hallado en la refutación independiente: los catálogos del sistema no
-- estaban protegidos y pg_authid exponía hashes de contraseña de roles.
select throws_ilike(
    $$ select cms.query_table('pg_catalog', 'pg_authid') $$,
    '%not allowed%',
    'A6: query_table no puede leer pg_catalog.pg_authid'
);

select throws_ilike(
    $$ select cms.get_record_by_keys('pg_catalog', 'pg_authid', '{"rolname": "authenticator"}'::jsonb) $$,
    '%not allowed%',
    'A7: get_record_by_keys no puede leer pg_catalog.pg_authid'
);

-- Regresión B-18: un campo obligatorio vacío debe informar del SQLSTATE
-- 23502 (not_null_violation). El código heredado usaba un nombre de
-- condición inexistente y acababa en un error 500 en la API.
select is(
    cms.insert_record('public', 'accounts', '{"slug": "sin-nombre"}'::jsonb) -> 'meta' ->> 'sqlstate',
    '23502',
    'A8: insert_record informa de not_null_violation (23502) si falta un campo obligatorio'
);

-- -------------------------------------------------------
-- B. MFA obligatorio en todas las puertas de entrada
-- -------------------------------------------------------

select tests.authenticate_as('iso_root');
select makerkit.set_session_aal('aal1');

select ok(not cms.verify_admin_access(), 'B1: con aal1 el super-admin no supera verify_admin_access');

select throws_ilike(
    $$ select cms.query_table('public', 'accounts') $$,
    '%Invalid admin access%',
    'B2: con aal1 query_table se deniega'
);

select throws_ilike(
    $$ select cms.list_dashboards() $$,
    '%Access denied%',
    'B3: con aal1 list_dashboards se deniega'
);

select ok(
    not cms.can_access_dashboard(gen_random_uuid()),
    'B4: con aal1 can_access_dashboard devuelve false'
);

select is_empty(
    $$ select 1 from cms.roles $$,
    'B5: con aal1 no se ven los roles del CMS'
);

-- -------------------------------------------------------
-- C. Un usuario normal de PymeKit no obtiene nada del CMS
-- -------------------------------------------------------

select tests.authenticate_as('iso_normal');
select makerkit.set_session_aal('aal2');

select ok(not cms.verify_admin_access(), 'C1: un usuario normal no tiene acceso al CMS (ni con aal2)');

select is_empty($$ select 1 from cms.accounts $$, 'C2: no ve cuentas del CMS');
select is_empty($$ select 1 from cms.roles $$, 'C3: no ve roles del CMS');
select is_empty($$ select 1 from cms.permissions $$, 'C4: no ve permisos del CMS');
select is_empty($$ select 1 from cms.configuration $$, 'C5: no ve la configuración del CMS');
select is_empty($$ select 1 from cms.audit_logs $$, 'C6: no ve la auditoría del CMS');
select is_empty($$ select 1 from cms.dashboards $$, 'C7: no ve paneles del CMS');

select throws_ilike(
    $$ select cms.query_table('public', 'accounts') $$,
    '%Invalid admin access%',
    'C8: no puede usar query_table'
);

-- No puede darse acceso a sí mismo: las funciones de alta exigen permisos de
-- administración del CMS, y las del pegamento ni siquiera son ejecutables.
-- grant_admin_access no lanza excepción: devuelve success = false. Se
-- comprueba el resultado y, sobre todo, que el acceso no se ha concedido.
select is(
    (cms.grant_admin_access(tests.get_supabase_uid('iso_root')) ->> 'success'),
    'false',
    'C9: grant_admin_access rechaza la petición de un usuario sin permisos'
);

select is(
    (tests.get_supabase_user('iso_normal') -> 'raw_app_meta_data' ->> 'cms_access'),
    null,
    'C9b: el usuario normal sigue sin cms_access en app_metadata'
);

select throws_ok(
    $$ select cms.grant_root_access(tests.get_supabase_uid('iso_normal')) $$,
    '42501',
    null,
    'C10: no puede ejecutar la función del pegamento grant_root_access'
);

-- Un claim `cms_access` en user_metadata (editable por el propio usuario) no
-- sirve: el acceso solo se lee de app_metadata, que controla el servidor.
select set_config('request.jwt.claims', json_build_object(
    'sub', tests.get_supabase_uid('iso_normal'),
    'aal', 'aal2',
    'user_metadata', json_build_object('cms_access', 'true'),
    'app_metadata', json_build_object()
)::text, true);

select ok(
    not cms.verify_admin_access(),
    'C11: un cms_access en user_metadata no concede acceso'
);

-- -------------------------------------------------------
-- D. Unicidad de los marcadores de sistema
-- -------------------------------------------------------

set local role postgres;

select throws_ok(
    $$ insert into cms.roles (name, rank, metadata)
       values ('Falso Root', 1, '{"system_role": "root"}'::jsonb) $$,
    '23505',
    null,
    'D1: no puede crearse un segundo rol con el marcador raíz'
);

select throws_ok(
    $$ insert into cms.permission_groups (name, metadata)
       values ('Falso grupo raíz', '{"system_group": "root"}'::jsonb) $$,
    '23505',
    null,
    'D2: no puede crearse un segundo grupo con el marcador raíz'
);

-- -------------------------------------------------------
-- E. Escalada vía UPDATE en las tablas de asignación de permisos
-- -------------------------------------------------------
-- Escenario propio y aislado (se vacía el RBAC dentro de esta transacción):
-- un administrador delegado (rango 50) puede gestionar roles y permisos,
-- pero NO posee el permiso privilegiado `auth_user_all`.

update cms.configuration set value = 'false' where key = 'requires_mfa';

delete from cms.permission_group_permissions;
delete from cms.role_permission_groups;
delete from cms.permission_groups;
delete from cms.account_roles;
delete from cms.role_permissions;
delete from cms.account_permissions;
delete from cms.accounts;
delete from cms.roles;
delete from cms.permissions;

select cms_tests.create_supabase_user(cms_tests.test_uuid(9001), 'iso_mid', 'iso-mid@pymekit.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9002), 'iso_low', 'iso-low@pymekit.test');

insert into cms.accounts (id, auth_user_id, is_active) values
    (cms_tests.test_uuid(9101), cms_tests.test_uuid(9001), true),
    (cms_tests.test_uuid(9102), cms_tests.test_uuid(9002), true);

insert into cms.roles (id, name, rank, description) values
    (cms_tests.test_uuid(9201), 'Admin delegado', 50, 'Gestiona roles y permisos'),
    (cms_tests.test_uuid(9202), 'Bajo', 10, 'Rol subordinado');

insert into cms.account_roles (account_id, role_id) values
    (cms_tests.test_uuid(9101), cms_tests.test_uuid(9201)),
    (cms_tests.test_uuid(9102), cms_tests.test_uuid(9202));

insert into cms.permissions (id, name, permission_type, system_resource, action) values
    (cms_tests.test_uuid(9301), 'iso_role_all', 'system', 'role', '*'),
    (cms_tests.test_uuid(9302), 'iso_permission_all', 'system', 'permission', '*'),
    (cms_tests.test_uuid(9303), 'iso_log_select', 'system', 'log', 'select'),
    (cms_tests.test_uuid(9304), 'iso_auth_user_all', 'system', 'auth_user', '*');

insert into cms.role_permissions (role_id, permission_id) values
    (cms_tests.test_uuid(9201), cms_tests.test_uuid(9301)),
    (cms_tests.test_uuid(9201), cms_tests.test_uuid(9302)),
    (cms_tests.test_uuid(9201), cms_tests.test_uuid(9303)),
    (cms_tests.test_uuid(9202), cms_tests.test_uuid(9303));

-- Permiso directo de la cuenta subordinada, para el ataque sobre account_permissions.
insert into cms.account_permissions (account_id, permission_id, is_grant) values
    (cms_tests.test_uuid(9102), cms_tests.test_uuid(9303), true);

select cms_tests.authenticate_as('iso_mid');

-- El ataque que funcionaba antes de la corrección (UPDATE 1): cambiar el
-- permiso de una fila del rol inferior por uno que el atacante no posee.
select throws_ok(
    $$ update cms.role_permissions
       set permission_id = cms_tests.test_uuid(9304)
       where role_id = cms_tests.test_uuid(9202)
         and permission_id = cms_tests.test_uuid(9303) $$,
    '42501',
    null,
    'E1: no puede colgar de un rol inferior un permiso que no posee (role_permissions)'
);

select throws_ok(
    $$ update cms.account_permissions
       set permission_id = cms_tests.test_uuid(9304)
       where account_id = cms_tests.test_uuid(9102) $$,
    '42501',
    null,
    'E2: no puede asignar a una cuenta inferior un permiso que no posee (account_permissions)'
);

-- La corrección no bloquea lo legítimo: sustituir por un permiso que sí posee.
select lives_ok(
    $$ update cms.role_permissions
       set permission_id = cms_tests.test_uuid(9301)
       where role_id = cms_tests.test_uuid(9202)
         and permission_id = cms_tests.test_uuid(9303) $$,
    'E3: sí puede asignar a un rol inferior un permiso que posee'
);

-- Un usuario sin `permission:select` solo ve las asignaciones de sus propios
-- roles (la política heredada tenía una condición tautológica y mostraba todas).
select cms_tests.authenticate_as('iso_low');

select is(
    (select count(*)::int from cms.role_permissions),
    1,
    'E4: un usuario sin permiso de consulta solo ve las asignaciones de su propio rol'
);

select is_empty(
    $$ select 1 from cms.role_permissions where role_id = cms_tests.test_uuid(9201) $$,
    'E5: no ve las asignaciones del rol superior'
);

select * from finish();

rollback;
