-- Pruebas del endurecimiento de Ajustes > Miembros y Autenticación del CMS
-- (PymeKit, F2.7a; migración 20260930150000_cms_members_hardening).
--
-- A · La auditoría conserva quién hizo cada cosa aunque se borre al autor:
--     instantánea `actor_user_id`, `actor_account_id` y `actor_email` que
--     escribe la base de datos (nunca quien llama) y que no cambia después.
-- B · `grant_admin_access` / `revoke_admin_access` devuelven solo códigos
--     estables, nunca el texto de PostgreSQL.
-- C · Las escrituras del CMS fallan en cerrado: si la entrada de auditoría
--     no se puede escribir, el cambio se revierte.
-- D · Reglas de rango de los miembros: nadie cambia sus propios roles ni su
--     estado, no se asignan roles de rango igual o superior al propio, no se
--     actúa sobre cuentas de rango igual o superior, las cuentas raíz
--     (super-admins, ADR-014) no se gestionan desde el CMS y solo una cuenta
--     raíz con sesión aal2 puede desactivar `requires_mfa`.
--
-- [TFG] RF-09 · RF-10 · RNF-02 · ADR-014 · ADR-015.

begin;

select plan(64);

-- Las reglas de MFA de acceso se prueban en cms-super-admin-root.test.sql;
-- aquí se parte de MFA opcional y se activa donde hace falta.
update cms.configuration set value = 'false' where key = 'requires_mfa';

-- ---------------------------------------------------------------------------
-- Preparación (como `postgres`, sin RLS)
-- ---------------------------------------------------------------------------

select cms_tests.create_supabase_user(cms_tests.test_uuid(9701), 'mh_root', 'root@members-hardening.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9702), 'mh_admin', 'admin@members-hardening.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9703), 'mh_peer', 'peer@members-hardening.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9704), 'mh_low', 'low@members-hardening.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9705), 'mh_doomed', 'doomed@members-hardening.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9706), 'mh_fresh', 'fresh@members-hardening.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9707), 'mh_root2', 'root2@members-hardening.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9708), 'mh_newbie', 'newbie@members-hardening.test');

-- Dos super-admins de la plataforma: el pegamento de ADR-014 les crea la
-- cuenta del CMS y les asigna el rol Root.
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "super-admin"}'::jsonb
where id in (cms_tests.test_uuid(9701), cms_tests.test_uuid(9707));

insert into cms.accounts (id, auth_user_id, is_active) values
    (cms_tests.test_uuid(9711), cms_tests.test_uuid(9702), true),
    (cms_tests.test_uuid(9712), cms_tests.test_uuid(9703), true),
    (cms_tests.test_uuid(9713), cms_tests.test_uuid(9704), true),
    (cms_tests.test_uuid(9714), cms_tests.test_uuid(9705), true),
    (cms_tests.test_uuid(9715), cms_tests.test_uuid(9706), true);

insert into cms.roles (id, name, rank, description) values
    (cms_tests.test_uuid(9721), 'MH admin', 80, 'Gestión de miembros'),
    (cms_tests.test_uuid(9722), 'MH low', 20, 'Solo auditoría'),
    (cms_tests.test_uuid(9723), 'MH mid', 50, 'Rol asignable'),
    (cms_tests.test_uuid(9724), 'MH victim', 10, 'Rango mínimo');

insert into cms.permissions (id, name, permission_type, system_resource, action) values
    (cms_tests.test_uuid(9731), 'mh_account_all', 'system', 'account', '*'),
    (cms_tests.test_uuid(9732), 'mh_role_all', 'system', 'role', '*'),
    (cms_tests.test_uuid(9733), 'mh_log_select', 'system', 'log', 'select'),
    (cms_tests.test_uuid(9734), 'mh_setting_update', 'system', 'system_setting', 'update');

insert into cms.role_permissions (role_id, permission_id) values
    (cms_tests.test_uuid(9721), cms_tests.test_uuid(9731)),
    (cms_tests.test_uuid(9721), cms_tests.test_uuid(9732)),
    (cms_tests.test_uuid(9721), cms_tests.test_uuid(9733)),
    (cms_tests.test_uuid(9721), cms_tests.test_uuid(9734)),
    (cms_tests.test_uuid(9722), cms_tests.test_uuid(9733));

-- «peer» comparte el rol (y por tanto el rango) de «admin».
insert into cms.account_roles (account_id, role_id) values
    (cms_tests.test_uuid(9711), cms_tests.test_uuid(9721)),
    (cms_tests.test_uuid(9712), cms_tests.test_uuid(9721)),
    (cms_tests.test_uuid(9713), cms_tests.test_uuid(9722)),
    (cms_tests.test_uuid(9714), cms_tests.test_uuid(9724));

-- Tabla de datos para las escrituras del explorador (C).
create table public.mh_items (id uuid primary key default gen_random_uuid(), name text not null);

insert into public.mh_items (id, name) values (cms_tests.test_uuid(9791), 'original');

insert into cms.table_metadata (schema_name, table_name, display_name, is_searchable, is_visible, columns_config, ui_config)
values ('public', 'mh_items', 'Items', false, true,
        '{"id": {"name": "id", "is_editable": false}, "name": {"name": "name", "is_editable": true}}'::jsonb,
        '{"primary_keys": [{"column_name": "id"}]}'::jsonb);

-- ---------------------------------------------------------------------------
-- A · Instantánea del autor en cms.audit_logs
-- ---------------------------------------------------------------------------

select has_column('cms', 'audit_logs', 'actor_user_id', 'audit_logs tiene actor_user_id');
select has_column('cms', 'audit_logs', 'actor_account_id', 'audit_logs tiene actor_account_id');
select has_column('cms', 'audit_logs', 'actor_email', 'audit_logs tiene actor_email');

-- Sin FK: el borrado del autor no puede tocarlas.
select is_empty(
    $$ select 1
       from pg_constraint c
                join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.conrelid = 'cms.audit_logs'::regclass
         and c.contype = 'f'
         and a.attname in ('actor_user_id', 'actor_account_id', 'actor_email') $$,
    'Las columnas de la instantánea no son claves foráneas');

-- Privilegios por columna, escritos a mano en la migración (bitácora B-35).
select ok(has_column_privilege('authenticated', 'cms.audit_logs', 'actor_user_id', 'SELECT')
          and has_column_privilege('authenticated', 'cms.audit_logs', 'actor_account_id', 'SELECT'),
    'authenticated puede leer los ids de la instantánea');

select ok(not has_column_privilege('authenticated', 'cms.audit_logs', 'actor_email', 'SELECT'),
    'authenticated NO puede leer actor_email directamente (dato personal)');

select ok(not has_function_privilege('authenticated', 'cms.audit_logs_set_actor_snapshot()', 'EXECUTE'),
    'authenticated no puede ejecutar la función del trigger de instantánea');

-- La vista ampliada sigue siendo security_invoker (B-35).
select ok(
    (select coalesce(reloptions, '{}') @> array ['security_invoker=true']
     from pg_class where oid = 'cms.audit_logs_readable'::regclass),
    'cms.audit_logs_readable sigue siendo security_invoker');

-- Quien escribe la entrada no decide la instantánea: se sobrescribe.
insert into cms.audit_logs (id, account_id, user_id, operation, schema_name, table_name, severity,
                            actor_user_id, actor_account_id, actor_email)
values (cms_tests.test_uuid(9790), cms_tests.test_uuid(9714), cms_tests.test_uuid(9705), 'MH_DOOMED_ACTION',
        'cms', 'accounts', 'info',
        cms_tests.test_uuid(9701), cms_tests.test_uuid(9711), 'forged@evil.test');

select results_eq(
    $$ select actor_user_id, actor_account_id, actor_email
       from cms.audit_logs where id = cms_tests.test_uuid(9790) $$,
    $$ values (cms_tests.test_uuid(9705), cms_tests.test_uuid(9714), 'doomed@members-hardening.test'::text) $$,
    'La instantánea se calcula a partir de user_id/account_id e ignora los valores enviados');

-- Inmutable: un UPDATE (el de `on delete set null`, o cualquier otro) no la cambia.
update cms.audit_logs set actor_email = 'changed@evil.test' where id = cms_tests.test_uuid(9790);

select is(
    (select actor_email from cms.audit_logs where id = cms_tests.test_uuid(9790)),
    'doomed@members-hardening.test',
    'La instantánea no cambia con un UPDATE');

-- Se borra al autor: las FK quedan a NULL y la instantánea sobrevive.
delete from auth.users where id = cms_tests.test_uuid(9705);

select results_eq(
    $$ select user_id, account_id, actor_user_id, actor_email
       from cms.audit_logs where id = cms_tests.test_uuid(9790) $$,
    $$ values (null::uuid, null::uuid, cms_tests.test_uuid(9705), 'doomed@members-hardening.test'::text) $$,
    'Tras borrar al autor, user_id/account_id son NULL pero la instantánea conserva quién fue');

-- Lectura del correo: Root (máximo rango, con account:*) lo ve por la vista;
-- «low» (solo log:select) no ve la entrada huérfana ni, por tanto, el correo.
select cms_tests.authenticate_as('mh_root');

select is(
    (select actor_email from cms.audit_logs_readable where id = cms_tests.test_uuid(9790)),
    'doomed@members-hardening.test',
    'Root lee el correo de la instantánea de una entrada cuyo autor se borró');

select is(
    cms.get_audit_log_actor_email(cms_tests.test_uuid(9790)),
    'doomed@members-hardening.test',
    'get_audit_log_actor_email devuelve el correo a quien puede verlo');

select cms_tests.authenticate_as('mh_low');

select is(
    cms.get_audit_log_actor_email(cms_tests.test_uuid(9790)),
    null,
    'Sin rango ni permiso de miembros, get_audit_log_actor_email devuelve NULL');

select throws_ok(
    $$ select actor_email from cms.audit_logs where id = cms_tests.test_uuid(9790) $$,
    '42501', null,
    'El personal no puede leer actor_email de la tabla con SQL directo');

-- Una acción real deja la instantánea del actor de la sesión.
select cms_tests.authenticate_as('mh_admin');

select is(
    (cms.set_account_active(cms_tests.test_uuid(9713), false) ->> 'success'),
    'true',
    'admin (rango 80) desactiva a low (rango 20)');

reset role;

select results_eq(
    $$ select actor_user_id, actor_account_id, actor_email
       from cms.audit_logs
       where table_name = 'accounts' and operation = 'UPDATE' and record_id = cms_tests.test_uuid(9713)::text
       order by created_at desc limit 1 $$,
    $$ values (cms_tests.test_uuid(9702), cms_tests.test_uuid(9711), 'admin@members-hardening.test'::text) $$,
    'La entrada de la desactivación guarda la instantánea de admin');

update cms.accounts set is_active = true where id = cms_tests.test_uuid(9713);

update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"cms_access": "true"}'::jsonb
where id = cms_tests.test_uuid(9704);

-- ---------------------------------------------------------------------------
-- B · grant/revoke_admin_access con códigos estables
-- ---------------------------------------------------------------------------

select ok(pg_get_functiondef('cms.grant_admin_access(uuid)'::regprocedure) !~* '''error'',\s*sqlerrm',
    'grant_admin_access ya no devuelve SQLERRM');

select ok(pg_get_functiondef('cms.revoke_admin_access(uuid, boolean)'::regprocedure) !~* '''error'',\s*sqlerrm',
    'revoke_admin_access ya no devuelve SQLERRM');

select cms_tests.authenticate_as('mh_low');

select is(cms.grant_admin_access(cms_tests.test_uuid(9708)) ->> 'error', 'PERMISSION_DENIED',
    'Sin account:insert → PERMISSION_DENIED');

select cms_tests.authenticate_as('mh_admin');

select is(cms.grant_admin_access(cms_tests.test_uuid(9702)) ->> 'error', 'SELF_ACTION',
    'Sobre uno mismo → SELF_ACTION');

select is(cms.grant_admin_access(gen_random_uuid()) ->> 'error', 'USER_NOT_FOUND',
    'Usuario inexistente → USER_NOT_FOUND');

select is(cms.revoke_admin_access(cms_tests.test_uuid(9701), false) ->> 'error', 'PROTECTED',
    'Super-admin de la plataforma → PROTECTED');

select is(cms.revoke_admin_access(cms_tests.test_uuid(9703), false) ->> 'error', 'RANK_DENIED',
    'Cuenta de rango igual → RANK_DENIED');

-- Error inesperado: una auditoría que falla con un texto interno. El
-- usuario de prueba parte sin acceso al CMS.
reset role;

update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"cms_access": "false"}'::jsonb
where id = cms_tests.test_uuid(9708);

create function public.mh_fail_audit() returns trigger language plpgsql as $$
begin
    if new.table_name in ('accounts', 'account_roles', 'mh_items') and new.schema_name in ('cms', 'public') then
        raise exception 'secret-internal-detail relation mh_hidden_table';
    end if;
    return new;
end;
$$;

create trigger mh_fail_audit before insert on cms.audit_logs
    for each row execute function public.mh_fail_audit();

select cms_tests.authenticate_as('mh_admin');

select is(cms.grant_admin_access(cms_tests.test_uuid(9708)) ->> 'error', 'INTERNAL_ERROR',
    'Un fallo inesperado devuelve INTERNAL_ERROR');

select ok(cms.grant_admin_access(cms_tests.test_uuid(9708))::text !~ 'secret-internal-detail|mh_hidden_table',
    'El resultado no contiene el texto interno de PostgreSQL');

reset role;

-- ---------------------------------------------------------------------------
-- C · La auditoría falla en cerrado
-- ---------------------------------------------------------------------------

select is(
    (select raw_app_meta_data ->> 'cms_access' from auth.users where id = cms_tests.test_uuid(9708)),
    'false',
    'grant_admin_access con auditoría fallida no concede el claim (se revierte)');

select is_empty(
    $$ select 1 from cms.accounts where auth_user_id = cms_tests.test_uuid(9708) $$,
    'grant_admin_access con auditoría fallida no crea la cuenta del CMS (se revierte)');

select cms_tests.authenticate_as('mh_root');

select is(
    (cms.insert_record('public', 'mh_items', '{"name": "nuevo"}'::jsonb) -> 'meta' ->> 'sqlstate'),
    'PKA01',
    'insert_record con auditoría fallida responde con el SQLSTATE PKA01');

select is(
    (cms.update_record('public', 'mh_items', cms_tests.test_uuid(9791)::text, '{"name": "cambiado"}'::jsonb) ->> 'success'),
    'false',
    'update_record con auditoría fallida no tiene éxito');

select is(
    (cms.delete_record('public', 'mh_items', cms_tests.test_uuid(9791)::text) ->> 'success'),
    'false',
    'delete_record con auditoría fallida no tiene éxito');

reset role;

select results_eq(
    $$ select count(*)::int, min(name) from public.mh_items $$,
    $$ values (1, 'original'::text) $$,
    'Ni la inserción, ni la edición, ni el borrado se guardaron sin auditoría');

-- Las escrituras de los *triggers* de auditoría también fallan en cerrado.
select cms_tests.authenticate_as('mh_admin');

select throws_ok(
    $$ insert into cms.account_roles (account_id, role_id)
       values (cms_tests.test_uuid(9715), cms_tests.test_uuid(9723)) $$,
    'P0001', 'secret-internal-detail relation mh_hidden_table',
    'Asignar un rol con la auditoría caída falla (no se asigna sin rastro)');

reset role;

drop trigger mh_fail_audit on cms.audit_logs;

select cms_tests.authenticate_as('mh_root');

select is(
    (cms.update_record('public', 'mh_items', cms_tests.test_uuid(9791)::text, '{"name": "cambiado"}'::jsonb) ->> 'success'),
    'true',
    'Con la auditoría operativa, la misma edición funciona (control)');

-- ---------------------------------------------------------------------------
-- D · Reglas de rango de los miembros
-- ---------------------------------------------------------------------------

reset role;

select ok(cms.is_root_managed_account(
              (select id from cms.accounts where auth_user_id = cms_tests.test_uuid(9701))),
    'La cuenta de un super-admin es raíz');

select ok(not cms.is_root_managed_account(cms_tests.test_uuid(9711)),
    'La cuenta de un administrador delegado no es raíz');

select ok(not (select prosecdef from pg_proc where oid = 'cms.guard_mfa_requirement_change()'::regprocedure),
    'La guardia de requires_mfa es SECURITY INVOKER (distingue a quien llama)');

select cms_tests.authenticate_as('mh_admin');

-- Nadie cambia sus propios roles (antes se permitía con roles inferiores).
select ok(not cms.can_modify_account_role(cms_tests.test_uuid(9711), cms_tests.test_uuid(9711),
                                          cms_tests.test_uuid(9724), 'update'),
    'can_modify_account_role niega cambiar el propio rol aunque sea a uno inferior');

select ok(not cms.can_modify_account_role(cms_tests.test_uuid(9711), cms_tests.test_uuid(9711),
                                          cms_tests.test_uuid(9721), 'delete'),
    'can_modify_account_role niega quitarse el propio rol');

select results_eq(
    $$ with changed as (update cms.account_roles set role_id = cms_tests.test_uuid(9724)
                        where account_id = cms_tests.test_uuid(9711) returning 1)
       select count(*)::int from changed $$,
    $$ values (0) $$,
    'Con RLS, admin no puede degradarse a sí mismo');

select results_eq(
    $$ with removed as (delete from cms.account_roles
                        where account_id = cms_tests.test_uuid(9711) returning 1)
       select count(*)::int from removed $$,
    $$ values (0) $$,
    'Con RLS, admin no puede quitarse su rol');

-- No se asignan roles de rango igual o superior al propio.
select throws_ok(
    $$ insert into cms.account_roles (account_id, role_id)
       values (cms_tests.test_uuid(9715), cms_tests.test_uuid(9721)) $$,
    '42501', null,
    'admin no puede asignar un rol de su mismo rango');

select throws_ok(
    $$ insert into cms.account_roles (account_id, role_id)
       values (cms_tests.test_uuid(9715), (select id from cms.roles where metadata @> '{"system_role": "root"}'::jsonb)) $$,
    '42501', null,
    'admin no puede asignar el rol Root');

select lives_ok(
    $$ insert into cms.account_roles (account_id, role_id)
       values (cms_tests.test_uuid(9715), cms_tests.test_uuid(9723)) $$,
    'admin sí asigna un rol inferior a una cuenta de rango inferior (control)');

-- No se actúa sobre cuentas de rango igual.
select ok(not cms.can_action_account(cms_tests.test_uuid(9712), 'update'),
    'admin no puede actuar sobre peer (mismo rango)');

select is(cms.set_account_active(cms_tests.test_uuid(9712), false) ->> 'error', 'PERMISSION_DENIED',
    'admin no desactiva a peer (mismo rango)');

select ok(not cms.can_modify_account_role(cms_tests.test_uuid(9711), cms_tests.test_uuid(9712),
                                          cms_tests.test_uuid(9722), 'insert'),
    'admin no cambia el rol de peer (mismo rango)');

select results_eq(
    $$ with removed as (delete from cms.account_roles
                        where account_id = cms_tests.test_uuid(9712) returning 1)
       select count(*)::int from removed $$,
    $$ values (0) $$,
    'Con RLS, admin no puede quitar el rol a peer');

-- Nadie cambia su propio estado.
select is(cms.set_account_active(cms_tests.test_uuid(9711), false) ->> 'error', 'SELF_ACTION',
    'set_account_active sobre la propia cuenta → SELF_ACTION');

-- Cuentas raíz: ni siquiera otro Root puede gestionarlas desde el CMS.
select is(
    cms.set_account_active((select id from cms.accounts where auth_user_id = cms_tests.test_uuid(9701)), false) ->> 'error',
    'PROTECTED',
    'admin no puede desactivar una cuenta raíz → PROTECTED');

select cms_tests.authenticate_as('mh_root');

select is(
    cms.set_account_active((select id from cms.accounts where auth_user_id = cms_tests.test_uuid(9707)), false) ->> 'error',
    'PROTECTED',
    'Root no puede desactivar la cuenta de otro super-admin');

select ok(not cms.can_action_account((select id from cms.accounts where auth_user_id = cms_tests.test_uuid(9707)), 'update'),
    'can_action_account niega actuar sobre otra cuenta raíz');

select ok(not cms.can_modify_account_role(
              (select id from cms.accounts where auth_user_id = cms_tests.test_uuid(9701)),
              (select id from cms.accounts where auth_user_id = cms_tests.test_uuid(9707)),
              (select id from cms.roles where metadata @> '{"system_role": "root"}'::jsonb),
              'delete'),
    'can_modify_account_role niega quitar el rol Root a otro super-admin');

select results_eq(
    $$ with removed as (delete from cms.account_roles ar
                        using cms.accounts a
                        where a.id = ar.account_id and a.auth_user_id = cms_tests.test_uuid(9707)
                        returning 1)
       select count(*)::int from removed $$,
    $$ values (0) $$,
    'Con RLS, Root no puede quitar el rol a otro super-admin');

-- Root sí gestiona al personal delegado (control).
select is(cms.set_account_active(cms_tests.test_uuid(9711), false) ->> 'success', 'true',
    'Root desactiva a un administrador delegado (control)');

select is(cms.set_account_active(cms_tests.test_uuid(9711), true) ->> 'success', 'true',
    'Root reactiva a un administrador delegado (control)');

-- Una cuenta raíz sigue protegida aunque le falte el rol Root (deriva):
-- basta con que su usuario sea super-admin de la plataforma.
reset role;

delete from cms.account_roles ar
using cms.accounts a
where a.id = ar.account_id and a.auth_user_id = cms_tests.test_uuid(9707);

select ok(cms.is_root_managed_account((select id from cms.accounts where auth_user_id = cms_tests.test_uuid(9707))),
    'Un super-admin sin rol Root sigue siendo una cuenta raíz');

-- requires_mfa: solo una cuenta raíz con aal2 puede desactivarlo.
update cms.configuration set value = 'true' where key = 'requires_mfa';

select cms_tests.authenticate_as('mh_admin');
select cms_tests.set_session_aal('aal2');

select throws_ok(
    $$ update cms.configuration set value = 'false' where key = 'requires_mfa' $$,
    '42501', 'MFA_DISABLE_REQUIRES_ROOT_AAL2',
    'Un administrador delegado (con system_setting:update y aal2) no puede desactivar el MFA');

select cms_tests.authenticate_as('mh_root');

select results_eq(
    $$ with changed as (update cms.configuration set value = 'false' where key = 'requires_mfa' returning 1)
       select count(*)::int from changed $$,
    $$ values (0) $$,
    'Root con sesión aal1 tampoco puede (RLS: el CMS exige aal2 mientras el MFA es obligatorio)');

select cms_tests.set_session_aal('aal2');

select lives_ok(
    $$ update cms.configuration set value = 'false' where key = 'requires_mfa' $$,
    'Root con aal2 desactiva la obligación de MFA');

reset role;

select is((select value from cms.configuration where key = 'requires_mfa'), 'false',
    'La opción queda desactivada');

-- Todas las entradas de la transacción comparten `created_at` (`now()`),
-- así que se busca la de Root en lugar de «la última».
select ok(
    exists (select 1
            from cms.audit_logs
            where schema_name = 'cms'
              and table_name = 'configuration'
              and record_id = 'requires_mfa'
              and new_data ->> 'value' = 'false'
              and severity = 'warning'
              and actor_user_id = cms_tests.test_uuid(9701)),
    'La desactivación del MFA queda en la auditoría como aviso, atribuida a Root');

-- Volver a exigirlo no rebaja nada: un administrador delegado puede.
select cms_tests.authenticate_as('mh_admin');

select lives_ok(
    $$ update cms.configuration set value = 'true' where key = 'requires_mfa' $$,
    'Un administrador delegado sí puede volver a exigir el MFA');

reset role;

select is((select value from cms.configuration where key = 'requires_mfa'), 'true',
    'La opción vuelve a ser obligatoria');

select * from finish();

rollback;
