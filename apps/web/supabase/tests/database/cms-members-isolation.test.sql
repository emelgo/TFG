-- Pruebas de aislamiento de la revisión `/rls-review` de la F2.7a
-- (migración 20260930150000_cms_members_hardening). Complementan
-- `cms-members-hardening.test.sql` atacando desde ángulos que ese fichero no
-- cubre. Cada prueba demuestra que una acción NO deseada FALLA:
--
-- I1 · Nadie falsifica ni altera la instantánea del autor (`actor_*`) de
--      `cms.audit_logs`: ni con SQL directo, ni con las funciones CRUD del
--      explorador, ni con `log_auth_user_action`. El correo del autor no se
--      filtra por la tabla, la vista ni `global_search`.
-- I2 · Un administrador delegado (rango intermedio, con gestión de cuentas,
--      roles y permisos) no se escala a sí mismo por ninguna vía: roles,
--      permisos directos, grupos, rango del rol, estado de la cuenta,
--      `grant/revoke_admin_access` ni funciones CRUD sobre el esquema `cms`.
--      Tampoco actúa sobre cuentas de rango igual ni sobre cuentas raíz, ni
--      fabrica una segunda marca de rol raíz.
-- I3 · `requires_mfa`: ni un delegado (aal2), ni Root en aal1, ni
--      `service_role` lo desactivan, por UPDATE, UPSERT, renombrado de clave
--      ni CRUD. Borrar la fila o guardar un valor raro deja el MFA
--      obligatorio (falla en cerrado).
-- I4 · Una escritura del CMS no se guarda sin su entrada de auditoría y la
--      respuesta (`PKA01`) no contiene texto interno.
-- I5 · Superficie: `anon` no tiene nada en `cms`, no hay TRUNCATE, TRIGGER ni
--      REFERENCES, y toda función SECURITY DEFINER de `cms` fija
--      `search_path = ''`.
--
-- [TFG] RF-09 · RF-10 · RNF-02 · ADR-014 · ADR-015.

begin;

select plan(68);

-- Se prueba con el MFA obligatorio (el valor real de la plataforma): todos
-- los actores tienen factor verificado y se autentican en aal2 salvo donde
-- la prueba exige aal1.
update cms.configuration set value = 'true' where key = 'requires_mfa';

-- ---------------------------------------------------------------------------
-- Preparación (como `postgres`, sin RLS)
-- ---------------------------------------------------------------------------

select cms_tests.create_supabase_user(cms_tests.test_uuid(9801), 'mi_root', 'root@members-isolation.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9802), 'mi_deleg', 'deleg@members-isolation.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9803), 'mi_peer', 'peer@members-isolation.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9804), 'mi_low', 'low@members-isolation.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9805), 'mi_support', 'support@members-isolation.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9806), 'mi_nofactor', 'nofactor@members-isolation.test');
select tests.create_supabase_user('mi_plain', 'plain@members-isolation.test');

-- Root: super-admin de la plataforma; el pegamento de ADR-014 le crea la
-- cuenta del CMS y le asigna el rol Root.
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "super-admin"}'::jsonb
where id = cms_tests.test_uuid(9801);

insert into cms.accounts (id, auth_user_id, is_active) values
    (cms_tests.test_uuid(9812), cms_tests.test_uuid(9802), true),
    (cms_tests.test_uuid(9813), cms_tests.test_uuid(9803), true),
    (cms_tests.test_uuid(9814), cms_tests.test_uuid(9804), true),
    (cms_tests.test_uuid(9815), cms_tests.test_uuid(9805), true),
    (cms_tests.test_uuid(9816), cms_tests.test_uuid(9806), true);

-- Factores MFA verificados (todos menos «nofactor»).
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
select gen_random_uuid(), u, 'mi-' || u::text, 'totp', 'verified', now(), now(), 'HOWQFBA7KBDDRSBNMGFYZAFNPRSZ62I5'
from unnest(array [cms_tests.test_uuid(9801), cms_tests.test_uuid(9802), cms_tests.test_uuid(9803),
                   cms_tests.test_uuid(9804), cms_tests.test_uuid(9805)]) u;

insert into cms.roles (id, name, rank, description) values
    (cms_tests.test_uuid(9821), 'MI delegado', 61, 'Administrador delegado'),
    (cms_tests.test_uuid(9822), 'MI bajo', 11, 'Rango mínimo'),
    (cms_tests.test_uuid(9823), 'MI medio', 41, 'Rol asignable'),
    (cms_tests.test_uuid(9824), 'MI soporte', 31, 'Como Soporte: solo lectura y auditoría');

insert into cms.permissions (id, name, permission_type, system_resource, action) values
    (cms_tests.test_uuid(9831), 'mi_account_all', 'system', 'account', '*'),
    (cms_tests.test_uuid(9832), 'mi_role_all', 'system', 'role', '*'),
    (cms_tests.test_uuid(9833), 'mi_permission_all', 'system', 'permission', '*'),
    (cms_tests.test_uuid(9834), 'mi_setting_all', 'system', 'system_setting', '*'),
    (cms_tests.test_uuid(9835), 'mi_log_select', 'system', 'log', 'select'),
    (cms_tests.test_uuid(9836), 'mi_auth_user_all', 'system', 'auth_user', '*');

insert into cms.permissions (id, name, permission_type, scope, schema_name, table_name, action) values
    (cms_tests.test_uuid(9837), 'mi_items_all', 'data', 'table', 'public', 'mi_items', '*');

insert into cms.role_permissions (role_id, permission_id)
select cms_tests.test_uuid(9821), p
from unnest(array [cms_tests.test_uuid(9831), cms_tests.test_uuid(9832), cms_tests.test_uuid(9833),
                   cms_tests.test_uuid(9834), cms_tests.test_uuid(9835), cms_tests.test_uuid(9836),
                   cms_tests.test_uuid(9837)]) p;

insert into cms.role_permissions (role_id, permission_id) values
    (cms_tests.test_uuid(9824), cms_tests.test_uuid(9835));

-- «peer» comparte el rol (y el rango) de «deleg».
insert into cms.account_roles (account_id, role_id) values
    (cms_tests.test_uuid(9812), cms_tests.test_uuid(9821)),
    (cms_tests.test_uuid(9813), cms_tests.test_uuid(9821)),
    (cms_tests.test_uuid(9814), cms_tests.test_uuid(9822)),
    (cms_tests.test_uuid(9815), cms_tests.test_uuid(9824));

create table public.mi_items (id uuid primary key default gen_random_uuid(), name text not null);

insert into public.mi_items (id, name) values (cms_tests.test_uuid(9891), 'original');

insert into cms.table_metadata (schema_name, table_name, display_name, is_searchable, is_visible, columns_config, ui_config)
values ('public', 'mi_items', 'Items', true, true,
        '{"id": {"name": "id", "is_editable": false}, "name": {"name": "name", "is_editable": true}}'::jsonb,
        '{"primary_keys": [{"column_name": "id"}]}'::jsonb);

-- Una entrada de auditoría escrita por Root (la instantánea guarda su correo).
insert into cms.audit_logs (id, account_id, operation, schema_name, table_name, severity)
values (cms_tests.test_uuid(9890),
        (select id from cms.accounts where auth_user_id = cms_tests.test_uuid(9801)),
        'MI_ROOT_ACTION', 'cms', 'roles', 'info');

-- Identificadores que el rol `authenticated` no puede leer por sí mismo.
create function cms_tests.mi_root_account() returns uuid
    language sql stable security definer set search_path = '' as $$
    select id from cms.accounts where auth_user_id = '00000000-0000-0000-0000-000000009801'::uuid;
$$;

create function cms_tests.mi_root_role() returns uuid
    language sql stable security definer set search_path = '' as $$
    select id from cms.roles where metadata @> '{"system_role": "root"}'::jsonb;
$$;

grant execute on function cms_tests.mi_root_account(), cms_tests.mi_root_role() to authenticated;

select is(
    (select actor_email from cms.audit_logs where id = cms_tests.test_uuid(9890)),
    'root@members-isolation.test',
    'Preparación: la entrada de Root guarda el correo en la instantánea');

-- ---------------------------------------------------------------------------
-- I1 · Instantánea del autor: ni se falsifica ni se filtra
-- ---------------------------------------------------------------------------

-- Personal de soporte (solo lectura y auditoría), sesión aal2.
select cms_tests.authenticate_as('mi_support');
select cms_tests.set_session_aal('aal2');

select throws_ok(
    $$ insert into cms.audit_logs (operation, schema_name, table_name, severity, actor_user_id, actor_email)
       values ('X', 'cms', 'roles', 'info', gen_random_uuid(), 'forged@evil.test') $$,
    '42501', null,
    'I1 · soporte no inserta entradas de auditoría (ni instantáneas inventadas)');

select throws_ok(
    $$ update cms.audit_logs set actor_user_id = gen_random_uuid() $$,
    '42501', null,
    'I1 · soporte no modifica la instantánea con UPDATE');

select throws_ok(
    $$ delete from cms.audit_logs $$,
    '42501', null,
    'I1 · soporte no borra entradas de auditoría');

select throws_ok(
    $$ select * from cms.audit_logs $$,
    '42501', null,
    'I1 · SELECT * de la tabla falla (actor_email no está concedida)');

select throws_ok(
    $$ select cms.create_audit_log('X', 'cms', 'roles', null, null, null) $$,
    '42501', null,
    'I1 · soporte no ejecuta create_audit_log');

select is(
    (select actor_email from cms.audit_logs_readable where id = cms_tests.test_uuid(9890)),
    null,
    'I1 · la vista no da a soporte el correo del autor de una entrada de Root');

select is_empty(
    $$ select 1 from cms.audit_logs_readable where actor_email is not null $$,
    'I1 · soporte (sin account:select ni auth_user:select) no ve ningún correo de autor');

select throws_ok(
    $$ select cms.log_auth_user_action('ban_user', 'x', '{}') $$,
    '42501', null,
    'I1 · soporte (sin auth_user) no registra acciones de usuarios');

-- Delegado (rango 61, con account:*): tampoco lee el correo de una entrada de
-- un rango superior, ni reescribe la tabla por las funciones CRUD.
select cms_tests.authenticate_as('mi_deleg');
select cms_tests.set_session_aal('aal2');

select is(
    cms.get_audit_log_actor_email(cms_tests.test_uuid(9890)),
    null,
    'I1 · el delegado no obtiene el correo del autor de una entrada de Root');

select isnt(
    cms.insert_record('cms', 'audit_logs',
                      '{"operation": "X", "schema_name": "cms", "table_name": "r", "severity": "info", "actor_email": "forged@evil.test"}'::jsonb) ->> 'success',
    'true',
    'I1 · insert_record rechaza el esquema cms (audit_logs)');

select isnt(
    cms.update_record('cms', 'audit_logs', cms_tests.test_uuid(9890)::text, '{"actor_email": "forged@evil.test"}'::jsonb) ->> 'success',
    'true',
    'I1 · update_record rechaza el esquema cms (audit_logs)');

select isnt(
    cms.delete_record('cms', 'audit_logs', cms_tests.test_uuid(9890)::text) ->> 'success',
    'true',
    'I1 · delete_record rechaza el esquema cms (audit_logs)');

-- Los detalles no suplantan al autor: la instantánea es la de la sesión.
select lives_ok(
    $$ select cms.log_auth_user_action('ban_user', 'mi-target',
              '{"actor_email": "root@members-isolation.test", "user_id": "00000000-0000-0000-0000-000000009801"}') $$,
    'I1 · el delegado registra su propia acción (control)');

reset role;

select is(
    (select count(*)::int from cms.audit_logs where actor_email = 'forged@evil.test'),
    0,
    'I1 · no existe ninguna entrada con el correo falsificado');

select results_eq(
    $$ select actor_user_id, actor_email from cms.audit_logs where operation = 'ban_user' and record_id = 'mi-target' $$,
    $$ values (cms_tests.test_uuid(9802), 'deleg@members-isolation.test'::text) $$,
    'I1 · la entrada de log_auth_user_action se atribuye al delegado, no a quien dicen los detalles');

-- Root: la búsqueda global no recorre el esquema cms.
select cms_tests.authenticate_as('mi_root');
select cms_tests.set_session_aal('aal2');

select ok(
    (select g::text from cms.global_search('members-isolation', 50, 0, array ['cms'], array ['audit_logs'], 5) g)
        !~ 'members-isolation\.test',
    'I1 · global_search no devuelve filas de cms.audit_logs ni siquiera a Root');

reset role;

-- ---------------------------------------------------------------------------
-- I2 · Autoescalada del delegado
-- ---------------------------------------------------------------------------

select cms_tests.authenticate_as('mi_deleg');
select cms_tests.set_session_aal('aal2');

select throws_ok(
    $$ insert into cms.account_roles (account_id, role_id) values (cms_tests.test_uuid(9812), cms_tests.test_uuid(9823)) $$,
    '42501', null,
    'I2 · el delegado no se añade un rol inferior');

select throws_ok(
    $$ insert into cms.account_roles (account_id, role_id) values (cms_tests.test_uuid(9812), cms_tests.mi_root_role()) $$,
    '42501', null,
    'I2 · el delegado no se añade el rol Root');

select results_eq(
    $$ with u as (update cms.account_roles set role_id = cms_tests.mi_root_role()
                  where account_id = cms_tests.test_uuid(9812) returning 1)
       select count(*)::int from u $$,
    $$ values (0) $$,
    'I2 · el delegado no cambia su rol por Root');

select throws_ok(
    $$ update cms.account_roles set account_id = cms_tests.test_uuid(9812) where account_id = cms_tests.test_uuid(9814) $$,
    '42501', null,
    'I2 · el delegado no se apropia de la asignación de rol de otra cuenta (re-asignación)');

select results_eq(
    $$ with d as (delete from cms.account_roles where account_id = cms_tests.test_uuid(9812) returning 1)
       select count(*)::int from d $$,
    $$ values (0) $$,
    'I2 · el delegado no se quita su propio rol');

select throws_ok(
    $$ insert into cms.account_permissions (account_id, permission_id) values (cms_tests.test_uuid(9812), cms_tests.test_uuid(9837)) $$,
    '42501', null,
    'I2 · el delegado no se concede permisos directos');

select throws_ok(
    $$ insert into cms.role_permission_groups (role_id, group_id)
       values (cms_tests.test_uuid(9821), (select id from cms.permission_groups limit 1)) $$,
    '42501', null,
    'I2 · el delegado no cuelga grupos de permisos de su propio rol');

select results_eq(
    $$ with u as (update cms.roles set rank = 99 where id = cms_tests.test_uuid(9821) returning 1)
       select count(*)::int from u $$,
    $$ values (0) $$,
    'I2 · el delegado no sube el rango de su propio rol');

select throws_ok(
    $$ update cms.roles set rank = 99 where id = cms_tests.test_uuid(9822) $$,
    null, null,
    'I2 · el delegado no sube un rol inferior por encima de su propio rango');

select throws_ok(
    $$ update cms.roles set metadata = '{"system_role": "root"}'::jsonb where id = cms_tests.test_uuid(9822) $$,
    null, null,
    'I2 · el delegado no fabrica una segunda marca de rol raíz');

select throws_ok(
    $$ update cms.accounts set is_active = true where id = cms_tests.test_uuid(9812) $$,
    '42501', null,
    'I2 · el delegado no escribe is_active de su cuenta con SQL directo');

select results_eq(
    $$ with d as (delete from cms.accounts where id in (cms_tests.test_uuid(9812), cms_tests.test_uuid(9813)) returning 1)
       select count(*)::int from d $$,
    $$ values (0) $$,
    'I2 · el delegado no borra su cuenta ni la de un igual');

select is(cms.set_account_active(cms_tests.test_uuid(9812), true) ->> 'error', 'SELF_ACTION',
    'I2 · set_account_active sobre sí mismo → SELF_ACTION');

select is(cms.set_account_active(cms_tests.test_uuid(9813), false) ->> 'error', 'PERMISSION_DENIED',
    'I2 · set_account_active sobre un igual → PERMISSION_DENIED');

select is(cms.set_account_active(cms_tests.mi_root_account(), false) ->> 'error', 'PROTECTED',
    'I2 · set_account_active sobre Root → PROTECTED');

select is(cms.revoke_admin_access(cms_tests.test_uuid(9802), true) ->> 'error', 'SELF_ACTION',
    'I2 · revoke_admin_access sobre sí mismo → SELF_ACTION');

select is(cms.revoke_admin_access(cms_tests.test_uuid(9801), true) ->> 'error', 'PROTECTED',
    'I2 · revoke_admin_access sobre un super-admin → PROTECTED');

select is(cms.grant_admin_access(cms_tests.test_uuid(9803)) ->> 'error', 'RANK_DENIED',
    'I2 · grant_admin_access (reactivar) sobre un igual → RANK_DENIED');

select isnt(
    cms.insert_record('cms', 'account_roles',
                      jsonb_build_object('account_id', cms_tests.test_uuid(9812), 'role_id', cms_tests.test_uuid(9823))) ->> 'success',
    'true',
    'I2 · insert_record rechaza el esquema cms (account_roles)');

select isnt(
    cms.update_record('cms', 'roles', cms_tests.test_uuid(9821)::text, '{"rank": 99}'::jsonb) ->> 'success',
    'true',
    'I2 · update_record rechaza el esquema cms (roles)');

-- En aal1 (tiene factor) no hace nada de gestión.
select cms_tests.set_session_aal('aal1');

select is(cms.set_account_active(cms_tests.test_uuid(9814), false) ->> 'error', 'MFA_REQUIRED',
    'I2 · el delegado en aal1 no gestiona miembros');

reset role;

select is(
    (select rank from cms.roles where id = cms_tests.test_uuid(9821)),
    61,
    'I2 · el rango del rol del delegado no ha cambiado');

-- Soporte y un usuario normal de la plataforma.
select cms_tests.authenticate_as('mi_support');
select cms_tests.set_session_aal('aal2');

select is(cms.grant_admin_access(cms_tests.test_uuid(9806)) ->> 'error', 'PERMISSION_DENIED',
    'I2 · soporte no da acceso al CMS');

select is(cms.set_account_active(cms_tests.test_uuid(9814), false) ->> 'error', 'PERMISSION_DENIED',
    'I2 · soporte no desactiva miembros');

reset role;

select tests.authenticate_as('mi_plain');
select pymekit.set_session_aal('aal2');

select is_empty($$ select 1 from cms.account_roles $$,
    'I2 · un usuario de la plataforma no ve asignaciones de roles');

select is(cms.grant_admin_access(tests.get_supabase_uid('mi_plain')) ->> 'error', 'SELF_ACTION',
    'I2 · un usuario de la plataforma no se da acceso al CMS');

select ok(not cms.is_root_managed_account(cms_tests.mi_root_account()),
    'I2 · is_root_managed_account no responde sin acceso al CMS (no es un oráculo)');

reset role;

-- ---------------------------------------------------------------------------
-- I3 · requires_mfa solo lo desactiva una cuenta raíz en aal2
-- ---------------------------------------------------------------------------

select cms_tests.authenticate_as('mi_deleg');
select cms_tests.set_session_aal('aal2');

select throws_ok(
    $$ update cms.configuration set value = 'FALSE' where key = 'requires_mfa' $$,
    '42501', 'MFA_DISABLE_REQUIRES_ROOT_AAL2',
    'I3 · el delegado no lo desactiva con UPDATE (mayúsculas incluidas)');

select throws_ok(
    $$ insert into cms.configuration (key, value) values ('requires_mfa', 'false')
       on conflict (key) do update set value = excluded.value $$,
    '42501', 'MFA_DISABLE_REQUIRES_ROOT_AAL2',
    'I3 · el delegado no lo desactiva con UPSERT');

select isnt(
    cms.update_record('cms', 'configuration', 'requires_mfa', '{"value": "false"}'::jsonb) ->> 'success',
    'true',
    'I3 · update_record rechaza el esquema cms (configuration)');

select lives_ok(
    $$ insert into cms.configuration (key, value) values ('mi_other', 'false') $$,
    'I3 · el delegado sí guarda otra opción (control)');

-- Borrar la fila no rebaja nada: una opción ausente cuenta como obligatoria.
select lives_ok(
    $$ delete from cms.configuration where key = 'requires_mfa' $$,
    'I3 · el delegado puede borrar la fila (con system_setting:delete)');

select throws_ok(
    $$ update cms.configuration set key = 'requires_mfa' where key = 'mi_other' $$,
    '42501', 'MFA_DISABLE_REQUIRES_ROOT_AAL2',
    'I3 · renombrar otra opción con valor false a requires_mfa también se bloquea');

select throws_ok(
    $$ insert into cms.configuration (key, value) values ('requires_mfa', 'false') $$,
    '42501', 'MFA_DISABLE_REQUIRES_ROOT_AAL2',
    'I3 · tras borrarla, tampoco la vuelve a crear a false');

reset role;

select cms_tests.authenticate_as('mi_nofactor');

select ok(not cms.verify_admin_access(),
    'I3 · sin la fila requires_mfa, un usuario sin factor en aal1 no entra (falla en cerrado)');

reset role;

insert into cms.configuration (key, value) values ('requires_mfa', ' f ');

select cms_tests.authenticate_as('mi_nofactor');

select ok(not cms.verify_admin_access(),
    'I3 · con un valor no válido, el MFA sigue siendo obligatorio');

reset role;

update cms.configuration set value = 'true' where key = 'requires_mfa';

-- service_role no tiene ni USAGE sobre cms: no llega a la tabla.
set local role service_role;

select throws_ok(
    $$ update cms.configuration set value = 'false' where key = 'requires_mfa' $$,
    '42501', null,
    'I3 · service_role no lo desactiva');

reset role;

select cms_tests.authenticate_as('mi_root');

select results_eq(
    $$ with u as (update cms.configuration set value = 'false' where key = 'requires_mfa' returning 1)
       select count(*)::int from u $$,
    $$ values (0) $$,
    'I3 · Root en aal1 no lo desactiva');

reset role;

select is((select value from cms.configuration where key = 'requires_mfa'), 'true',
    'I3 · requires_mfa sigue a true tras todos los intentos');

-- ---------------------------------------------------------------------------
-- I4 · Auditoría que falla en cerrado, sin texto interno
-- ---------------------------------------------------------------------------

create function cms_tests.mi_fail_audit() returns trigger language plpgsql as $$
begin
    raise exception 'mi-secret-internal-detail';
end;
$$;

create trigger mi_fail_audit before insert on cms.audit_logs
    for each row execute function cms_tests.mi_fail_audit();

select cms_tests.authenticate_as('mi_root');
select cms_tests.set_session_aal('aal2');

select throws_ok(
    $$ select cms.set_account_active(cms_tests.test_uuid(9812), false) $$,
    null, null,
    'I4 · set_account_active no se completa si no se puede auditar');

select throws_ok(
    $$ update cms.configuration set value = 'false' where key = 'requires_mfa' $$,
    null, null,
    'I4 · un cambio de configuración no se completa si no se puede auditar');

select results_eq(
    $$ select r ->> 'success', r ->> 'error', r -> 'meta' ->> 'sqlstate'
       from (select cms.insert_record('public', 'mi_items', '{"name": "nuevo"}'::jsonb) r) x $$,
    $$ values ('false', 'Audit log write failed', 'PKA01') $$,
    'I4 · insert_record responde PKA01 con un mensaje fijo');

select ok(
    cms.delete_record('public', 'mi_items', cms_tests.test_uuid(9891)::text)::text !~ 'mi-secret-internal-detail',
    'I4 · la respuesta de delete_record no contiene el texto interno');

reset role;

drop trigger mi_fail_audit on cms.audit_logs;

select results_eq(
    $$ select count(*)::int, min(name) from public.mi_items $$,
    $$ values (1, 'original'::text) $$,
    'I4 · ninguna escritura se guardó sin auditoría');

select ok(
    (select is_active from cms.accounts where id = cms_tests.test_uuid(9812))
        and (select value from cms.configuration where key = 'requires_mfa') = 'true',
    'I4 · la cuenta y la configuración quedan como estaban');

-- ---------------------------------------------------------------------------
-- I5 · Superficie de privilegios del esquema cms
-- ---------------------------------------------------------------------------

select ok(not has_schema_privilege('anon', 'cms', 'USAGE'),
    'I5 · anon no tiene USAGE sobre cms');

select is_empty(
    $$ select c.oid, p
       from pg_class c
                join pg_namespace n on n.oid = c.relnamespace,
            unnest(array ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
       where n.nspname = 'cms' and c.relkind in ('r', 'v', 'm', 'p')
         and has_table_privilege('anon', c.oid, p) $$,
    'I5 · anon no tiene ningún privilegio sobre tablas ni vistas de cms');

select is_empty(
    $$ select p.oid
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'cms' and has_function_privilege('anon', p.oid, 'EXECUTE') $$,
    'I5 · anon no ejecuta ninguna función de cms');

select is_empty(
    $$ select c.oid, r, p
       from pg_class c
                join pg_namespace n on n.oid = c.relnamespace,
            unnest(array ['authenticated', 'service_role']) r,
            unnest(array ['TRUNCATE', 'REFERENCES', 'TRIGGER']) p
       where n.nspname = 'cms' and c.relkind in ('r', 'p')
         and has_table_privilege(r, c.oid, p) $$,
    'I5 · ni authenticated ni service_role tienen TRUNCATE, REFERENCES o TRIGGER en cms');

select is_empty(
    $$ select p.oid::regprocedure
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'cms' and p.prosecdef
         and not coalesce(p.proconfig @> array ['search_path=""'], false) $$,
    'I5 · toda función SECURITY DEFINER de cms fija search_path vacío');

select ok(
    not has_column_privilege('authenticated', 'cms.audit_logs', 'actor_email', 'UPDATE')
        and not has_column_privilege('authenticated', 'cms.audit_logs', 'actor_email', 'INSERT')
        and not has_column_privilege('service_role', 'cms.audit_logs', 'actor_email', 'UPDATE'),
    'I5 · nadie de la API escribe actor_email');

select * from finish();

rollback;
