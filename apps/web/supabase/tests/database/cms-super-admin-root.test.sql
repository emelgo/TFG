-- Pruebas del pegamento entre el super-admin de la plataforma y el CMS.
--
-- Comprueban que `schemas/53-cms-super-admin.sql` cumple ADR-014: el rol de
-- sistema `Root` existe con todos los permisos, promocionar a un usuario a
-- super-admin le da acceso raíz al CMS, degradarlo se lo quita, un usuario
-- normal no recibe nada y ningún rol de la API puede invocar las funciones
-- del pegamento.
--
-- [TFG] RF-08, RF-09, RNF-02 y ADR-014.

begin;

select plan(30);

-- -------------------------------------------------------
-- 1. Rol Root y grupo de permisos de sistema
-- -------------------------------------------------------

select is(
    (select rank from cms.roles where metadata @> '{"system_role": "root"}'::jsonb),
    100,
    'El rol de sistema Root existe y tiene el rango máximo (100)'
);

select is(
    (select count(*)::int
     from cms.role_permission_groups rpg
              join cms.roles r on r.id = rpg.role_id
              join cms.permission_groups g on g.id = rpg.group_id
     where r.metadata @> '{"system_role": "root"}'::jsonb
       and g.metadata @> '{"system_group": "root"}'::jsonb),
    1,
    'El rol Root tiene asignado el grupo de sistema Super Admin'
);

-- Un permiso de sistema por cada recurso del enum, más datos y almacenamiento
select is(
    (select count(*)::int
     from cms.permission_group_permissions pgp
              join cms.permission_groups g on g.id = pgp.group_id
     where g.metadata @> '{"system_group": "root"}'::jsonb),
    (select cardinality(enum_range(null::cms.system_resource)) + 2),
    'El grupo Super Admin incluye todos los permisos de sistema, datos y almacenamiento'
);

-- ADR-014: por defecto el CMS exige MFA, igual que `public.is_super_admin()`
select is(
    cms.get_configuration_value('requires_mfa'),
    'true',
    'Por defecto el CMS exige MFA (requires_mfa = true)'
);

-- ensure_root_role es idempotente: devuelve siempre el mismo rol
select is(
    cms.ensure_root_role(),
    (select id from cms.roles where metadata @> '{"system_role": "root"}'::jsonb),
    'ensure_root_role es idempotente'
);

-- -------------------------------------------------------
-- 2. Un usuario normal no recibe nada
-- -------------------------------------------------------

select tests.create_supabase_user('cms_root_normal', 'cms-root-normal@pymekit.test');

select is(
    (select raw_app_meta_data ->> 'cms_access'
     from auth.users where id = tests.get_supabase_uid('cms_root_normal')),
    null,
    'Un usuario normal no recibe el claim cms_access'
);

select is_empty(
    $$ select 1 from cms.accounts where auth_user_id = tests.get_supabase_uid('cms_root_normal') $$,
    'Un usuario normal no recibe cuenta en el CMS'
);

-- Cambiar otros datos de app_metadata no le da acceso
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"provider": "email"}'::jsonb
where id = tests.get_supabase_uid('cms_root_normal');

select is_empty(
    $$ select 1 from cms.accounts where auth_user_id = tests.get_supabase_uid('cms_root_normal') $$,
    'Actualizar app_metadata de un usuario normal no le da cuenta en el CMS'
);

-- -------------------------------------------------------
-- 3. Promoción a super-admin
-- -------------------------------------------------------

select tests.create_supabase_user('cms_root_promoted', 'cms-root-promoted@pymekit.test');

update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "super-admin"}'::jsonb
where id = tests.get_supabase_uid('cms_root_promoted');

select is(
    (select raw_app_meta_data ->> 'cms_access'
     from auth.users where id = tests.get_supabase_uid('cms_root_promoted')),
    'true',
    'Al promocionar a super-admin se activa el claim cms_access'
);

select is(
    (select is_active from cms.accounts where auth_user_id = tests.get_supabase_uid('cms_root_promoted')),
    true,
    'Al promocionar a super-admin se crea una cuenta activa en el CMS'
);

select is(
    (select r.name::text
     from cms.account_roles ar
              join cms.accounts a on a.id = ar.account_id
              join cms.roles r on r.id = ar.role_id
     where a.auth_user_id = tests.get_supabase_uid('cms_root_promoted')),
    'Root',
    'Al promocionar a super-admin se asigna el rol Root'
);

-- Un usuario creado ya como super-admin (INSERT) también recibe acceso
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (gen_random_uuid(), 'cms-root-inserted@pymekit.test', '{"role": "super-admin"}'::jsonb,
        '{"test_identifier": "cms_root_inserted"}'::jsonb, now(), now());

select is(
    (select r.name::text
     from cms.account_roles ar
              join cms.accounts a on a.id = ar.account_id
              join cms.roles r on r.id = ar.role_id
     where a.auth_user_id = tests.get_supabase_uid('cms_root_inserted')),
    'Root',
    'Un usuario creado directamente como super-admin recibe el rol Root'
);

-- Mientras siga siendo super-admin, el claim no se puede apagar
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"cms_access": "false"}'::jsonb
where id = tests.get_supabase_uid('cms_root_promoted');

select is(
    (select raw_app_meta_data ->> 'cms_access'
     from auth.users where id = tests.get_supabase_uid('cms_root_promoted')),
    'true',
    'El claim cms_access de un super-admin no se puede desactivar'
);

-- -------------------------------------------------------
-- 4. El super-admin tiene todos los permisos del CMS
-- -------------------------------------------------------

select tests.authenticate_as('cms_root_promoted');

-- Con solo la contraseña (sesión aal1) no basta: el CMS exige segundo factor.
-- Un JWT real de Supabase siempre incluye el claim `aal`; el helper genérico
-- no lo pone, así que se fija explícitamente.
select makerkit.set_session_aal('aal1');

select ok(
    not cms.verify_admin_access(),
    'Sin MFA (aal1) el super-admin no entra al CMS'
);

-- Caso que fallaba en abierto en el código heredado: el usuario TIENE un
-- factor MFA verificado pero la sesión es aal1. La política restrictiva le
-- oculta `cms.configuration`, y antes eso se leía como «MFA opcional».
-- El factor se inserta como propietario de la BD (ni service_role puede
-- escribir en auth.mfa_factors).
set local role postgres;

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values (gen_random_uuid(), tests.get_supabase_uid('cms_root_promoted'), 'totp-test', 'totp', 'verified', now(), now(), 'secreto-de-prueba');

select tests.authenticate_as('cms_root_promoted');
select makerkit.set_session_aal('aal1');

select ok(
    not cms.verify_admin_access(),
    'Con MFA configurado pero sesión aal1, el super-admin no entra al CMS (no falla en abierto)'
);

select makerkit.set_session_aal('aal2');

select ok(cms.verify_admin_access(), 'Con MFA (aal2) el super-admin supera verify_admin_access');

select ok(
    cms.has_admin_permission('account'::cms.system_resource, 'delete'::cms.system_action),
    'El super-admin puede gestionar cuentas del CMS'
);

select ok(
    cms.has_admin_permission('system_setting'::cms.system_resource, 'update'::cms.system_action),
    'El super-admin puede cambiar la configuración del CMS'
);

select ok(
    cms.has_data_permission('delete'::cms.system_action, 'public', 'accounts'),
    'El super-admin tiene permiso de datos sobre las tablas de la plataforma'
);

select ok(
    cms.has_storage_permission('account_image', 'insert'::cms.system_action, 'cualquier/ruta.png'),
    'El super-admin tiene permiso sobre el almacenamiento'
);

-- -------------------------------------------------------
-- 5. Ningún rol de la API puede invocar el pegamento
-- -------------------------------------------------------

select throws_ok(
    $$ select cms.ensure_root_role() $$,
    '42501',
    null,
    'authenticated no puede invocar ensure_root_role'
);

select throws_ok(
    format('select cms.grant_root_access(%L)', tests.get_supabase_uid('cms_root_normal')),
    '42501',
    null,
    'authenticated no puede invocar grant_root_access'
);

select throws_ok(
    format('select cms.revoke_root_access(%L)', tests.get_supabase_uid('cms_root_promoted')),
    '42501',
    null,
    'authenticated no puede invocar revoke_root_access'
);

select tests.authenticate_as('cms_root_normal');

select throws_ok(
    format('select cms.grant_root_access(%L)', tests.get_supabase_uid('cms_root_normal')),
    '42501',
    null,
    'Un usuario normal no puede darse acceso raíz al CMS'
);

select tests.authenticate_as_service_role();

select throws_ok(
    $$ select cms.ensure_root_role() $$,
    '42501',
    null,
    'service_role tampoco puede invocar las funciones del pegamento'
);

select tests.clear_authentication();

set local role postgres;

select ok(
    not has_function_privilege('anon', 'cms.revoke_root_access(uuid)', 'execute'),
    'anon no tiene EXECUTE sobre revoke_root_access'
);

-- -------------------------------------------------------
-- 6. Degradación: se retira el acceso
-- -------------------------------------------------------

update auth.users
set raw_app_meta_data = raw_app_meta_data - 'role'
where id = tests.get_supabase_uid('cms_root_promoted');

select is(
    (select raw_app_meta_data ->> 'cms_access'
     from auth.users where id = tests.get_supabase_uid('cms_root_promoted')),
    'false',
    'Al dejar de ser super-admin se desactiva el claim cms_access'
);

select is(
    (select is_active from cms.accounts where auth_user_id = tests.get_supabase_uid('cms_root_promoted')),
    false,
    'Al dejar de ser super-admin su cuenta del CMS queda desactivada (se conserva el registro)'
);

select is_empty(
    $$ select 1
       from cms.account_roles ar
                join cms.accounts a on a.id = ar.account_id
       where a.auth_user_id = tests.get_supabase_uid('cms_root_promoted') $$,
    'Al dejar de ser super-admin pierde el rol Root'
);

select tests.authenticate_as('cms_root_promoted');

select ok(not cms.verify_admin_access(), 'El antiguo super-admin ya no supera verify_admin_access');

select *
from finish();

rollback;
