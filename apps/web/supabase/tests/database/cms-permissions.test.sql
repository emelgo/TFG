-- Test file: test_permissions_operations.sql
-- Tests actual CRUD operations on cms.permissions table
-- This tests permission management through RLS policies and business rules

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
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(1), 'super_admin', 'superadmin@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(2), 'manager', 'manager@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(3), 'regular_user', 'user@test.com');

-- Create accounts
INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(1), true),  -- Super Admin account
    (cms_tests.test_uuid(102), cms_tests.test_uuid(2), true),  -- Manager account  
    (cms_tests.test_uuid(103), cms_tests.test_uuid(3), true);  -- Regular User account

-- Create initial roles
INSERT INTO cms.roles (id, name, rank, description) VALUES
    (cms_tests.test_uuid(201), 'Super Admin', 100, 'Highest rank role'),
    (cms_tests.test_uuid(202), 'Manager', 50, 'Mid-level management role'),
    (cms_tests.test_uuid(203), 'User', 20, 'Standard user role');

-- Create initial permissions for permission management
INSERT INTO cms.permissions (id, name, permission_type, system_resource, action) VALUES
    (cms_tests.test_uuid(301), 'permission_insert', 'system', 'permission', 'insert'),
    (cms_tests.test_uuid(302), 'permission_update', 'system', 'permission', 'update'),
    (cms_tests.test_uuid(303), 'permission_delete', 'system', 'permission', 'delete'),
    (cms_tests.test_uuid(304), 'permission_select', 'system', 'permission', 'select');

-- Assign roles to accounts
INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(201)),  -- Super Admin
    (cms_tests.test_uuid(102), cms_tests.test_uuid(202)),  -- Manager
    (cms_tests.test_uuid(103), cms_tests.test_uuid(203));  -- User

-- Super Admin also holds the underlying public.users data capability. bug-hunt 10x01:
-- reshaping a permission now requires the actor to hold the target capability (mirroring
-- can_grant_permission), so a true super admin must hold the data capability it reshapes
-- a permission into (Tests 17/18 below).
INSERT INTO cms.permissions (id, name, permission_type, scope, schema_name, table_name, action) VALUES
    (cms_tests.test_uuid(305), 'users_table_update_cap', 'data', 'table', 'public', 'users', 'update');

-- Grant permissions to roles
INSERT INTO cms.role_permissions (role_id, permission_id) VALUES
    -- Super Admin gets all permission management rights
    (cms_tests.test_uuid(201), cms_tests.test_uuid(301)),
    (cms_tests.test_uuid(201), cms_tests.test_uuid(302)),
    (cms_tests.test_uuid(201), cms_tests.test_uuid(303)),
    (cms_tests.test_uuid(201), cms_tests.test_uuid(304)),
    -- ...plus the public.users data update capability (so it can reshape data permissions)
    (cms_tests.test_uuid(201), cms_tests.test_uuid(305)),
    -- Manager gets select and update permissions only
    (cms_tests.test_uuid(202), cms_tests.test_uuid(302)),
    (cms_tests.test_uuid(202), cms_tests.test_uuid(304));

-- Test 1: Unauthenticated user cannot view permissions
SET ROLE anon;

SELECT throws_ok(
    $$ SELECT * FROM cms.permissions $$,
    'permission denied for schema cms'
);

-- Test 2: Authenticated user with admin access can view permissions
SELECT cms_tests.authenticate_as('regular_user');

SELECT isnt_empty(
    $$ SELECT * FROM cms.permissions $$,
    'Authenticated user with admin access can view permissions'
);

-- Test 3: User without admin access cannot view permissions
SELECT cms_tests.set_admin_access('user@test.com', 'false');

SELECT is_empty(
    $$ SELECT * FROM cms.permissions $$,
    'User without admin access cannot view permissions'
);

-- Restore admin access
SELECT cms_tests.set_admin_access('user@test.com', 'true');

-- Test 4: User without permission management rights cannot create permissions
SELECT throws_ok(
    $$ INSERT INTO cms.permissions (id, name, permission_type, system_resource, action) 
       VALUES (cms_tests.test_uuid(310), 'test_permission', 'system', 'account', 'select') $$,
    'new row violates row-level security policy for table "permissions"',
    'User without permission insert rights cannot create permissions'
);

-- Test 5: Super Admin can create valid system permissions
SELECT cms_tests.authenticate_as('super_admin');

SELECT lives_ok(
    $$ INSERT INTO cms.permissions (id, name, permission_type, system_resource, action) 
       VALUES (cms_tests.test_uuid(310), 'account_select', 'system', 'account', 'select') $$,
    'Super Admin can create system permissions'
);

SELECT row_eq(
    $$ SELECT name, permission_type, system_resource, action 
       FROM cms.permissions WHERE id = cms_tests.test_uuid(310) $$,
    ROW('account_select'::varchar, 'system'::cms.permission_type, 'account'::cms.system_resource, 'select'::cms.system_action),
    'System permission was created correctly'
);

-- Test 6: Super Admin can create valid data permissions (table scope)
SELECT lives_ok(
    $$ INSERT INTO cms.permissions (id, name, permission_type, scope, schema_name, table_name, action) 
       VALUES (cms_tests.test_uuid(311), 'users_table_select', 'data', 'table', 'public', 'users', 'select') $$,
    'Super Admin can create data permissions for table scope'
);

SELECT row_eq(
    $$ SELECT name, permission_type, scope, schema_name, table_name, action 
       FROM cms.permissions WHERE id = cms_tests.test_uuid(311) $$,
    ROW('users_table_select'::varchar, 'data'::cms.permission_type, 'table'::cms.permission_scope, 
        'public'::varchar, 'users'::varchar, 'select'::cms.system_action),
    'Data permission (table scope) was created correctly'
);

-- Test 7: Super Admin can create valid data permissions (column scope)
SELECT lives_ok(
    $$ INSERT INTO cms.permissions (id, name, permission_type, scope, schema_name, table_name, column_name, action) 
       VALUES (cms_tests.test_uuid(312), 'users_email_select', 'data', 'column', 'public', 'users', 'email', 'select') $$,
    'Super Admin can create data permissions for column scope'
);

SELECT row_eq(
    $$ SELECT name, permission_type, scope, schema_name, table_name, column_name, action 
       FROM cms.permissions WHERE id = cms_tests.test_uuid(312) $$,
    ROW('users_email_select'::varchar, 'data'::cms.permission_type, 'column'::cms.permission_scope, 
        'public'::varchar, 'users'::varchar, 'email'::varchar, 'select'::cms.system_action),
    'Data permission (column scope) was created correctly'
);

-- Test 8: Cannot create system permission with data fields populated
SELECT throws_ok(
    $$ INSERT INTO cms.permissions (id, name, permission_type, system_resource, action, scope, schema_name) 
       VALUES (cms_tests.test_uuid(313), 'invalid_system', 'system'::cms.permission_type, 'account', 'select', 'table', 'public') $$,
    'new row for relation "permissions" violates check constraint "valid_permission_type"',
    'Cannot create system permission with data fields populated'
);

-- Test 9: Cannot create data permission without required fields for table scope
SELECT throws_ok(
    $$ INSERT INTO cms.permissions (id, name, permission_type, scope, action) 
       VALUES (cms_tests.test_uuid(314), 'invalid_data_table', 'data'::cms.permission_type, 'table', 'select') $$,
    'new row for relation "permissions" violates check constraint "valid_permission_type"',
    'Cannot create data permission without schema_name and table_name for table scope'
);

-- Test 10: Cannot create data permission without required fields for column scope  
SELECT throws_ok(
    $$ INSERT INTO cms.permissions (id, name, permission_type, scope, schema_name, table_name, action) 
       VALUES (cms_tests.test_uuid(315), 'invalid_data_column', 'data'::cms.permission_type, 'column', 'public', 'users', 'select') $$,
    'new row for relation "permissions" violates check constraint "valid_permission_type"',
    'Cannot create data permission without column_name for column scope'
);

-- Test 11: Cannot create permission with invalid action
SELECT throws_ok(
    $$ INSERT INTO cms.permissions (id, name, permission_type, system_resource, action) 
       VALUES (cms_tests.test_uuid(316), 'invalid_action', 'system'::cms.permission_type, 'account', 'invalid_action') $$,
    'invalid input value for enum cms.system_action: "invalid_action"',
    'Cannot create permission with invalid action'
);

-- Test 12: Cannot create permission with invalid schema name format
SELECT throws_ok(
    $$ INSERT INTO cms.permissions (id, name, permission_type, scope, schema_name, table_name, action) 
       VALUES (cms_tests.test_uuid(317), 'invalid_schema', 'data', 'table', 'invalid-schema!', 'users', 'select') $$,
    'new row for relation "permissions" violates check constraint "permissions_schema_name_check"',
    'Cannot create permission with invalid schema name format'
);

-- Test 13: Cannot create permission with invalid column name format
SELECT throws_ok(
    $$ INSERT INTO cms.permissions (id, name, permission_type, scope, schema_name, table_name, column_name, action) 
       VALUES (cms_tests.test_uuid(318), 'invalid_column', 'data', 'column', 'public', 'users', 'invalid-column!', 'select') $$,
    'new row for relation "permissions" violates check constraint "permissions_column_name_check"',
    'Cannot create permission with invalid column name format'
);

-- Test 14: Cannot create permission with duplicate name
SELECT throws_ok(
    $$ INSERT INTO cms.permissions (id, name, permission_type, system_resource, action) 
       VALUES (cms_tests.test_uuid(319), 'account_select', 'system', 'account', 'update') $$,
    'duplicate key value violates unique constraint "permissions_name_unique"',
    'Cannot create permission with duplicate name'
);

-- Test 15: Manager can update permissions they have rights to modify
SELECT cms_tests.authenticate_as('manager');

UPDATE cms.permissions 
SET description = 'Updated by manager' 
WHERE id = cms_tests.test_uuid(310);

SELECT row_eq(
    $$ SELECT description FROM cms.permissions WHERE id = cms_tests.test_uuid(310) $$,
    ROW('Updated by manager'::varchar),
    'Manager can update permissions'
);

-- Test 16: Manager cannot create new permissions (no insert permission)
SELECT throws_ok(
    $$ INSERT INTO cms.permissions (id, name, permission_type, system_resource, action) 
       VALUES (cms_tests.test_uuid(320), 'manager_test', 'system', 'account', 'update') $$,
    'new row violates row-level security policy for table "permissions"',
    'Manager cannot create permissions without insert rights'
);

-- Test 17: Super Admin can update permission fields, including reshaping into a
-- capability it holds. The Super Admin holds public.users data update (perm 305), so
-- reshaping perm 311 (public.users) to action 'update' is permitted (bug-hunt 10x01).
SELECT cms_tests.authenticate_as('super_admin');

UPDATE cms.permissions
SET description = 'Updated description',
    action = 'update'
WHERE id = cms_tests.test_uuid(311);

SELECT row_eq(
    $$ SELECT description, action FROM cms.permissions WHERE id = cms_tests.test_uuid(311) $$,
    ROW('Updated description'::varchar, 'update'::cms.system_action),
    'Super Admin can update permission fields'
);

-- Test 18: Cannot update permission to invalid structure
UPDATE cms.permissions 
       SET system_resource = 'account'
       WHERE id = cms_tests.test_uuid(311);

SELECT row_eq(
    $$ SELECT system_resource FROM cms.permissions WHERE id = cms_tests.test_uuid(311) $$,
    ROW('account'::cms.system_resource),
    'Cannot update data permission to have system_resource field'
);

-- Test 18b (bug-hunt 10x01): in-place reshape re-delegation guard.
-- The Manager holds permission:update (so can_modify_permission's rank gate passes) but
-- does NOT hold the account capability. Reshaping a permission into a capability the actor
-- does not hold must be blocked, even though a bare rank check would allow it -- otherwise
-- a low-rank admin could create a narrow permission, attach it to a sub-rank role, then
-- broaden it in place past can_grant_permission. Metadata-only edits stay allowed (Test 15).
SELECT cms_tests.authenticate_as('manager');

SELECT throws_ok(
    $$ UPDATE cms.permissions SET action = 'delete' WHERE id = cms_tests.test_uuid(310) $$,
    '42501',
    'insufficient_privilege: cannot reshape a permission into a capability you do not hold',
    'Manager cannot reshape a permission into a capability it does not hold (bug-hunt 10x01)'
);

SELECT cms_tests.authenticate_as('super_admin');

-- Test 19: Super Admin can delete permissions
DELETE FROM cms.permissions WHERE id = cms_tests.test_uuid(312);

SELECT is_empty(
    $$ SELECT * FROM cms.permissions WHERE id = cms_tests.test_uuid(312) $$,
    'Super Admin can delete permissions'
);

-- Test 20: Manager cannot delete permissions (no delete permission)
SELECT cms_tests.authenticate_as('manager');

DELETE FROM cms.permissions WHERE id = cms_tests.test_uuid(311);

SELECT isnt_empty(
    $$ SELECT * FROM cms.permissions WHERE id = cms_tests.test_uuid(311) $$,
    'Manager cannot delete permissions (permission still exists)'
);

-- Test 21: Can delete permission after removing from roles
SELECT cms_tests.authenticate_as('super_admin');

DELETE FROM cms.role_permissions WHERE permission_id = cms_tests.test_uuid(310);

DELETE FROM cms.permissions WHERE id = cms_tests.test_uuid(310);

SELECT is_empty(
    $$ SELECT * FROM cms.permissions WHERE id = cms_tests.test_uuid(310) $$,
    'Can delete permission after removing from role assignments'
);

-- Test 22: Wildcard action '*' is valid
SELECT lives_ok(
    $$ INSERT INTO cms.permissions (id, name, permission_type, system_resource, action) 
       VALUES (cms_tests.test_uuid(321), 'account_all', 'system', 'account', '*') $$,
    'Wildcard action is valid for permissions'
);

SELECT row_eq(
    $$ SELECT action FROM cms.permissions WHERE id = cms_tests.test_uuid(321) $$,
    ROW('*'::cms.system_action),
    'Wildcard action was stored correctly'
);

select is(
    (select cms.can_action_role(cms_tests.test_uuid(201), 'insert'::cms.system_action)),
    false,
    'Super Admin cannot insert permissions for its own role'
);

-- Test 23: Permission deletion cascades properly to role_permissions
set role postgres;

INSERT INTO cms.role_permissions (role_id, permission_id) VALUES (cms_tests.test_uuid(201), cms_tests.test_uuid(321));

DELETE FROM cms.permissions WHERE id = cms_tests.test_uuid(321);

SELECT is_empty(
    $$ SELECT * FROM cms.role_permissions WHERE permission_id = cms_tests.test_uuid(321) $$,
    'Permission deletion cascades to remove role assignments'
);

-- Test 24: Complex permission validation - data permission with wildcard table
SELECT lives_ok(
    $$ INSERT INTO cms.permissions (id, name, permission_type, scope, schema_name, table_name, action) 
       VALUES (cms_tests.test_uuid(322), 'public all tables', 'data', 'table', 'public', '*', 'select'::cms.system_action) $$,
    'Can create data permission with wildcard table name'
);

-- Test 25: Complex permission validation - data permission with wildcard schema
SELECT lives_ok(
    $$ INSERT INTO cms.permissions (id, name, permission_type, scope, schema_name, table_name, action) 
       VALUES (cms_tests.test_uuid(323), 'all schemas users', 'data', 'table', '*', '*', 'select'::cms.system_action) $$,
    'Can create data permission with wildcard schema name'
);

-- Test 26: JSON metadata field works correctly
SELECT lives_ok(
    $$ INSERT INTO cms.permissions (id, name, permission_type, system_resource, action, metadata) 
       VALUES (cms_tests.test_uuid(324), 'test_metadata', 'system', 'account', 'select', '{"category": "user_management", "risk_level": "low"}'::jsonb) $$,
    'Can create permission with JSON metadata'
);

SELECT row_eq(
    $$ SELECT metadata FROM cms.permissions WHERE id = cms_tests.test_uuid(324) $$,
    ROW('{"category": "user_management", "risk_level": "low"}'::jsonb),
    'JSON metadata was stored correctly'
);

-- Test 27: Conditions field accepts valid JSON
SELECT lives_ok(
    $$ INSERT INTO cms.permissions (id, name, permission_type, scope, schema_name, table_name, action, conditions) 
       VALUES (cms_tests.test_uuid(325), 'conditional_permission', 'data', 'table', 'public', 'users', 'select', 
               '{"time_restriction": {"start": "09:00", "end": "17:00"}}'::jsonb) $$,
    'Can create permission with JSON conditions'
);

-- Test 28: Constraints field accepts valid JSON  
SELECT lives_ok(
    $$ INSERT INTO cms.permissions (id, name, permission_type, scope, schema_name, table_name, action, constraints) 
       VALUES (cms_tests.test_uuid(326), 'constrained_permission', 'data', 'table', 'public', 'users', 'select',
               '{"row_limit": 100, "allowed_columns": ["id", "name", "email"]}'::jsonb) $$,
    'Can create permission with JSON constraints'
);

SELECT finish();

ROLLBACK;