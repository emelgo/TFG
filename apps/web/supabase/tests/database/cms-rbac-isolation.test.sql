-- Garantías de aislamiento del RBAC del CMS demostradas en la /rls-review de
-- la F2.7b (complementa a `cms-rbac-f27b.test.sql`, escrito por el autor del
-- cambio; aquí se atacan las mismas reglas desde otros ángulos).
--
-- Actores:
--  - A y B: pares que comparten el rol «Iso R60» (rango 60) con role:*,
--    permission:*, account:*, lectura de datos '*'.'*' y almacenamiento
--    docs/team/*. A tiene además una DENEGACIÓN explícita sobre
--    public.iso_secret.
--  - C: rol «Iso C40» (rango 40), solo auditoría.
--  - Root: super-admin de la plataforma (rol Root por el pegamento de ADR-014).
--
-- G1 · Rango: nadie sube un rol a su rango o por encima, ni por UPDATE, ni
--      por INSERT … ON CONFLICT, ni borrando y reinsertando.
-- G2 · Objetos de sistema: ni un delegado ni Root (aal2) modifican el rol
--      Root, el grupo Super Admin ni los permisos `Root: *`, ni quitan Root al
--      super-admin; tampoco lo consigue una función `security definer` que
--      intente cambiar el parámetro `role`.
-- G3 · C8: colgar un permiso `Root: *` de un rol inferior solo delega lo que
--      el actor ya tiene y no convierte al receptor en cuenta raíz.
-- G4 · Oráculos cerrados: el personal no pregunta por los permisos, grupos o
--      capacidades de otra cuenta.
-- G5 · Almacenamiento en cerrado: filas antiguas sin bucket o patrón no
--      conceden nada; `%` y `_` son literales; `*` explícito sí funciona.
-- G6 · Las funciones CRUD genéricas no escriben en el esquema `cms`.
-- P1 · Denegaciones y delegación (B-47): una denegación explícita no se
--      esquiva delegando un comodín que la incluye (a un rol, a un grupo, a
--      una cuenta títere) ni ensanchando en el sitio un permiso ya asignado.
--      Datos, sistema y almacenamiento; y lo que no se solapa sí se delega.
-- P2 · Soporte sin `account:select` solo ve su propia asignación de rol y
--      `get_user_max_role_rank` / `is_root_managed_account` no responden por
--      otras cuentas (B-47).
--
-- [TFG] RF-09 · RNF-02 · ADR-014 · ADR-015.

begin;

select no_plan();

-- Las reglas de MFA se prueban en cms-super-admin-root.test.sql.
update cms.configuration set value = 'false' where key = 'requires_mfa';

-- ---------------------------------------------------------------------------
-- Preparación (como `postgres`, sin RLS)
-- ---------------------------------------------------------------------------

select cms_tests.create_supabase_user(cms_tests.test_uuid(9701), 'iso_a', 'a@rbac-iso.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9702), 'iso_b', 'b@rbac-iso.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9703), 'iso_c', 'c@rbac-iso.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9704), 'iso_d', 'd@rbac-iso.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9705), 'iso_root', 'root@rbac-iso.test');
-- Segundo inicio de sesión de la plataforma, sin acceso al CMS (títere de A).
select tests.create_supabase_user('iso_puppet', 'puppet@rbac-iso.test');

update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "super-admin"}'::jsonb
where id = cms_tests.test_uuid(9705);

insert into cms.accounts (id, auth_user_id, is_active) values
    (cms_tests.test_uuid(9711), cms_tests.test_uuid(9701), true),
    (cms_tests.test_uuid(9712), cms_tests.test_uuid(9702), true),
    (cms_tests.test_uuid(9713), cms_tests.test_uuid(9703), true),
    (cms_tests.test_uuid(9714), cms_tests.test_uuid(9704), true);

insert into cms.roles (id, name, rank) values
    (cms_tests.test_uuid(9721), 'Iso R60', 60),
    (cms_tests.test_uuid(9723), 'Iso C40', 40),
    (cms_tests.test_uuid(9724), 'Iso T20', 20);

create table public.iso_secret (id uuid primary key default gen_random_uuid(), name text not null);
insert into public.iso_secret (name) values ('nóminas');
grant select on public.iso_secret to authenticated;
insert into cms.table_metadata (schema_name, table_name, display_name, is_searchable, is_visible, columns_config, ui_config)
values ('public', 'iso_secret', 'Secreto', false, true,
        '{"id": {"name": "id"}, "name": {"name": "name"}}'::jsonb, '{}'::jsonb);

insert into cms.permissions (id, name, permission_type, system_resource, action) values
    (cms_tests.test_uuid(9731), 'iso role all', 'system', 'role', '*'),
    (cms_tests.test_uuid(9732), 'iso permission all', 'system', 'permission', '*'),
    (cms_tests.test_uuid(9733), 'iso account all', 'system', 'account', '*'),
    (cms_tests.test_uuid(9734), 'iso log select', 'system', 'log', 'select');

insert into cms.permissions (id, name, permission_type, scope, schema_name, table_name, action) values
    (cms_tests.test_uuid(9735), 'iso data all select', 'data', 'table', '*', '*', 'select'),
    (cms_tests.test_uuid(9736), 'iso secret select', 'data', 'table', 'public', 'iso_secret', 'select');

insert into cms.permissions (id, name, permission_type, scope, action, metadata) values
    (cms_tests.test_uuid(9737), 'iso docs team', 'data', 'storage', 'select',
     '{"bucket_name": "docs", "path_pattern": "team/*"}'::jsonb);

insert into cms.permission_groups (id, name, created_by) values
    (cms_tests.test_uuid(9741), 'Iso grupo R60', cms_tests.test_uuid(9711));

insert into cms.permission_group_permissions (group_id, permission_id)
select cms_tests.test_uuid(9741), p
from unnest(array [cms_tests.test_uuid(9731), cms_tests.test_uuid(9732), cms_tests.test_uuid(9733),
                   cms_tests.test_uuid(9735), cms_tests.test_uuid(9737)]) p;

insert into cms.role_permission_groups (role_id, group_id) values
    (cms_tests.test_uuid(9721), cms_tests.test_uuid(9741));
insert into cms.role_permissions (role_id, permission_id) values
    (cms_tests.test_uuid(9723), cms_tests.test_uuid(9734));

insert into cms.account_roles (account_id, role_id) values
    (cms_tests.test_uuid(9711), cms_tests.test_uuid(9721)),
    (cms_tests.test_uuid(9712), cms_tests.test_uuid(9721)),
    (cms_tests.test_uuid(9713), cms_tests.test_uuid(9723));

-- Denegación explícita: A lee cualquier tabla salvo public.iso_secret.
insert into cms.account_permissions (account_id, permission_id, is_grant) values
    (cms_tests.test_uuid(9711), cms_tests.test_uuid(9736), false);

-- Filas de almacenamiento «antiguas» (anteriores a la restricción de la
-- F2.7b): se desactiva la restricción solo para sembrarlas y comprobar que
-- las funciones también fallan en cerrado por sí mismas.
alter table cms.permissions drop constraint valid_permission_type;

insert into cms.permissions (id, name, permission_type, scope, action, metadata) values
    (cms_tests.test_uuid(9761), 'iso legacy sin bucket', 'data', 'storage', 'select', '{"path_pattern": "*"}'::jsonb),
    (cms_tests.test_uuid(9762), 'iso legacy patrón vacío', 'data', 'storage', 'select', '{"bucket_name": "docs", "path_pattern": ""}'::jsonb),
    (cms_tests.test_uuid(9763), 'iso legacy sin metadata', 'data', 'storage', 'select', null),
    (cms_tests.test_uuid(9764), 'iso porcentaje', 'data', 'storage', 'select', '{"bucket_name": "pb", "path_pattern": "%"}'::jsonb),
    (cms_tests.test_uuid(9765), 'iso comodín', 'data', 'storage', 'select', '{"bucket_name": "star", "path_pattern": "*"}'::jsonb);

insert into cms.role_permissions (role_id, permission_id)
select cms_tests.test_uuid(9723), p
from unnest(array [cms_tests.test_uuid(9761), cms_tests.test_uuid(9762), cms_tests.test_uuid(9763),
                   cms_tests.test_uuid(9764), cms_tests.test_uuid(9765)]) p;

-- Ids que `authenticated` no siempre puede leer por sí mismo.
create function cms_tests.iso_root_account() returns uuid
    language sql stable security definer set search_path = '' as $$
    select id from cms.accounts where auth_user_id = '00000000-0000-0000-0000-000000009705'::uuid;
$$;

create function cms_tests.iso_root_role() returns uuid
    language sql stable security definer set search_path = '' as $$
    select id from cms.roles where metadata @> '{"system_role": "root"}'::jsonb;
$$;

create function cms_tests.iso_root_group() returns uuid
    language sql stable security definer set search_path = '' as $$
    select id from cms.permission_groups where metadata @> '{"system_group": "root"}'::jsonb;
$$;

create function cms_tests.iso_root_permission(p_suffix text) returns uuid
    language sql stable security definer set search_path = '' as $$
    select id from cms.permissions where name = 'Root: ' || p_suffix;
$$;

-- Función `security definer` de `postgres` que escribe en el RBAC, como
-- cualquier función interna: la guardia debe seguir viendo al usuario.
create function cms_tests.iso_definer_write_root() returns void
    language plpgsql security definer set search_path = '' as $$
begin
    update cms.roles set name = 'pwn' where metadata ? 'system_role';
end;
$$;

-- Y otra que además intenta hacerse pasar por `service_role`.
create function cms_tests.iso_definer_spoof_role() returns void
    language plpgsql security definer set search_path = '' as $$
begin
    perform set_config('role', 'service_role', true);
    update cms.roles set name = 'pwn' where metadata ? 'system_role';
end;
$$;

grant execute on function cms_tests.iso_root_account(), cms_tests.iso_root_role(),
    cms_tests.iso_root_group(), cms_tests.iso_root_permission(text),
    cms_tests.iso_definer_write_root(), cms_tests.iso_definer_spoof_role() to authenticated;

select isnt(cms_tests.iso_root_account(), null, 'Preparación: el super-admin tiene cuenta del CMS');

-- ---------------------------------------------------------------------------
-- G1 · Rango (actor: A, rango 60)
-- ---------------------------------------------------------------------------

select cms_tests.authenticate_as('iso_a');

select throws_ok(
    $$ update cms.roles set rank = 100 where id = cms_tests.test_uuid(9724) $$,
    'P0001', null,
    'G1.1 · A no sube un rol inferior por encima de su rango');

select throws_ok(
    $$ update cms.roles set rank = 60 where id = cms_tests.test_uuid(9724) $$,
    'P0001', null,
    'G1.2 · A no sube un rol inferior a su mismo rango');

select throws_ok(
    $$ insert into cms.roles (id, name, rank) values (cms_tests.test_uuid(9724), 'x', 10)
       on conflict (id) do update set rank = 100 $$,
    'P0001', null,
    'G1.3 · INSERT … ON CONFLICT DO UPDATE pasa por el mismo control de rango');

select throws_ok(
    $$ insert into cms.roles (id, name, rank) values (cms_tests.test_uuid(9721), 'x', 10)
       on conflict (id) do update set rank = 10 $$,
    '42501', null,
    'G1.4 · A no cambia su propio rol (compartido con B) mediante ON CONFLICT');

select throws_ok(
    $$ with d as (delete from cms.roles where id = cms_tests.test_uuid(9724) returning id)
       insert into cms.roles (id, name, rank) select id, 'T', 100 from d $$,
    '42501', null,
    'G1.5 · borrar y reinsertar el rol con más rango lo rechaza la política INSERT');

select is_empty(
    $$ update cms.roles set rank = 10 where id = cms_tests.test_uuid(9721) returning id $$,
    'G1.6 · el par B no puede ser degradado por A (rol compartido: 0 filas)');

select throws_ok(
    $$ update cms.roles set id = gen_random_uuid() where id = cms_tests.test_uuid(9724) $$,
    '42501', null,
    'G1.7 · el id del rol no es actualizable (UPDATE por columnas)');

select throws_ok(
    $$ delete from cms.roles where id = cms_tests.test_uuid(9723) $$,
    'P0001', 'ROLE_HAS_MEMBERS',
    'G1.8 · un rol con miembros no se borra');

-- ---------------------------------------------------------------------------
-- G2 · Objetos de sistema
-- ---------------------------------------------------------------------------

select throws_ok(
    $$ update cms.roles set metadata = '{"system_role": "otro"}'::jsonb where id = cms_tests.test_uuid(9724) $$,
    '42501', 'SYSTEM_RBAC_OBJECT_PROTECTED',
    'G2.1 · A no marca un rol propio como rol de sistema');

select throws_ok(
    $$ insert into cms.role_permission_groups (role_id, group_id)
       values (cms_tests.test_uuid(9724), cms_tests.iso_root_group()) $$,
    '42501', 'SYSTEM_RBAC_OBJECT_PROTECTED',
    'G2.2 · A no cuelga el grupo Super Admin de otro rol');

select throws_ok(
    $$ select cms_tests.iso_definer_write_root() $$,
    '42501', 'SYSTEM_RBAC_OBJECT_PROTECTED',
    'G2.3 · una función security definer no esquiva la guardia (el parámetro role sigue siendo authenticated)');

select throws_ok(
    $$ select cms_tests.iso_definer_spoof_role() $$,
    '42501', null,
    'G2.4 · dentro de una función security definer no se puede cambiar el parámetro role');

-- Root con sesión aal2 y MFA obligatorio.
set local role postgres;
update cms.configuration set value = 'true' where key = 'requires_mfa';

select cms_tests.authenticate_as('iso_root');
select cms_tests.set_mfa_factor();
select cms_tests.set_session_aal('aal2');

select ok(cms.verify_admin_access(), 'G2.5 · Preparación: Root aal2 tiene acceso');

select throws_ok(
    $$ update cms.permissions set description = 'x' where id = cms_tests.iso_root_permission('data') $$,
    '42501', 'SYSTEM_RBAC_OBJECT_PROTECTED',
    'G2.6 · ni Root edita un permiso `Root: *`');

select throws_ok(
    $$ delete from cms.permission_group_permissions where group_id = cms_tests.iso_root_group() $$,
    '42501', 'SYSTEM_RBAC_OBJECT_PROTECTED',
    'G2.7 · ni Root vacía el grupo Super Admin');

select is_empty(
    $$ update cms.roles set rank = 1000 where id = cms_tests.iso_root_role() returning id $$,
    'G2.8 · Root no cambia el rango del rol Root (0 filas)');

select is_empty(
    $$ delete from cms.account_roles where role_id = cms_tests.iso_root_role() returning account_id $$,
    'G2.9 · Root no quita el rol Root a ningún super-admin (0 filas)');

select throws_ok(
    $$ update cms.account_roles set role_id = cms_tests.iso_root_role()
       where account_id = cms_tests.test_uuid(9713) $$,
    '42501', null,
    'G2.10 · Root no da el rol Root a otra cuenta desde el CMS');

-- Root con sesión aal1: nada.
select cms_tests.set_session_aal('aal1');

select is_empty($$ select id from cms.roles $$, 'G2.11 · Root en aal1 no ve roles');

set local role postgres;
update cms.configuration set value = 'false' where key = 'requires_mfa';

-- ---------------------------------------------------------------------------
-- G3 · C8: permisos `Root: *` colgados de roles delegados
-- ---------------------------------------------------------------------------

select cms_tests.authenticate_as('iso_a');

select throws_ok(
    $$ insert into cms.role_permissions (role_id, permission_id)
       values (cms_tests.test_uuid(9724), cms_tests.iso_root_permission('log')) $$,
    '42501', null,
    'G3.1 · A no cuelga `Root: log` (no tiene log:*)');

select throws_ok(
    $$ insert into cms.role_permissions (role_id, permission_id)
       values (cms_tests.test_uuid(9724), cms_tests.iso_root_permission('data')) $$,
    '42501', null,
    'G3.2 · A no cuelga `Root: data` (tiene select, no *)');

select throws_ok(
    $$ insert into cms.role_permissions (role_id, permission_id)
       values (cms_tests.test_uuid(9724), cms_tests.iso_root_permission('storage')) $$,
    '42501', null,
    'G3.3 · A no cuelga `Root: storage`');

select lives_ok(
    $$ insert into cms.role_permissions (role_id, permission_id)
       values (cms_tests.test_uuid(9724), cms_tests.iso_root_permission('role')) $$,
    'G3.4 · A sí delega `Root: role` porque ya tiene role:* (C8 = delegación)');

select lives_ok(
    $$ insert into cms.account_roles (account_id, role_id)
       values (cms_tests.test_uuid(9714), cms_tests.test_uuid(9724)) $$,
    'G3.5 · A asigna ese rol a una cuenta sin rol (D)');

select throws_ok(
    $$ insert into cms.account_roles (account_id, role_id)
       values (cms_tests.test_uuid(9711), cms_tests.test_uuid(9724)) $$,
    '42501', null,
    'G3.6 · A no se asigna roles a sí mismo');

select cms_tests.authenticate_as('iso_d');

select is(cms.is_root_managed_account(cms_tests.test_uuid(9714)), false,
    'G3.7 · tener `Root: role` no convierte a D en cuenta raíz');
select is(cms.can_action_role(cms_tests.iso_root_role(), 'update'), false,
    'G3.8 · D (rango 20) no puede actuar sobre el rol Root');
select is(cms.can_action_role(cms_tests.test_uuid(9723), 'update'), false,
    'G3.9 · D no actúa sobre roles de rango superior al suyo (C40)');

-- ---------------------------------------------------------------------------
-- G4 · Oráculos cerrados (actor: C, rango 40)
-- ---------------------------------------------------------------------------

select cms_tests.authenticate_as('iso_c');

select throws_ok(
    $$ select cms.has_permission(cms_tests.iso_root_account(), cms_tests.iso_root_permission('data')) $$,
    '42501', null, 'G4.1 · has_permission no es ejecutable por el personal');
select throws_ok(
    $$ select cms.build_where_clause('auth', 'users', '{}'::jsonb) $$,
    '42501', null, 'G4.2 · build_where_clause no es ejecutable por el personal');
select throws_ok(
    $$ select cms.lock_resources_ordered(array[cms_tests.iso_root_role()], null, null, null) $$,
    '42501', null, 'G4.3 · lock_resources_ordered no es ejecutable por el personal');
select is(cms.can_view_permission_group(cms_tests.iso_root_account(), cms_tests.iso_root_group()), false,
    'G4.4 · can_view_permission_group no responde por Root');
select is(cms.can_view_role_permission_group(cms_tests.iso_root_account(), cms_tests.iso_root_role()), false,
    'G4.5 · can_view_role_permission_group no responde por Root');
select is(cms.can_modify_role_permission_group(cms_tests.iso_root_account(), cms_tests.test_uuid(9724), 'insert'), false,
    'G4.6 · can_modify_role_permission_group no responde por Root');
select is(cms.can_modify_account_role(cms_tests.iso_root_account(), cms_tests.test_uuid(9714),
                                      cms_tests.test_uuid(9724), 'insert'), false,
    'G4.7 · can_modify_account_role no responde por Root');

-- ---------------------------------------------------------------------------
-- G5 · Almacenamiento en cerrado (actor: C)
-- ---------------------------------------------------------------------------

select is(cms.has_storage_permission('cualquiera', 'select', 'x.txt'), false,
    'G5.1 · una fila antigua sin bucket no concede ningún bucket');
select is(cms.has_storage_permission('docs', 'select', 'x.txt'), false,
    'G5.2 · una fila antigua con patrón vacío no concede nada');
select is(cms.has_storage_permission('pb', 'select', 'a/b/c.png'), false,
    'G5.3 · `%` en el patrón es literal, no comodín');
select is(cms.has_storage_permission('pb', 'select', '%'), true,
    'G5.4 · `%` literal sí coincide consigo mismo');
select is(cms.has_storage_permission('star', 'select', 'a/b/c.png'), true,
    'G5.5 · el comodín `*` explícito funciona');
select is(cms.has_storage_permission('otro', 'select', 'a.png'), false,
    'G5.6 · el comodín de ruta no se extiende a otro bucket');
select is(cms.storage_capability_is_grantable('select', 'otro', '*'), false,
    'G5.7 · C no puede conceder otro bucket');

select cms_tests.authenticate_as('iso_a');

select throws_ok(
    $$ update cms.permissions set metadata = '{"bucket_name": "*", "path_pattern": "team/*"}'::jsonb
       where id = cms_tests.test_uuid(9737) $$,
    '42501', null,
    'G5.8 · A no ensancha su permiso docs/team/* a todos los buckets');

-- ---------------------------------------------------------------------------
-- G6 · Las funciones CRUD genéricas no escriben en `cms`
-- ---------------------------------------------------------------------------

select is(
    cms.insert_record('cms', 'account_roles',
        jsonb_build_object('account_id', cms_tests.test_uuid(9711), 'role_id', cms_tests.iso_root_role())) ->> 'success',
    'false',
    'G6.1 · insert_record no escribe en cms.account_roles');

select is(
    cms.update_record('cms', 'roles', cms_tests.test_uuid(9721)::text, '{"rank": 1000}'::jsonb) ->> 'success',
    'false',
    'G6.2 · update_record no escribe en cms.roles');

-- ---------------------------------------------------------------------------
-- P1 · Denegaciones y delegación (B-47)
--
-- Antes, `has_data_permission('select', '*', '*')` solo buscaba denegaciones
-- cuyo esquema y tabla fueran literalmente '*', así que A (denegado en
-- public.iso_secret) podía delegar su permiso '*'.'*' a una cuenta títere y
-- leer la tabla a través de ella. Ahora `capability_is_grantable` exige que
-- ninguna denegación de quien concede se SOLAPE con lo que concede.
-- ---------------------------------------------------------------------------

-- Funciones auxiliares de solapamiento (puras), probadas como `postgres`.
set local role postgres;

select ok(cms.capability_values_overlap('*', 'iso_secret'), 'P1.a · el comodín se solapa con cualquier nombre');
select ok(not cms.capability_values_overlap('iso_secret', 'iso_other'), 'P1.b · dos nombres distintos no se solapan');
select ok(cms.capability_values_overlap(null, 'name'), 'P1.c · una columna NULL (tabla completa) se solapa con cualquier columna');
select ok(cms.storage_path_patterns_overlap('team/*', 'team/secret/*'), 'P1.d · patrones con prefijos anidados se solapan');
select ok(not cms.storage_path_patterns_overlap('team/*', 'public/*'), 'P1.e · prefijos literales disjuntos no se solapan');
select ok(cms.storage_path_patterns_overlap('*', 'a.txt'), 'P1.f · `*` se solapa con todo');
select ok(not cms.storage_path_patterns_overlap('a.txt', 'b.txt'), 'P1.g · dos rutas literales distintas no se solapan');
select ok(cms.storage_path_patterns_overlap('{{user_id}}/*', 'public/*'), 'P1.h · una variable cuenta como comodín (en la duda, se solapan)');

-- Permisos del escenario.
insert into cms.permissions (id, name, permission_type, scope, schema_name, table_name, column_name, action) values
    (cms_tests.test_uuid(9751), 'iso public all select', 'data', 'table', 'public', '*', null, 'select'),
    (cms_tests.test_uuid(9752), 'iso other select', 'data', 'table', 'public', 'iso_other', null, 'select'),
    (cms_tests.test_uuid(9753), 'iso secret name column', 'data', 'column', 'public', 'iso_secret', 'name', 'select'),
    (cms_tests.test_uuid(9759), 'iso all insert', 'data', 'table', '*', '*', null, 'insert');

insert into cms.permissions (id, name, permission_type, system_resource, action) values
    (cms_tests.test_uuid(9754), 'iso account delete', 'system', 'account', 'delete'),
    (cms_tests.test_uuid(9755), 'iso account select', 'system', 'account', 'select');

insert into cms.permissions (id, name, permission_type, scope, action, metadata) values
    (cms_tests.test_uuid(9756), 'iso docs any', 'data', 'storage', 'select', '{"bucket_name": "docs", "path_pattern": "*"}'::jsonb),
    (cms_tests.test_uuid(9757), 'iso docs team secret', 'data', 'storage', 'select', '{"bucket_name": "docs", "path_pattern": "team/secret/*"}'::jsonb),
    (cms_tests.test_uuid(9758), 'iso docs archive', 'data', 'storage', 'select', '{"bucket_name": "docs", "path_pattern": "archive/*"}'::jsonb),
    (cms_tests.test_uuid(9766), 'iso docs public', 'data', 'storage', 'select', '{"bucket_name": "docs", "path_pattern": "public/*"}'::jsonb);

-- A: denegación de sistema sobre account:delete (tiene account:*), acceso
-- directo a todo el bucket `docs` y una denegación de almacenamiento que no
-- se solapa con `team/*` (`archive/*`).
insert into cms.account_permissions (account_id, permission_id, is_grant) values
    (cms_tests.test_uuid(9711), cms_tests.test_uuid(9754), false),
    (cms_tests.test_uuid(9711), cms_tests.test_uuid(9756), true),
    (cms_tests.test_uuid(9711), cms_tests.test_uuid(9758), false);

-- El títere de A también recibe acceso al CMS (como haría grant_admin_access).
insert into cms.accounts (id, auth_user_id, is_active)
values (cms_tests.test_uuid(9715), tests.get_supabase_uid('iso_puppet'), true);

select cms_tests.authenticate_as('iso_a');

-- Datos
select is(cms.has_data_permission('select', 'public', 'iso_secret'), false,
    'P1.0 · Preparación: A tiene denegada public.iso_secret');
select is(cms.has_data_permission('select', '*', '*'), true,
    'P1.0b · Preparación: A tiene el comodín *.* (la denegación no lo cubre entero)');

select is(cms.can_grant_permission(cms_tests.test_uuid(9735)), false,
    'P1.1 · A no delega datos *.* teniendo una denegación que lo recorta');
select is(cms.can_grant_permission(cms_tests.test_uuid(9751)), false,
    'P1.2 · A tampoco delega public.* (incluye la tabla denegada)');
select is(cms.can_grant_permission(cms_tests.test_uuid(9753)), false,
    'P1.3 · ni una columna de la tabla denegada');
select is(cms.can_grant_permission(cms_tests.test_uuid(9752)), true,
    'P1.4 · A sí delega otra tabla que la denegación no toca');
select is(cms.can_grant_permission(cms_tests.test_uuid(9759)), false,
    'P1.4b · ni una acción que no tiene (insert): la regla de tenerla sigue vigente');

select throws_ok(
    $$ insert into cms.role_permissions (role_id, permission_id)
       values (cms_tests.test_uuid(9724), cms_tests.test_uuid(9735)) $$,
    '42501', null,
    'P1.5 · A no cuelga *.* de un rol inferior');

select throws_ok(
    $$ insert into cms.permission_group_permissions (group_id, permission_id)
       values (cms_tests.test_uuid(9741), cms_tests.test_uuid(9751)) $$,
    '42501', null,
    'P1.6 · A no añade public.* a un grupo');

select throws_ok(
    $$ insert into cms.account_permissions (account_id, permission_id, is_grant)
       values (cms_tests.test_uuid(9714), cms_tests.test_uuid(9735), true) $$,
    '42501', null,
    'P1.7 · A no concede *.* directamente a una cuenta inferior (D)');

-- La cadena completa del ataque: rol de rango 10 con *.* asignado al títere.
select lives_ok(
    $$ insert into cms.roles (id, name, rank) values (cms_tests.test_uuid(9725), 'Iso títere', 10) $$,
    'P1.8 · Preparación: A crea un rol de rango 10');
select throws_ok(
    $$ insert into cms.role_permissions (role_id, permission_id)
       values (cms_tests.test_uuid(9725), cms_tests.test_uuid(9735)) $$,
    '42501', null,
    'P1.9 · …pero no le cuelga *.*');
select lives_ok(
    $$ insert into cms.account_roles (account_id, role_id)
       values (cms_tests.test_uuid(9715), cms_tests.test_uuid(9725)) $$,
    'P1.10 · A asigna el rol al títere');

select cms_tests.authenticate_as('iso_puppet');

select is(cms.has_data_permission('select', 'public', 'iso_secret'), false,
    'P1.11 · el títere no lee public.iso_secret');
select throws_ilike(
    $$ select cms.query_table('public', 'iso_secret') $$,
    '%does not have permission to read this table%',
    'P1.12 · query_table sobre public.iso_secret no devuelve datos al títere');

select cms_tests.authenticate_as('iso_a');

select lives_ok(
    $$ insert into cms.role_permissions (role_id, permission_id)
       values (cms_tests.test_uuid(9725), cms_tests.test_uuid(9752)) $$,
    'P1.13 · lo que no se solapa con la denegación sí se delega (public.iso_other)');

-- Sistema: A tiene account:* y una denegación sobre account:delete.
select is(cms.has_admin_permission('account', 'delete'), false,
    'P1.14 · Preparación: A tiene denegado account:delete');
select is(cms.can_grant_permission(cms_tests.test_uuid(9733)), false,
    'P1.15 · A no delega account:*');
select is(cms.can_grant_permission(cms_tests.test_uuid(9754)), false,
    'P1.16 · ni account:delete');
select is(cms.can_grant_permission(cms_tests.test_uuid(9755)), true,
    'P1.17 · account:select sí (no se solapa con la denegación)');
select is(cms.can_grant_permission(cms_tests.test_uuid(9731)), true,
    'P1.18 · y role:* tampoco se ve afectado');
select throws_ok(
    $$ insert into cms.role_permissions (role_id, permission_id)
       values (cms_tests.test_uuid(9725), cms_tests.test_uuid(9733)) $$,
    '42501', null,
    'P1.19 · A no cuelga account:* del rol del títere');
select lives_ok(
    $$ insert into cms.role_permissions (role_id, permission_id)
       values (cms_tests.test_uuid(9725), cms_tests.test_uuid(9755)) $$,
    'P1.20 · account:select sí se cuelga');

-- «Reshape»: ensanchar en el sitio un permiso ya asignado.
select throws_ok(
    $$ update cms.permissions set table_name = '*' where id = cms_tests.test_uuid(9752) $$,
    '42501', 'insufficient_privilege: cannot reshape a permission into a capability you do not hold',
    'P1.21 · A no ensancha public.iso_other a public.*');
select throws_ok(
    $$ update cms.permissions set schema_name = '*', table_name = '*' where id = cms_tests.test_uuid(9752) $$,
    '42501', 'insufficient_privilege: cannot reshape a permission into a capability you do not hold',
    'P1.22 · ni a *.*');
select throws_ok(
    $$ update cms.permissions set action = '*' where id = cms_tests.test_uuid(9755) $$,
    '42501', 'insufficient_privilege: cannot reshape a permission into a capability you do not hold',
    'P1.23 · ni account:select a account:*');
select lives_ok(
    $$ update cms.permissions set description = 'solo texto' where id = cms_tests.test_uuid(9752) $$,
    'P1.24 · editar la descripción sigue permitido');

-- Almacenamiento: A tiene `docs` con patrón `*` y deniega `archive/*`.
select is(cms.storage_capability_is_grantable('select', 'docs', 'team/*'), true,
    'P1.25 · una denegación que no se solapa (archive/) no impide delegar team/');
select is(cms.can_grant_permission(cms_tests.test_uuid(9766)), true,
    'P1.26 · ni public/');
select is(cms.can_grant_permission(cms_tests.test_uuid(9756)), false,
    'P1.27 · pero sí impide delegar el patrón `*`, que incluye archive/');

set local role postgres;
insert into cms.account_permissions (account_id, permission_id, is_grant) values
    (cms_tests.test_uuid(9711), cms_tests.test_uuid(9757), false);
select cms_tests.authenticate_as('iso_a');

select is(cms.storage_capability_is_grantable('select', 'docs', 'team/*'), false,
    'P1.28 · una denegación sobre team/secret/ impide delegar team/ (se solapan)');
select is(cms.can_grant_permission(cms_tests.test_uuid(9737)), false,
    'P1.29 · can_grant_permission aplica la misma regla al permiso guardado');
select is(cms.storage_capability_is_grantable('select', 'docs', 'public/*'), true,
    'P1.30 · public/ sigue siendo delegable');
select throws_ok(
    $$ update cms.permissions set metadata = '{"bucket_name": "docs", "path_pattern": "team/*"}'::jsonb
       where id = cms_tests.test_uuid(9766) $$,
    '42501', 'insufficient_privilege: cannot reshape a permission into a storage capability you do not hold',
    'P1.31 · A no reorienta un permiso de almacenamiento hacia un patrón que solapa su denegación');

-- La API valida un permiso antes de guardarlo con la misma función.
select is(cms.capability_is_grantable('data', null, 'select', 'table', '*', '*', null, '{}'::jsonb), false,
    'P1.32 · capability_is_grantable (API) rechaza *.* para A');
select is(cms.capability_is_grantable('system', 'account', '*', null, null, null, null, '{}'::jsonb), false,
    'P1.33 · y account:*');
select is(cms.capability_is_grantable('data', null, 'select', 'table', 'public', 'iso_other', null, '{}'::jsonb), true,
    'P1.34 · pero acepta public.iso_other');

-- Las funciones auxiliares no son ejecutables por el personal.
select throws_ok(
    $$ select cms.account_has_overlapping_deny(cms_tests.iso_root_account(), null::cms.permissions) $$,
    '42501', null,
    'P1.35 · account_has_overlapping_deny no es ejecutable por el personal');

-- ---------------------------------------------------------------------------
-- P2 · Asignaciones de roles, rango y cuenta raíz de OTRAS cuentas (B-47)
-- ---------------------------------------------------------------------------

-- C (Soporte, rango 40): acceso al CMS pero sin `account:select`.
select cms_tests.authenticate_as('iso_c');

select results_eq(
    $$ select account_id from cms.account_roles $$,
    array[cms_tests.test_uuid(9713)],
    'P2.1 · C solo ve su propia asignación de rol');
select is_empty(
    $$ select 1 from cms.account_roles where account_id = cms_tests.iso_root_account() $$,
    'P2.2 · C no ve el rol de Root');
select is(cms.get_user_max_role_rank(cms_tests.test_uuid(9713)), 40,
    'P2.3 · get_user_max_role_rank responde por la propia cuenta');
select is(cms.get_user_max_role_rank(cms_tests.iso_root_account()), null,
    'P2.4 · get_user_max_role_rank no responde por Root');
select is(cms.get_user_max_role_rank(cms_tests.test_uuid(9711)), null,
    'P2.5 · ni por A');
select is(cms.is_root_managed_account(cms_tests.iso_root_account()), false,
    'P2.6 · is_root_managed_account no responde por Root');
select throws_ok(
    $$ select cms.account_is_root_managed(cms_tests.iso_root_account()) $$,
    '42501', null,
    'P2.7 · la versión interna no es ejecutable por el personal');
select is(cms.count_role_members(cms_tests.test_uuid(9721)), 2,
    'P2.8 · el número de miembros de un rol sigue disponible');
select is(cms.current_account_outranks(cms_tests.iso_root_account()), false,
    'P2.9 · current_account_outranks: C no supera a Root');
select is(cms.current_account_outranks(cms_tests.test_uuid(9714)), true,
    'P2.10 · current_account_outranks: C supera a D (rango 20)');

-- A (rango 60) tiene account:* salvo delete: account:select le basta.
select cms_tests.authenticate_as('iso_a');

select isnt_empty(
    $$ select 1 from cms.account_roles where account_id = cms_tests.iso_root_account() $$,
    'P2.11 · con account:select se ven las asignaciones de otros');
select is(cms.get_user_max_role_rank(cms_tests.iso_root_account()), 100,
    'P2.12 · con account:select get_user_max_role_rank responde por otros');
select is(cms.is_root_managed_account(cms_tests.iso_root_account()), true,
    'P2.13 · con account:select is_root_managed_account responde por otros');

select * from finish();

rollback;
