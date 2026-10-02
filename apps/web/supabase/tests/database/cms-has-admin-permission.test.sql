-- Test file: has_admin_permission.test.sql
-- Tests cms.has_admin_permission function through actual operations
-- This tests system permission management through RLS policies and business rules

BEGIN;

-- PymeKit exige MFA en el CMS por defecto (ADR-014); esa regla se prueba en
-- cms-super-admin-root.test.sql. Aquí se valida la lógica funcional con
-- sesiones sin segundo factor, así que se desactiva el requisito de forma
-- explícita. El ROLLBACK final deshace el cambio.
update cms.configuration set value = 'false' where key = 'requires_mfa';

SELECT no_plan();

-- Clean up any existing test data
DELETE FROM cms.permission_group_permissions;
DELETE FROM cms.role_permission_groups;
DELETE FROM cms.permission_groups;
DELETE FROM cms.account_permissions;
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
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(2), 'role_manager', 'rolemanager@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(3), 'table_admin', 'tableadmin@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(4), 'read_only_user', 'readonly@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(5), 'no_permission_user', 'noperm@test.com');

-- Create accounts
INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(1), true),  -- Super Admin account
    (cms_tests.test_uuid(102), cms_tests.test_uuid(2), true),  -- Role Manager account  
    (cms_tests.test_uuid(103), cms_tests.test_uuid(3), true),  -- Table Admin account
    (cms_tests.test_uuid(104), cms_tests.test_uuid(4), true),  -- Read Only User account
    (cms_tests.test_uuid(105), cms_tests.test_uuid(5), true);  -- No Permission User account

-- Create roles with different priorities
INSERT INTO cms.roles (id, name, rank, description) VALUES
    (cms_tests.test_uuid(201), 'Super Admin', 100, 'Full system administration'),
    (cms_tests.test_uuid(202), 'Role Manager', 60, 'Role and permission management'),
    (cms_tests.test_uuid(203), 'Table Admin', 40, 'Table management only'),
    (cms_tests.test_uuid(204), 'Read Only', 20, 'Read-only access'),
    (cms_tests.test_uuid(205), 'No Permissions', 10, 'No system permissions');

-- Create system permissions for testing all system resources and actions
INSERT INTO cms.permissions (id, name, permission_type, system_resource, action) VALUES
    -- Account management permissions
    (cms_tests.test_uuid(301), 'account_select', 'system', 'account', 'select'),
    (cms_tests.test_uuid(302), 'account_insert', 'system', 'account', 'insert'),
    (cms_tests.test_uuid(303), 'account_update', 'system', 'account', 'update'),
    (cms_tests.test_uuid(304), 'account_delete', 'system', 'account', 'delete'),
    (cms_tests.test_uuid(305), 'account_all', 'system', 'account', '*'),
    
    -- Role management permissions
    (cms_tests.test_uuid(311), 'role_select', 'system', 'role', 'select'),
    (cms_tests.test_uuid(312), 'role_insert', 'system', 'role', 'insert'),
    (cms_tests.test_uuid(313), 'role_update', 'system', 'role', 'update'),
    (cms_tests.test_uuid(314), 'role_delete', 'system', 'role', 'delete'),
    (cms_tests.test_uuid(315), 'role_all', 'system', 'role', '*'),
    
    -- Permission management permissions
    (cms_tests.test_uuid(321), 'permission_select', 'system', 'permission', 'select'),
    (cms_tests.test_uuid(322), 'permission_insert', 'system', 'permission', 'insert'),
    (cms_tests.test_uuid(323), 'permission_update', 'system', 'permission', 'update'),
    (cms_tests.test_uuid(324), 'permission_delete', 'system', 'permission', 'delete'),
    
    -- Log management permissions
    (cms_tests.test_uuid(331), 'log_select', 'system', 'log', 'select'),
    (cms_tests.test_uuid(332), 'log_delete', 'system', 'log', 'delete'),
    
    -- Table management permissions
    (cms_tests.test_uuid(341), 'table_select', 'system', 'table', 'select'),
    (cms_tests.test_uuid(342), 'table_update', 'system', 'table', 'update'),
    
    -- Auth user management permissions
    (cms_tests.test_uuid(351), 'auth_user_select', 'system', 'auth_user', 'select'),
    (cms_tests.test_uuid(352), 'auth_user_update', 'system', 'auth_user', 'update'),
    (cms_tests.test_uuid(353), 'auth_user_delete', 'system', 'auth_user', 'delete'),
    
    -- System setting management permissions
    (cms_tests.test_uuid(361), 'system_setting_select', 'system', 'system_setting', 'select'),
    (cms_tests.test_uuid(362), 'system_setting_update', 'system', 'system_setting', 'update'),
    (cms_tests.test_uuid(363), 'system_setting_insert', 'system', 'system_setting', 'insert'),
    (cms_tests.test_uuid(364), 'system_setting_delete', 'system', 'system_setting', 'delete');

-- Assign roles to accounts
INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(201)),  -- Super Admin
    (cms_tests.test_uuid(102), cms_tests.test_uuid(202)),  -- Role Manager
    (cms_tests.test_uuid(103), cms_tests.test_uuid(203)),  -- Table Admin
    (cms_tests.test_uuid(104), cms_tests.test_uuid(204)),  -- Read Only
    (cms_tests.test_uuid(105), cms_tests.test_uuid(205));  -- No Permissions

-- Grant permissions to roles
INSERT INTO cms.role_permissions (role_id, permission_id) VALUES
    -- Super Admin gets all account permissions via wildcard
    (cms_tests.test_uuid(201), cms_tests.test_uuid(305)),  -- account *
    (cms_tests.test_uuid(201), cms_tests.test_uuid(315)),  -- role *
    (cms_tests.test_uuid(201), cms_tests.test_uuid(321)),  -- permission select
    (cms_tests.test_uuid(201), cms_tests.test_uuid(322)),  -- permission insert
    (cms_tests.test_uuid(201), cms_tests.test_uuid(323)),  -- permission update
    (cms_tests.test_uuid(201), cms_tests.test_uuid(324)),  -- permission delete
    (cms_tests.test_uuid(201), cms_tests.test_uuid(331)),  -- log select
    (cms_tests.test_uuid(201), cms_tests.test_uuid(332)),  -- log delete
    (cms_tests.test_uuid(201), cms_tests.test_uuid(341)),  -- table select
    (cms_tests.test_uuid(201), cms_tests.test_uuid(342)),  -- table update
    (cms_tests.test_uuid(201), cms_tests.test_uuid(351)),  -- auth_user select
    (cms_tests.test_uuid(201), cms_tests.test_uuid(352)),  -- auth_user update
    (cms_tests.test_uuid(201), cms_tests.test_uuid(353)),  -- auth_user delete
    (cms_tests.test_uuid(201), cms_tests.test_uuid(361)),  -- system_setting select
    (cms_tests.test_uuid(201), cms_tests.test_uuid(362)),  -- system_setting update
    (cms_tests.test_uuid(201), cms_tests.test_uuid(363)),  -- system_setting insert
    (cms_tests.test_uuid(201), cms_tests.test_uuid(364)),  -- system_setting delete
    
    -- Role Manager gets role and permission management
    (cms_tests.test_uuid(202), cms_tests.test_uuid(311)),  -- role select
    (cms_tests.test_uuid(202), cms_tests.test_uuid(312)),  -- role insert
    (cms_tests.test_uuid(202), cms_tests.test_uuid(313)),  -- role update
    (cms_tests.test_uuid(202), cms_tests.test_uuid(314)),  -- role delete
    (cms_tests.test_uuid(202), cms_tests.test_uuid(321)),  -- permission select
    (cms_tests.test_uuid(202), cms_tests.test_uuid(322)),  -- permission insert
    (cms_tests.test_uuid(202), cms_tests.test_uuid(323)),  -- permission update
    
    -- Table Admin gets table management only
    (cms_tests.test_uuid(203), cms_tests.test_uuid(341)),  -- table select
    (cms_tests.test_uuid(203), cms_tests.test_uuid(342)),  -- table update
    
    -- Read Only gets select permissions only
    (cms_tests.test_uuid(204), cms_tests.test_uuid(301)),  -- account select
    (cms_tests.test_uuid(204), cms_tests.test_uuid(311)),  -- role select
    (cms_tests.test_uuid(204), cms_tests.test_uuid(321)),  -- permission select
    (cms_tests.test_uuid(204), cms_tests.test_uuid(331)),  -- log select
    (cms_tests.test_uuid(204), cms_tests.test_uuid(341)),  -- table select
    (cms_tests.test_uuid(204), cms_tests.test_uuid(351)),  -- auth_user select
    (cms_tests.test_uuid(204), cms_tests.test_uuid(361));  -- system_setting select

-- Test 1: User without admin access cannot use has_admin_permission
SELECT cms_tests.authenticate_as('no_permission_user');
SELECT cms_tests.set_admin_access('noperm@test.com', 'false');

SELECT is(
    (SELECT cms.has_admin_permission('account'::cms.system_resource, 'select'::cms.system_action)),
    false,
    'User without admin access cannot use has_admin_permission'
);

-- Restore admin access for remaining tests
SELECT cms_tests.set_admin_access('noperm@test.com', 'true');

-- Test 2: Super Admin can perform all account operations via wildcard permission
SELECT cms_tests.authenticate_as('super_admin');

SELECT is(
    (SELECT cms.has_admin_permission('account'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'Super Admin can select accounts (wildcard permission)'
);

SELECT is(
    (SELECT cms.has_admin_permission('account'::cms.system_resource, 'insert'::cms.system_action)),
    true,
    'Super Admin can insert accounts (wildcard permission)'
);

SELECT is(
    (SELECT cms.has_admin_permission('account'::cms.system_resource, 'update'::cms.system_action)),
    true,
    'Super Admin can update accounts (wildcard permission)'
);

SELECT is(
    (SELECT cms.has_admin_permission('account'::cms.system_resource, 'delete'::cms.system_action)),
    true,
    'Super Admin can delete accounts (wildcard permission)'
);

-- Test 3: Super Admin can perform all role operations via wildcard permission
SELECT is(
    (SELECT cms.has_admin_permission('role'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'Super Admin can select roles (wildcard permission)'
);

SELECT is(
    (SELECT cms.has_admin_permission('role'::cms.system_resource, 'insert'::cms.system_action)),
    true,
    'Super Admin can insert roles (wildcard permission)'
);

SELECT is(
    (SELECT cms.has_admin_permission('role'::cms.system_resource, 'update'::cms.system_action)),
    true,
    'Super Admin can update roles (wildcard permission)'
);

SELECT is(
    (SELECT cms.has_admin_permission('role'::cms.system_resource, 'delete'::cms.system_action)),
    true,
    'Super Admin can delete roles (wildcard permission)'
);

-- Test 4: Super Admin has specific permission permissions (not wildcard)
SELECT is(
    (SELECT cms.has_admin_permission('permission'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'Super Admin can select permissions'
);

SELECT is(
    (SELECT cms.has_admin_permission('permission'::cms.system_resource, 'insert'::cms.system_action)),
    true,
    'Super Admin can insert permissions'
);

SELECT is(
    (SELECT cms.has_admin_permission('permission'::cms.system_resource, 'update'::cms.system_action)),
    true,
    'Super Admin can update permissions'
);

SELECT is(
    (SELECT cms.has_admin_permission('permission'::cms.system_resource, 'delete'::cms.system_action)),
    true,
    'Super Admin can delete permissions'
);

-- Test 5: Super Admin has other system resource permissions
SELECT is(
    (SELECT cms.has_admin_permission('log'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'Super Admin can select logs'
);

SELECT is(
    (SELECT cms.has_admin_permission('log'::cms.system_resource, 'delete'::cms.system_action)),
    true,
    'Super Admin can delete logs'
);

SELECT is(
    (SELECT cms.has_admin_permission('table'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'Super Admin can select table metadata'
);

SELECT is(
    (SELECT cms.has_admin_permission('table'::cms.system_resource, 'update'::cms.system_action)),
    true,
    'Super Admin can update table metadata'
);

SELECT is(
    (SELECT cms.has_admin_permission('auth_user'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'Super Admin can select auth users'
);

SELECT is(
    (SELECT cms.has_admin_permission('auth_user'::cms.system_resource, 'update'::cms.system_action)),
    true,
    'Super Admin can update auth users'
);

SELECT is(
    (SELECT cms.has_admin_permission('auth_user'::cms.system_resource, 'delete'::cms.system_action)),
    true,
    'Super Admin can delete auth users'
);

SELECT is(
    (SELECT cms.has_admin_permission('system_setting'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'Super Admin can select system settings'
);

SELECT is(
    (SELECT cms.has_admin_permission('system_setting'::cms.system_resource, 'update'::cms.system_action)),
    true,
    'Super Admin can update system settings'
);

SELECT is(
    (SELECT cms.has_admin_permission('system_setting'::cms.system_resource, 'insert'::cms.system_action)),
    true,
    'Super Admin can insert system settings'
);

SELECT is(
    (SELECT cms.has_admin_permission('system_setting'::cms.system_resource, 'delete'::cms.system_action)),
    true,
    'Super Admin can delete system settings'
);

-- Test 6: Role Manager has specific role and permission management permissions
SELECT cms_tests.authenticate_as('role_manager');

SELECT is(
    (SELECT cms.has_admin_permission('role'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'Role Manager can select roles'
);

SELECT is(
    (SELECT cms.has_admin_permission('role'::cms.system_resource, 'insert'::cms.system_action)),
    true,
    'Role Manager can insert roles'
);

SELECT is(
    (SELECT cms.has_admin_permission('role'::cms.system_resource, 'update'::cms.system_action)),
    true,
    'Role Manager can update roles'
);

SELECT is(
    (SELECT cms.has_admin_permission('role'::cms.system_resource, 'delete'::cms.system_action)),
    true,
    'Role Manager can delete roles'
);

SELECT is(
    (SELECT cms.has_admin_permission('permission'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'Role Manager can select permissions'
);

SELECT is(
    (SELECT cms.has_admin_permission('permission'::cms.system_resource, 'insert'::cms.system_action)),
    true,
    'Role Manager can insert permissions'
);

SELECT is(
    (SELECT cms.has_admin_permission('permission'::cms.system_resource, 'update'::cms.system_action)),
    true,
    'Role Manager can update permissions'
);

-- Test 7: Role Manager cannot perform operations they don't have permission for
SELECT is(
    (SELECT cms.has_admin_permission('permission'::cms.system_resource, 'delete'::cms.system_action)),
    false,
    'Role Manager cannot delete permissions (no permission)'
);

SELECT is(
    (SELECT cms.has_admin_permission('account'::cms.system_resource, 'select'::cms.system_action)),
    false,
    'Role Manager cannot select accounts (no permission)'
);

SELECT is(
    (SELECT cms.has_admin_permission('log'::cms.system_resource, 'select'::cms.system_action)),
    false,
    'Role Manager cannot select logs (no permission)'
);

SELECT is(
    (SELECT cms.has_admin_permission('table'::cms.system_resource, 'update'::cms.system_action)),
    false,
    'Role Manager cannot update table metadata (no permission)'
);

SELECT is(
    (SELECT cms.has_admin_permission('auth_user'::cms.system_resource, 'update'::cms.system_action)),
    false,
    'Role Manager cannot update auth users (no permission)'
);

SELECT is(
    (SELECT cms.has_admin_permission('system_setting'::cms.system_resource, 'update'::cms.system_action)),
    false,
    'Role Manager cannot update system settings (no permission)'
);

-- Test 8: Table Admin has limited permissions (table management only)
SELECT cms_tests.authenticate_as('table_admin');

SELECT is(
    (SELECT cms.has_admin_permission('table'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'Table Admin can select table metadata'
);

SELECT is(
    (SELECT cms.has_admin_permission('table'::cms.system_resource, 'update'::cms.system_action)),
    true,
    'Table Admin can update table metadata'
);

-- Table Admin cannot access other resources
SELECT is(
    (SELECT cms.has_admin_permission('role'::cms.system_resource, 'select'::cms.system_action)),
    false,
    'Table Admin cannot select roles (no permission)'
);

SELECT is(
    (SELECT cms.has_admin_permission('permission'::cms.system_resource, 'select'::cms.system_action)),
    false,
    'Table Admin cannot select permissions (no permission)'
);

SELECT is(
    (SELECT cms.has_admin_permission('account'::cms.system_resource, 'select'::cms.system_action)),
    false,
    'Table Admin cannot select accounts (no permission)'
);

SELECT is(
    (SELECT cms.has_admin_permission('log'::cms.system_resource, 'select'::cms.system_action)),
    false,
    'Table Admin cannot select logs (no permission)'
);

-- Test 9: Read Only User has select permissions for most resources
SELECT cms_tests.authenticate_as('read_only_user');

SELECT is(
    (SELECT cms.has_admin_permission('account'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'Read Only User can select accounts'
);

SELECT is(
    (SELECT cms.has_admin_permission('role'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'Read Only User can select roles'
);

SELECT is(
    (SELECT cms.has_admin_permission('permission'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'Read Only User can select permissions'
);

SELECT is(
    (SELECT cms.has_admin_permission('log'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'Read Only User can select logs'
);

SELECT is(
    (SELECT cms.has_admin_permission('table'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'Read Only User can select table metadata'
);

SELECT is(
    (SELECT cms.has_admin_permission('auth_user'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'Read Only User can select auth users'
);

SELECT is(
    (SELECT cms.has_admin_permission('system_setting'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'Read Only User can select system settings'
);

-- Test 10: Read Only User cannot perform write operations
SELECT is(
    (SELECT cms.has_admin_permission('account'::cms.system_resource, 'update'::cms.system_action)),
    false,
    'Read Only User cannot update accounts'
);

SELECT is(
    (SELECT cms.has_admin_permission('role'::cms.system_resource, 'insert'::cms.system_action)),
    false,
    'Read Only User cannot insert roles'
);

SELECT is(
    (SELECT cms.has_admin_permission('permission'::cms.system_resource, 'delete'::cms.system_action)),
    false,
    'Read Only User cannot delete permissions'
);

SELECT is(
    (SELECT cms.has_admin_permission('table'::cms.system_resource, 'update'::cms.system_action)),
    false,
    'Read Only User cannot update table metadata'
);

SELECT is(
    (SELECT cms.has_admin_permission('auth_user'::cms.system_resource, 'delete'::cms.system_action)),
    false,
    'Read Only User cannot delete auth users'
);

SELECT is(
    (SELECT cms.has_admin_permission('system_setting'::cms.system_resource, 'update'::cms.system_action)),
    false,
    'Read Only User cannot update system settings'
);

-- Test 11: User with no permissions cannot access anything
SELECT cms_tests.authenticate_as('no_permission_user');

SELECT is(
    (SELECT cms.has_admin_permission('account'::cms.system_resource, 'select'::cms.system_action)),
    false,
    'No Permission User cannot select accounts'
);

SELECT is(
    (SELECT cms.has_admin_permission('role'::cms.system_resource, 'select'::cms.system_action)),
    false,
    'No Permission User cannot select roles'
);

SELECT is(
    (SELECT cms.has_admin_permission('permission'::cms.system_resource, 'select'::cms.system_action)),
    false,
    'No Permission User cannot select permissions'
);

SELECT is(
    (SELECT cms.has_admin_permission('log'::cms.system_resource, 'select'::cms.system_action)),
    false,
    'No Permission User cannot select logs'
);

SELECT is(
    (SELECT cms.has_admin_permission('table'::cms.system_resource, 'select'::cms.system_action)),
    false,
    'No Permission User cannot select table metadata'
);

SELECT is(
    (SELECT cms.has_admin_permission('auth_user'::cms.system_resource, 'select'::cms.system_action)),
    false,
    'No Permission User cannot select auth users'
);

SELECT is(
    (SELECT cms.has_admin_permission('system_setting'::cms.system_resource, 'select'::cms.system_action)),
    false,
    'No Permission User cannot select system settings'
);

-- Test 12: Direct account permissions (not via role)
-- Give direct permission to No Permission User
SET ROLE postgres;

INSERT INTO cms.account_permissions (account_id, permission_id, is_grant) VALUES
    (cms_tests.test_uuid(105), cms_tests.test_uuid(341), true);  -- table select

SELECT cms_tests.authenticate_as('no_permission_user');

SELECT is(
    (SELECT cms.has_admin_permission('table'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'User with direct account permission can access resource'
);

-- But still cannot access other resources
SELECT is(
    (SELECT cms.has_admin_permission('account'::cms.system_resource, 'select'::cms.system_action)),
    false,
    'User with direct permission cannot access other resources'
);

-- Test 13: Permission groups work correctly
SET ROLE postgres;

-- Create a permission group
INSERT INTO cms.permission_groups (id, name, description) VALUES
    (cms_tests.test_uuid(401), 'System Readers', 'Read access to system resources');

-- Add permissions to the group
INSERT INTO cms.permission_group_permissions (group_id, permission_id) VALUES
    (cms_tests.test_uuid(401), cms_tests.test_uuid(301)),  -- account select
    (cms_tests.test_uuid(401), cms_tests.test_uuid(311)),  -- role select
    (cms_tests.test_uuid(401), cms_tests.test_uuid(321));  -- permission select

-- Assign the group to a role
INSERT INTO cms.role_permission_groups (role_id, group_id) VALUES
    (cms_tests.test_uuid(205), cms_tests.test_uuid(401));

SELECT cms_tests.authenticate_as('no_permission_user');

SELECT is(
    (SELECT cms.has_admin_permission('account'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'User can access permissions via permission groups'
);

SELECT is(
    (SELECT cms.has_admin_permission('role'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'User can access role permissions via permission groups'
);

SELECT is(
    (SELECT cms.has_admin_permission('permission'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'User can access permission permissions via permission groups'
);

-- But still cannot access permissions not in the group
SELECT is(
    (SELECT cms.has_admin_permission('log'::cms.system_resource, 'select'::cms.system_action)),
    false,
    'User cannot access permissions not in group'
);

-- Test 14: Explicit denial takes precedence over grants
SET ROLE postgres;

-- Add explicit denial for account select
INSERT INTO cms.account_permissions (account_id, permission_id, is_grant) VALUES
    (cms_tests.test_uuid(105), cms_tests.test_uuid(301), false);  -- account select - DENY

SELECT cms_tests.authenticate_as('no_permission_user');

SELECT is(
    (SELECT cms.has_admin_permission('account'::cms.system_resource, 'select'::cms.system_action)),
    false,
    'Explicit denial takes precedence over group permission grants'
);

-- But other group permissions still work
SELECT is(
    (SELECT cms.has_admin_permission('role'::cms.system_resource, 'select'::cms.system_action)),
    true,
    'Other group permissions still work when one is explicitly denied'
);

-- Test 
-- remove constraint to allow invalid role assignment
SET ROLE postgres;

ALTER TABLE cms.account_roles DROP CONSTRAINT valid_time_range;

UPDATE cms.account_roles 
SET valid_until = now() - interval '1 second'
WHERE account_id = cms_tests.test_uuid(102);

-- Test 15: Role assignment expires
SELECT cms_tests.authenticate_as('role_manager');

SELECT is(
    (SELECT cms.has_admin_permission('permission'::cms.system_resource, 'select'::cms.system_action)),
    false,
    'Role Manager loses permissions when role assignment expires'
);

-- Restore role assignment
SET ROLE postgres;

UPDATE cms.account_roles 
SET valid_until = NULL
WHERE account_id = cms_tests.test_uuid(102);

-- Test 16: Permission expires
-- remove constraint to allow invalid permission assignment
SET ROLE postgres;

ALTER TABLE cms.role_permissions DROP CONSTRAINT valid_time_range;

UPDATE cms.role_permissions 
SET valid_until = now() - interval '1 second'
WHERE role_id = cms_tests.test_uuid(202) AND permission_id = cms_tests.test_uuid(321);

SELECT cms_tests.authenticate_as('role_manager');

SELECT is(
    (SELECT cms.has_admin_permission('permission'::cms.system_resource, 'select'::cms.system_action)),
    false,
    'Role Manager loses permissions when permission expires'
);

SELECT finish();

ROLLBACK;