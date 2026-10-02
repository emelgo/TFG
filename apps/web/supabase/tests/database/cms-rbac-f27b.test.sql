-- Pruebas del endurecimiento del RBAC del CMS para Ajustes > Permisos
-- (PymeKit, F2.7b; migración 20260930170000_cms_rbac_f27b).
--
-- A · Pendiente (a) de ADR-015: las funciones que respondían sí/no sobre
--     CUALQUIER cuenta ya no filtran información (`has_permission`,
--     `build_where_clause` y `lock_resources_ordered` no son ejecutables por
--     `authenticated`; `account_has_role`, `can_view_permission_group`,
--     `can_modify_account_role` y `can_modify_role_permission_group` solo
--     responden sobre la cuenta de la sesión).
-- B · Pendiente (b): compartir una vista guardada exige ser su creador.
-- C · Pendiente (c): los permisos de almacenamiento fallan en cerrado (sin
--     bucket o patrón explícito no conceden nada; el comodín es '*') y se
--     conceden por su capacidad.
-- D · Intentos de escalada por las funciones y políticas que usan los
--     endpoints nuevos: rangos, capacidades que no se tienen, ensanchar un
--     permiso ya asignado, tocar el propio rol, borrar lo que usan rangos
--     superiores.
-- E · Los objetos de sistema del super-admin (rol Root, grupo Super Admin,
--     permisos `Root: *`) son inmutables desde una sesión de usuario, incluso
--     para otro super-admin, y el pegamento de ADR-014 sigue funcionando.
-- F · UPDATE por columnas en roles, grupos y permisos.
--
-- [TFG] RF-09 · RNF-02 · ADR-014 · ADR-015.

begin;

select no_plan();

-- La obligación de MFA se prueba en cms-super-admin-root.test.sql: aquí se
-- desactiva para centrarse en las reglas del RBAC.
update cms.configuration set value = 'false' where key = 'requires_mfa';

-- ---------------------------------------------------------------------------
-- Preparación (como `postgres`, sin RLS)
-- ---------------------------------------------------------------------------

select cms_tests.create_supabase_user(cms_tests.test_uuid(9901), 'rb_root', 'root@rbac-f27b.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9902), 'rb_admin', 'admin@rbac-f27b.test');
select cms_tests.create_supabase_user(cms_tests.test_uuid(9903), 'rb_low', 'low@rbac-f27b.test');

-- Un super-admin de la plataforma: el pegamento de ADR-014 le da el rol Root.
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "super-admin"}'::jsonb
where id = cms_tests.test_uuid(9901);

insert into cms.accounts (id, auth_user_id, is_active) values
    (cms_tests.test_uuid(9912), cms_tests.test_uuid(9902), true),
    (cms_tests.test_uuid(9913), cms_tests.test_uuid(9903), true);

-- Delegado (rango 80): gestiona roles y permisos y lee `public.rb_items`.
-- Bajo (rango 20): solo auditoría. Rol «víctima» de rango 10 sin miembros.
insert into cms.roles (id, name, rank, description) values
    (cms_tests.test_uuid(9921), 'RB admin', 80, 'Delegado'),
    (cms_tests.test_uuid(9922), 'RB low', 20, 'Solo auditoría'),
    (cms_tests.test_uuid(9923), 'RB victim', 10, 'Rango mínimo');

create table public.rb_items (id uuid primary key default gen_random_uuid(), name text not null);
create table public.rb_secret (id uuid primary key default gen_random_uuid(), name text not null);

insert into cms.table_metadata (schema_name, table_name, display_name, is_searchable, is_visible, columns_config, ui_config)
values ('public', 'rb_items', 'Items', false, true, '{"id": {"name": "id"}, "name": {"name": "name"}}'::jsonb, '{}'::jsonb),
       ('public', 'rb_secret', 'Secret', false, true, '{"id": {"name": "id"}}'::jsonb, '{}'::jsonb);

insert into cms.permissions (id, name, permission_type, system_resource, action) values
    (cms_tests.test_uuid(9931), 'rb_role_all', 'system', 'role', '*'),
    (cms_tests.test_uuid(9932), 'rb_permission_all', 'system', 'permission', '*'),
    (cms_tests.test_uuid(9933), 'rb_log_select', 'system', 'log', 'select'),
    (cms_tests.test_uuid(9934), 'rb_account_all', 'system', 'account', '*');

insert into cms.permissions (id, name, permission_type, scope, schema_name, table_name, action) values
    (cms_tests.test_uuid(9935), 'rb_items_select', 'data', 'table', 'public', 'rb_items', 'select'),
    (cms_tests.test_uuid(9936), 'rb_secret_select', 'data', 'table', 'public', 'rb_secret', 'select');

insert into cms.permissions (id, name, permission_type, scope, action, metadata) values
    (cms_tests.test_uuid(9937), 'rb_docs_team', 'data', 'storage', 'select',
     '{"bucket_name": "docs", "path_pattern": "team/*"}'::jsonb);

insert into cms.role_permissions (role_id, permission_id) values
    (cms_tests.test_uuid(9921), cms_tests.test_uuid(9931)),
    (cms_tests.test_uuid(9921), cms_tests.test_uuid(9932)),
    (cms_tests.test_uuid(9921), cms_tests.test_uuid(9933)),
    (cms_tests.test_uuid(9921), cms_tests.test_uuid(9935)),
    (cms_tests.test_uuid(9921), cms_tests.test_uuid(9937)),
    (cms_tests.test_uuid(9922), cms_tests.test_uuid(9933));

insert into cms.account_roles (account_id, role_id) values
    (cms_tests.test_uuid(9912), cms_tests.test_uuid(9921)),
    (cms_tests.test_uuid(9913), cms_tests.test_uuid(9922));

-- Grupo con un permiso que el delegado NO tiene (`account:*`) y grupo con
-- uno que sí tiene.
insert into cms.permission_groups (id, name, created_by) values
    (cms_tests.test_uuid(9941), 'RB broad group', cms_tests.test_uuid(9912)),
    (cms_tests.test_uuid(9942), 'RB items group', cms_tests.test_uuid(9912));

insert into cms.permission_group_permissions (group_id, permission_id) values
    (cms_tests.test_uuid(9941), cms_tests.test_uuid(9934)),
    (cms_tests.test_uuid(9942), cms_tests.test_uuid(9935));

-- Ids que `authenticated` no siempre puede leer por sí mismo.
create function cms_tests.rb_root_account() returns uuid
    language sql stable security definer set search_path = '' as $$
    select id from cms.accounts where auth_user_id = '00000000-0000-0000-0000-000000009901'::uuid;
$$;

create function cms_tests.rb_root_role() returns uuid
    language sql stable security definer set search_path = '' as $$
    select id from cms.roles where metadata @> '{"system_role": "root"}'::jsonb;
$$;

create function cms_tests.rb_root_group() returns uuid
    language sql stable security definer set search_path = '' as $$
    select id from cms.permission_groups where metadata @> '{"system_group": "root"}'::jsonb;
$$;

create function cms_tests.rb_root_data_permission() returns uuid
    language sql stable security definer set search_path = '' as $$
    select id from cms.permissions where name = 'Root: data';
$$;

grant execute on function cms_tests.rb_root_account(), cms_tests.rb_root_role(),
    cms_tests.rb_root_group(), cms_tests.rb_root_data_permission() to authenticated;

select isnt(cms_tests.rb_root_account(), null, 'Preparación: el super-admin tiene cuenta del CMS (ADR-014)');

-- ---------------------------------------------------------------------------
-- A · Funciones que filtraban respuestas sí/no sobre otras cuentas
-- ---------------------------------------------------------------------------

select ok(not has_function_privilege('authenticated', 'cms.has_permission(uuid, uuid)', 'EXECUTE'),
    'A1 · authenticated no puede ejecutar has_permission');
select ok(not has_function_privilege('authenticated', 'cms.build_where_clause(text, text, jsonb)', 'EXECUTE'),
    'A2 · authenticated no puede ejecutar build_where_clause');
select ok(not has_function_privilege('authenticated', 'cms.lock_resources_ordered(uuid[], uuid[], uuid[], uuid[])', 'EXECUTE'),
    'A3 · authenticated no puede ejecutar lock_resources_ordered');
select ok(not has_function_privilege('authenticated', 'cms.guard_system_rbac_objects()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'cms.is_system_rbac_object(text, uuid)', 'EXECUTE'),
    'A4 · la guardia de sistema y su auxiliar no son ejecutables por authenticated');
select ok(has_function_privilege('authenticated', 'cms.current_account_has_storage_access()', 'EXECUTE'),
    'A5 · la API puede preguntar por su propio acceso al almacenamiento');

select cms_tests.authenticate_as('rb_low');

select throws_ok(
    $$ select cms.has_permission(cms_tests.rb_root_account(), cms_tests.rb_root_data_permission()) $$,
    '42501', null,
    'A6 · el personal no puede preguntar qué permisos tiene Root');

select is(cms.account_has_role(cms_tests.rb_root_account(), cms_tests.rb_root_role()), false,
    'A7 · account_has_role no revela el rol de otra cuenta sin account:select');
select is(cms.account_has_role(cms_tests.test_uuid(9913), cms_tests.test_uuid(9922)), true,
    'A8 · account_has_role sigue respondiendo sobre la propia cuenta');
select is(cms.can_view_permission_group(cms_tests.rb_root_account(), cms_tests.rb_root_group()), false,
    'A9 · can_view_permission_group no responde por otra cuenta');

select cms_tests.authenticate_as('rb_admin');

-- El delegado se hace pasar por Root como «actor» de las funciones.
select is(
    cms.can_modify_account_role(cms_tests.rb_root_account(), cms_tests.test_uuid(9913),
                                cms_tests.test_uuid(9921), 'insert'),
    false,
    'A10 · can_modify_account_role ignora un actor distinto de la sesión');
select is(
    cms.can_modify_role_permission_group(cms_tests.rb_root_account(), cms_tests.test_uuid(9921), 'insert'),
    false,
    'A11 · can_modify_role_permission_group ignora un actor distinto de la sesión');
select is(
    cms.can_modify_account_role(cms_tests.test_uuid(9912), cms_tests.test_uuid(9913),
                                cms_tests.test_uuid(9923), 'insert'),
    true,
    'A12 · con su propia cuenta la regla de rango sigue funcionando');

-- ---------------------------------------------------------------------------
-- B · saved_view_roles: solo el creador comparte su vista
-- ---------------------------------------------------------------------------

set local role postgres;

insert into cms.saved_views (id, name, view_type, config, created_by, schema_name, table_name) values
    (cms_tests.test_uuid(9951), 'Vista del bajo', 'filter', '{}'::jsonb, cms_tests.test_uuid(9913), 'public', 'rb_items'),
    (cms_tests.test_uuid(9952), 'Vista del delegado', 'filter', '{}'::jsonb, cms_tests.test_uuid(9912), 'public', 'rb_items');

select cms_tests.authenticate_as('rb_admin');

select throws_ok(
    $$ insert into cms.saved_view_roles (view_id, role_id)
       values (cms_tests.test_uuid(9951), cms_tests.test_uuid(9923)) $$,
    '42501', null,
    'B1 · el delegado no puede compartir la vista personal de otro');

select lives_ok(
    $$ insert into cms.saved_view_roles (view_id, role_id)
       values (cms_tests.test_uuid(9952), cms_tests.test_uuid(9923)) $$,
    'B2 · el creador sí comparte su vista con un rol inferior');

select throws_ok(
    $$ insert into cms.saved_view_roles (view_id, role_id)
       values (cms_tests.test_uuid(9952), cms_tests.test_uuid(9921)) $$,
    '42501', null,
    'B3 · ni con un rol de su mismo rango');

-- ---------------------------------------------------------------------------
-- C · Almacenamiento: fallo en cerrado y comodín explícito
-- ---------------------------------------------------------------------------

set local role postgres;

select throws_ok(
    $$ insert into cms.permissions (name, permission_type, scope, action, metadata)
       values ('rb_storage_no_bucket', 'data', 'storage', 'select', '{"path_pattern": "*"}'::jsonb) $$,
    '23514', null,
    'C1 · un permiso de almacenamiento sin bucket no se puede guardar');

select throws_ok(
    $$ insert into cms.permissions (name, permission_type, scope, action, metadata)
       values ('rb_storage_empty', 'data', 'storage', 'select', '{"bucket_name": "", "path_pattern": "*"}'::jsonb) $$,
    '23514', null,
    'C2 · ni con un bucket vacío');

select throws_ok(
    $$ insert into cms.permissions (name, permission_type, scope, action, metadata)
       values ('rb_storage_number', 'data', 'storage', 'select', '{"bucket_name": 1, "path_pattern": "*"}'::jsonb) $$,
    '23514', null,
    'C3 · ni con un bucket que no es texto');

select throws_ok(
    $$ insert into cms.permissions (name, permission_type, system_resource, scope, action, metadata)
       values ('rb_storage_system', 'system', 'log', 'storage', 'select', '{"bucket_name": "*", "path_pattern": "*"}'::jsonb) $$,
    '23514', null,
    'C4 · un permiso de sistema no puede tener ámbito storage');

select throws_ok(
    $$ insert into cms.permissions (name, permission_type, action, metadata)
       values ('rb_storage_no_scope', 'data', 'select', '{"bucket_name": "*", "path_pattern": "*"}'::jsonb) $$,
    '23514', null,
    'C4b · ni un permiso de datos sin ámbito (un NULL no hace pasar la restricción)');

-- Permiso heredado sin bucket ni patrón (como los que admitía el código de
-- partida): se fuerza quitando la restricción dentro de esta transacción.
alter table cms.permissions drop constraint valid_permission_type;

insert into cms.permissions (id, name, permission_type, scope, action, metadata) values
    (cms_tests.test_uuid(9938), 'rb_legacy_storage', 'data', 'storage', 'select', '{}'::jsonb);

insert into cms.role_permissions (role_id, permission_id) values
    (cms_tests.test_uuid(9922), cms_tests.test_uuid(9938));

select cms_tests.authenticate_as('rb_low');

select is(cms.has_storage_permission('any-bucket', 'select', 'folder/file.txt'), false,
    'C5 · un permiso sin bucket ni patrón ya no es un comodín');
select is(cms.current_account_has_storage_access(), false,
    'C6 · tampoco muestra la sección de almacenamiento');
select is(cms.storage_capability_is_grantable('select', 'any-bucket', 'folder/*'), false,
    'C7 · ni permite conceder almacenamiento a otros');

select cms_tests.authenticate_as('rb_admin');

select is(cms.has_storage_permission('docs', 'select', 'team/a.txt'), true,
    'C8 · el patrón explícito concede su ruta');
select is(cms.has_storage_permission('docs', 'select', 'other/a.txt'), false,
    'C9 · y nada fuera de ella');
select is(cms.has_storage_permission('photos', 'select', 'team/a.txt'), false,
    'C10 · ni en otro bucket');
select is(cms.storage_capability_is_grantable('select', 'docs', 'team/*'), true,
    'C11 · puede conceder exactamente lo que tiene');
select is(cms.storage_capability_is_grantable('select', 'docs', '*'), false,
    'C12 · pero no ensancharlo a todo el bucket');
select is(cms.storage_capability_is_grantable('select', 'docs', null), false,
    'C13 · un patrón ausente no es un comodín');

set local role postgres;

-- Solo `*` es comodín: `_` y `%` del patrón son literales.
insert into cms.permissions (id, name, permission_type, scope, action, metadata) values
    (cms_tests.test_uuid(9939), 'rb_docs_underscore', 'data', 'storage', 'select',
     '{"bucket_name": "docs", "path_pattern": "a_b/*"}'::jsonb);

insert into cms.role_permissions (role_id, permission_id) values
    (cms_tests.test_uuid(9921), cms_tests.test_uuid(9939));

-- Permiso nuevo con la capacidad exacta que tiene el delegado.
insert into cms.permissions (id, name, permission_type, scope, action, metadata) values
    (cms_tests.test_uuid(9940), 'rb_docs_team_copy', 'data', 'storage', 'select',
     '{"bucket_name": "docs", "path_pattern": "team/*"}'::jsonb),
    (cms_tests.test_uuid(9943), 'rb_docs_all', 'data', 'storage', 'select',
     '{"bucket_name": "docs", "path_pattern": "*"}'::jsonb);

select cms_tests.authenticate_as('rb_admin');

select is(cms.has_storage_permission('docs', 'select', 'aXb/file.txt'), false,
    'C14 · `_` no actúa como comodín de LIKE');
select is(cms.has_storage_permission('docs', 'select', 'a_b/file.txt'), true,
    'C15 · y el patrón literal sí coincide');
select is(cms.can_grant_permission(cms_tests.test_uuid(9940)), true,
    'C16 · can_grant_permission evalúa el almacenamiento por capacidad (permiso nuevo e idéntico)');
select is(cms.can_grant_permission(cms_tests.test_uuid(9943)), false,
    'C17 · y rechaza uno más amplio');

select cms_tests.authenticate_as('rb_root');

select is(cms.can_grant_permission(cms_tests.test_uuid(9943)), true,
    'C18 · Root (comodín explícito) puede conceder un permiso de almacenamiento nuevo');
select is(cms.has_storage_permission('anything', 'delete', 'x/y.png'), true,
    'C19 · el comodín explícito de Root sigue funcionando');

-- ---------------------------------------------------------------------------
-- D · Intentos de escalada del delegado (rango 80)
-- ---------------------------------------------------------------------------

select cms_tests.authenticate_as('rb_admin');

select throws_ok(
    $$ insert into cms.roles (name, rank) values ('RB peer', 80) $$,
    '42501', null,
    'D1 · no crea un rol de su mismo rango');
select throws_ok(
    $$ insert into cms.roles (name, rank) values ('RB boss', 95) $$,
    '42501', null,
    'D2 · ni uno superior');
select lives_ok(
    $$ insert into cms.roles (id, name, rank) values (cms_tests.test_uuid(9924), 'RB junior', 50) $$,
    'D3 · sí uno inferior');
select throws_ok(
    $$ update cms.roles set rank = 85 where id = cms_tests.test_uuid(9924) $$,
    'P0001', null,
    'D4 · no sube un rol inferior por encima de su rango');
select results_eq(
    $$ with u as (update cms.roles set rank = 90 where id = cms_tests.test_uuid(9921) returning 1)
       select count(*)::int from u $$,
    $$ values (0) $$,
    'D5 · no edita su propio rol');
select throws_ok(
    $$ insert into cms.role_permission_groups (role_id, group_id)
       values (cms_tests.test_uuid(9921), cms_tests.test_uuid(9942)) $$,
    '42501', null,
    'D6 · no cuelga grupos de su propio rol');
select throws_ok(
    $$ insert into cms.role_permission_groups (role_id, group_id)
       values (cms_tests.test_uuid(9924), cms_tests.test_uuid(9941)) $$,
    '42501', null,
    'D7 · no asigna un grupo con un permiso que no tiene (account:*)');
select lives_ok(
    $$ insert into cms.role_permission_groups (role_id, group_id)
       values (cms_tests.test_uuid(9924), cms_tests.test_uuid(9942)) $$,
    'D8 · sí asigna un grupo con permisos que tiene');
select throws_ok(
    $$ insert into cms.role_permissions (role_id, permission_id)
       values (cms_tests.test_uuid(9924), cms_tests.test_uuid(9936)) $$,
    '42501', null,
    'D9 · no asigna directamente un permiso de datos que no tiene');
select throws_ok(
    $$ insert into cms.permission_group_permissions (group_id, permission_id)
       values (cms_tests.test_uuid(9942), cms_tests.test_uuid(9934)) $$,
    '42501', null,
    'D10 · no mete en un grupo un permiso que no tiene');

-- Ensanchar un permiso ya asignado (bitácora B-05 / trigger de reshape).
select lives_ok(
    $$ insert into cms.permissions (id, name, permission_type, scope, schema_name, table_name, action)
       values (cms_tests.test_uuid(9944), 'rb_items_copy', 'data', 'table', 'public', 'rb_items', 'select') $$,
    'D11 · crea un permiso estrecho que tiene');
select lives_ok(
    $$ insert into cms.role_permissions (role_id, permission_id)
       values (cms_tests.test_uuid(9924), cms_tests.test_uuid(9944)) $$,
    'D12 · y lo asigna al rol inferior');
select throws_ok(
    $$ update cms.permissions set schema_name = '*', table_name = '*' where id = cms_tests.test_uuid(9944) $$,
    '42501', null,
    'D13 · no lo ensancha después a todas las tablas');
select throws_ok(
    $$ update cms.permissions set table_name = 'rb_secret' where id = cms_tests.test_uuid(9944) $$,
    '42501', null,
    'D14 · ni lo cambia a una tabla que no puede leer');
select throws_ok(
    $$ update cms.permissions set action = '*' where id = cms_tests.test_uuid(9944) $$,
    '42501', null,
    'D15 · ni amplía su acción');
select throws_ok(
    $$ update cms.permissions set metadata = '{"bucket_name": "docs", "path_pattern": "*"}'::jsonb,
                                  scope = 'storage', schema_name = null, table_name = null
       where id = cms_tests.test_uuid(9944) $$,
    '42501', null,
    'D16 · ni lo convierte en un permiso de almacenamiento más amplio');
select lives_ok(
    $$ update cms.permissions set description = 'Solo lectura' where id = cms_tests.test_uuid(9944) $$,
    'D17 · editar la descripción sí se permite');

-- Borrar lo que usan rangos superiores.
select results_eq(
    $$ with d as (delete from cms.roles where id = cms_tests.rb_root_role() returning 1)
       select count(*)::int from d $$,
    $$ values (0) $$,
    'D18 · no borra el rol Root');
select results_eq(
    $$ with d as (delete from cms.roles where id = cms_tests.test_uuid(9921) returning 1)
       select count(*)::int from d $$,
    $$ values (0) $$,
    'D19 · ni su propio rol');
select results_eq(
    $$ with d as (delete from cms.permission_groups where id = cms_tests.rb_root_group() returning 1)
       select count(*)::int from d $$,
    $$ values (0) $$,
    'D20 · ni el grupo que usa Root');
select results_eq(
    $$ with d as (delete from cms.permissions where id = cms_tests.test_uuid(9935) returning 1)
       select count(*)::int from d $$,
    $$ values (0) $$,
    'D21 · ni un permiso que sigue asignado (a su propio rol)');

-- Un rol con miembros no se borra (la cascada les quitaría el rol).
set local role postgres;

insert into cms.accounts (id, auth_user_id, is_active)
select cms_tests.test_uuid(9914), cms_tests.create_supabase_user(cms_tests.test_uuid(9904), 'rb_junior', 'junior@rbac-f27b.test'), true;

insert into cms.account_roles (account_id, role_id) values
    (cms_tests.test_uuid(9914), cms_tests.test_uuid(9924));

select cms_tests.authenticate_as('rb_admin');

select throws_ok(
    $$ delete from cms.roles where id = cms_tests.test_uuid(9924) $$,
    'P0001', 'ROLE_HAS_MEMBERS',
    'D21b · no borra un rol inferior que todavía tiene miembros');

-- El personal sin permisos de rol no crea roles.
select cms_tests.authenticate_as('rb_low');

select throws_ok(
    $$ insert into cms.roles (name, rank) values ('RB sneaky', 5) $$,
    '42501', null,
    'D22 · sin role:insert no se crean roles, aunque el rango sea inferior');

-- ---------------------------------------------------------------------------
-- E · Objetos de sistema del super-admin
-- ---------------------------------------------------------------------------

select cms_tests.authenticate_as('rb_root');

select throws_ok(
    $$ update cms.permission_groups set name = 'Renombrado' where id = cms_tests.rb_root_group() $$,
    '42501', 'SYSTEM_RBAC_OBJECT_PROTECTED',
    'E1 · ni otro super-admin renombra el grupo Super Admin');
select throws_ok(
    $$ delete from cms.permission_group_permissions
       where group_id = cms_tests.rb_root_group() and permission_id = cms_tests.rb_root_data_permission() $$,
    '42501', 'SYSTEM_RBAC_OBJECT_PROTECTED',
    'E2 · ni le quita permisos');
select throws_ok(
    $$ insert into cms.permission_group_permissions (group_id, permission_id)
       values (cms_tests.rb_root_group(), cms_tests.test_uuid(9935)) $$,
    '42501', 'SYSTEM_RBAC_OBJECT_PROTECTED',
    'E3 · ni le añade permisos');
select throws_ok(
    $$ update cms.permissions set description = 'x' where id = cms_tests.rb_root_data_permission() $$,
    '42501', 'SYSTEM_RBAC_OBJECT_PROTECTED',
    'E4 · ni edita un permiso Root');
select throws_ok(
    $$ insert into cms.role_permission_groups (role_id, group_id)
       values (cms_tests.test_uuid(9924), cms_tests.rb_root_group()) $$,
    '42501', 'SYSTEM_RBAC_OBJECT_PROTECTED',
    'E5 · ni cuelga el grupo Super Admin de otro rol');
select throws_ok(
    $$ insert into cms.roles (name, rank, metadata) values ('Otro Root', 5, '{"system_role": "x"}'::jsonb) $$,
    '42501', 'SYSTEM_RBAC_OBJECT_PROTECTED',
    'E6 · ni crea un rol con marca de sistema');
select throws_ok(
    $$ update cms.roles set metadata = '{"system_role": "root2"}'::jsonb where id = cms_tests.test_uuid(9924) $$,
    '42501', 'SYSTEM_RBAC_OBJECT_PROTECTED',
    'E7 · ni añade la marca a un rol existente');
select throws_ok(
    $$ insert into cms.permissions (name, permission_type, system_resource, action, metadata)
       values ('Root: falso', 'system', 'log', 'select', '{"system_permission": "root"}'::jsonb) $$,
    '42501', 'SYSTEM_RBAC_OBJECT_PROTECTED',
    'E8 · ni crea un permiso marcado como de sistema');
select results_eq(
    $$ with u as (update cms.roles set name = 'Jefe' where id = cms_tests.rb_root_role() returning 1)
       select count(*)::int from u $$,
    $$ values (0) $$,
    'E9 · el rol Root no se renombra (rango: nadie lo supera)');
select lives_ok(
    $$ update cms.roles set description = 'Rol junior' where id = cms_tests.test_uuid(9924) $$,
    'E10 · Root sigue editando los roles normales');

-- El pegamento de ADR-014 (sin sesión de usuario) sigue funcionando.
set local role postgres;
select set_config('request.jwt.claims', '', true);

select is(cms.ensure_root_role(), cms_tests.rb_root_role(),
    'E11 · ensure_root_role (sistema) sigue funcionando con la guardia');

-- ---------------------------------------------------------------------------
-- F · UPDATE por columnas (bitácora B-35: se comprueba con pgTAP)
-- ---------------------------------------------------------------------------

select ok(not has_table_privilege('authenticated', 'cms.roles', 'UPDATE')
          and not has_table_privilege('authenticated', 'cms.permission_groups', 'UPDATE')
          and not has_table_privilege('authenticated', 'cms.permissions', 'UPDATE'),
    'F1 · authenticated no tiene UPDATE de tabla completa en roles, grupos ni permisos');
select ok(not has_column_privilege('authenticated', 'cms.roles', 'id', 'UPDATE')
          and not has_column_privilege('authenticated', 'cms.permission_groups', 'id', 'UPDATE')
          and not has_column_privilege('authenticated', 'cms.permissions', 'id', 'UPDATE'),
    'F2 · ni puede reescribir los ids');
select ok(not has_column_privilege('authenticated', 'cms.permission_groups', 'created_by', 'UPDATE'),
    'F3 · ni apropiarse de un grupo cambiando created_by');
select ok(has_column_privilege('authenticated', 'cms.roles', 'rank', 'UPDATE')
          and has_column_privilege('authenticated', 'cms.permission_groups', 'name', 'UPDATE')
          and has_column_privilege('authenticated', 'cms.permissions', 'metadata', 'UPDATE'),
    'F4 · conserva las columnas que la gestión necesita');

select cms_tests.authenticate_as('rb_admin');

select throws_ok(
    $$ update cms.permission_groups set created_by = cms_tests.test_uuid(9912)
       where id = cms_tests.test_uuid(9942) $$,
    '42501', null,
    'F5 · el UPDATE de created_by se rechaza');

select * from finish();

rollback;
