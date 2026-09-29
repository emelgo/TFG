-- Test file: has_data_permission.test.sql
-- Tests cms.has_data_permission function through actual operations
-- This tests data permission management through RLS policies and business rules

BEGIN;

-- PymeKit exige MFA en el CMS por defecto (ADR-014); esa regla se prueba en
-- cms-super-admin-root.test.sql. Aquí se valida la lógica funcional con
-- sesiones sin segundo factor, así que se desactiva el requisito de forma
-- explícita. El ROLLBACK final deshace el cambio.
update cms.configuration set value = 'false' where key = 'requires_mfa';

SELECT no_plan();

-- Clean up any existing test data
DELETE FROM cms.permission_groups;
DELETE FROM cms.account_roles;
DELETE FROM cms.role_permissions;
-- Clean up dashboard tables (must be in dependency order)
DELETE FROM cms.dashboard_role_shares;
DELETE FROM cms.dashboard_widgets;
DELETE FROM cms.dashboards;
DELETE FROM cms.accounts;
DELETE FROM cms.roles;
DELETE FROM cms.permissions;

-- Create test users
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(1), 'data_admin', 'dataadmin@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(2), 'table_user', 'tableuser@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(3), 'no_permission_user', 'noperm@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(4), 'schema_user', 'schemauser@test.com');

-- Create accounts
INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(1), true),  -- Data Admin account
    (cms_tests.test_uuid(102), cms_tests.test_uuid(2), true),  -- Table User account  
    (cms_tests.test_uuid(103), cms_tests.test_uuid(3), true),  -- No Permission User account
    (cms_tests.test_uuid(104), cms_tests.test_uuid(4), true);  -- Schema User account

-- Create roles with different priorities
INSERT INTO cms.roles (id, name, rank, description) VALUES
    (cms_tests.test_uuid(201), 'Data Admin', 90, 'Data administration role'),
    (cms_tests.test_uuid(202), 'Table User', 30, 'Table-level access role'),
    (cms_tests.test_uuid(203), 'No Permissions', 10, 'Role with no data permissions'),
    (cms_tests.test_uuid(204), 'Schema User', 40, 'Schema-level access role');

-- Create data permissions for testing
INSERT INTO cms.permissions (id, name, permission_type, scope, schema_name, table_name, action) VALUES
    -- Table-level permissions
    (cms_tests.test_uuid(301), 'public_users_select', 'data', 'table', 'public', 'users', 'select'),
    (cms_tests.test_uuid(302), 'public_users_insert', 'data', 'table', 'public', 'users', 'insert'),
    (cms_tests.test_uuid(303), 'public_users_update', 'data', 'table', 'public', 'users', 'update'),
    (cms_tests.test_uuid(304), 'public_users_delete', 'data', 'table', 'public', 'users', 'delete'),
    (cms_tests.test_uuid(305), 'public_products_select', 'data', 'table', 'public', 'products', 'select'),
    -- Wildcard permissions
    (cms_tests.test_uuid(306), 'public_all_tables_select', 'data', 'table', 'public', '*', 'select'),
    (cms_tests.test_uuid(307), 'all_schemas_users_select', 'data', 'table', '*', 'users', 'select'),
    (cms_tests.test_uuid(308), 'all_all_select', 'data', 'table', '*', '*', 'select'),
    -- Wildcard action
    (cms_tests.test_uuid(309), 'public_orders_all', 'data', 'table', 'public', 'orders', '*');

-- Assign roles to accounts
INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(201)),  -- Data Admin
    (cms_tests.test_uuid(102), cms_tests.test_uuid(202)),  -- Table User
    (cms_tests.test_uuid(103), cms_tests.test_uuid(203)),  -- No Permissions User
    (cms_tests.test_uuid(104), cms_tests.test_uuid(204));  -- Schema User

-- Grant permissions to roles
INSERT INTO cms.role_permissions (role_id, permission_id) VALUES
    -- Data Admin gets comprehensive permissions
    (cms_tests.test_uuid(201), cms_tests.test_uuid(301)),  -- public.users select
    (cms_tests.test_uuid(201), cms_tests.test_uuid(302)),  -- public.users insert
    (cms_tests.test_uuid(201), cms_tests.test_uuid(303)),  -- public.users update
    (cms_tests.test_uuid(201), cms_tests.test_uuid(304)),  -- public.users delete
    (cms_tests.test_uuid(201), cms_tests.test_uuid(305)),  -- public.products select
    (cms_tests.test_uuid(201), cms_tests.test_uuid(309)),  -- public.orders all actions
    -- Table User gets limited permissions
    (cms_tests.test_uuid(202), cms_tests.test_uuid(301)),  -- public.users select only
    (cms_tests.test_uuid(202), cms_tests.test_uuid(305)),  -- public.products select only
    -- Schema User gets wildcard permissions  
    (cms_tests.test_uuid(204), cms_tests.test_uuid(306)),  -- public.* select
    (cms_tests.test_uuid(204), cms_tests.test_uuid(307));  -- *.users select

-- Test 1: User without admin access cannot use has_data_permission
SELECT cms_tests.authenticate_as('no_permission_user');
SELECT cms_tests.set_admin_access('noperm@test.com', 'false');

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', 'users')),
    false,
    'User without admin access cannot use has_data_permission'
);

-- Restore admin access for remaining tests
SELECT cms_tests.set_admin_access('noperm@test.com', 'true');

-- Test 2: Data Admin can access tables they have permission for
SELECT cms_tests.authenticate_as('data_admin');

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', 'users')),
    true,
    'Data Admin can select from public.users'
);

SELECT is(
    (SELECT cms.has_data_permission('insert'::cms.system_action, 'public', 'users')),
    true,
    'Data Admin can insert into public.users'
);

SELECT is(
    (SELECT cms.has_data_permission('update'::cms.system_action, 'public', 'users')),
    true,
    'Data Admin can update public.users'
);

SELECT is(
    (SELECT cms.has_data_permission('delete'::cms.system_action, 'public', 'users')),
    true,
    'Data Admin can delete from public.users'
);

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', 'products')),
    true,
    'Data Admin can select from public.products'
);

-- Test 3: Data Admin cannot access tables/actions they don't have permission for
SELECT is(
    (SELECT cms.has_data_permission('insert'::cms.system_action, 'public', 'products')),
    false,
    'Data Admin cannot insert into public.products (no permission)'
);

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'private', 'users')),
    false,
    'Data Admin cannot select from private.users (no permission)'
);

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', 'nonexistent')),
    false,
    'Data Admin cannot select from public.nonexistent (no permission)'
);

-- Test 4: Wildcard action permission allows all actions
SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', 'orders')),
    true,
    'Data Admin can select from public.orders (wildcard action)'
);

SELECT is(
    (SELECT cms.has_data_permission('insert'::cms.system_action, 'public', 'orders')),
    true,
    'Data Admin can insert into public.orders (wildcard action)'
);

SELECT is(
    (SELECT cms.has_data_permission('update'::cms.system_action, 'public', 'orders')),
    true,
    'Data Admin can update public.orders (wildcard action)'
);

SELECT is(
    (SELECT cms.has_data_permission('delete'::cms.system_action, 'public', 'orders')),
    true,
    'Data Admin can delete from public.orders (wildcard action)'
);

-- Test 5: Table User has limited permissions
SELECT cms_tests.authenticate_as('table_user');

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', 'users')),
    true,
    'Table User can select from public.users'
);

SELECT is(
    (SELECT cms.has_data_permission('insert'::cms.system_action, 'public', 'users')),
    false,
    'Table User cannot insert into public.users (no permission)'
);

SELECT is(
    (SELECT cms.has_data_permission('update'::cms.system_action, 'public', 'users')),
    false,
    'Table User cannot update public.users (no permission)'
);

SELECT is(
    (SELECT cms.has_data_permission('delete'::cms.system_action, 'public', 'users')),
    false,
    'Table User cannot delete from public.users (no permission)'
);

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', 'products')),
    true,
    'Table User can select from public.products'
);

-- Test 6: User with no data permissions cannot access anything
SELECT cms_tests.authenticate_as('no_permission_user');

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', 'users')),
    false,
    'No Permission User cannot select from public.users'
);

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', 'products')),
    false,
    'No Permission User cannot select from public.products'
);

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', 'orders')),
    false,
    'No Permission User cannot select from public.orders'
);

-- Test 7: Schema User can access via wildcard permissions
SELECT cms_tests.authenticate_as('schema_user');

-- Test public.* select permission
SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', 'users')),
    true,
    'Schema User can select from public.users (public.* wildcard)'
);

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', 'products')),
    true,
    'Schema User can select from public.products (public.* wildcard)'
);

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', 'orders')),
    true,
    'Schema User can select from public.orders (public.* wildcard)'
);

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', 'any_table')),
    true,
    'Schema User can select from public.any_table (public.* wildcard)'
);

-- Test *.users select permission  
SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'private', 'users')),
    true,
    'Schema User can select from private.users (*.users wildcard)'
);

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'admin', 'users')),
    true,
    'Schema User can select from admin.users (*.users wildcard)'
);

-- Test limitations of wildcard permissions
SELECT is(
    (SELECT cms.has_data_permission('insert'::cms.system_action, 'public', 'users')),
    false,
    'Schema User cannot insert into public.users (only select permission)'
);

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'private', 'products')),
    false,
    'Schema User cannot select from private.products (no wildcard match)'
);

-- Test 8: Invalid parameters return false
SELECT cms_tests.authenticate_as('data_admin');

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, NULL, 'users')),
    false,
    'Function returns false for NULL schema'
);

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', NULL)),
    false,
    'Function returns false for NULL table'
);

-- Test 9: Function respects role assignment validity
-- Remove role from user and verify permissions are lost
SET ROLE postgres;

-- remove constraint to allow invalid role assignment
ALTER TABLE cms.account_roles DROP CONSTRAINT valid_time_range;

UPDATE cms.account_roles 
SET valid_until = now() - interval '1 second'
WHERE account_id = cms_tests.test_uuid(102);

SELECT cms_tests.authenticate_as('table_user');

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', 'users')),
    false,
    'Table User loses permissions when role assignment expires'
);

-- Restore role assignment
SET ROLE postgres;

UPDATE cms.account_roles 
SET valid_until = NULL
WHERE account_id = cms_tests.test_uuid(102);

-- Test 10: Function respects permission validity
-- Expire a permission and verify it's no longer accessible
ALTER TABLE cms.role_permissions DROP CONSTRAINT valid_time_range;

UPDATE cms.role_permissions 
SET valid_until = now() - interval '1 second'
WHERE role_id = cms_tests.test_uuid(202) AND permission_id = cms_tests.test_uuid(301);

SELECT cms_tests.authenticate_as('table_user');

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', 'users')),
    false,
    'Table User loses access when specific permission expires'
);

-- But other permissions should still work
SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', 'products')),
    true,
    'Table User retains other valid permissions'
);

-- Restore permission
UPDATE cms.role_permissions 
SET valid_until = NULL
WHERE role_id = cms_tests.test_uuid(202) AND permission_id = cms_tests.test_uuid(301);

-- Test 11: Function works with role rank changes
-- Lower the rank of Data Admin role and verify they can still access their permissions
UPDATE cms.roles 
SET rank = 85
WHERE id = cms_tests.test_uuid(201);

SELECT cms_tests.authenticate_as('data_admin');

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', 'users')),
    true,
    'Data Admin retains permissions after role rank change'
);

-- Test 12: Multiple valid permission paths
-- Create an additional permission that would also grant access
SET ROLE postgres;

INSERT INTO cms.permissions (id, name, permission_type, scope, schema_name, table_name, action) VALUES
    (cms_tests.test_uuid(310), 'alternate_users_select', 'data', 'table', 'public', 'users', 'select');

INSERT INTO cms.role_permissions (role_id, permission_id) VALUES
    (cms_tests.test_uuid(202), cms_tests.test_uuid(310));

SELECT cms_tests.authenticate_as('table_user');

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', 'users')),
    true,
    'Table User has access via multiple permission paths'
);

-- Test 13: Case sensitivity test (schema and table names should be case sensitive)
SELECT cms_tests.authenticate_as('data_admin');

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'PUBLIC', 'users')),
    false,
    'Function is case sensitive for schema names'
);

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', 'USERS')),
    false,
    'Function is case sensitive for table names'
);

-- Test 14: Edge case - empty string parameters
SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, '', 'users')),
    false,
    'Function handles empty schema name correctly'
);

SELECT is(
    (SELECT cms.has_data_permission('select'::cms.system_action, 'public', '')),
    false,
    'Function handles empty table name correctly'
);

SELECT finish();

ROLLBACK;