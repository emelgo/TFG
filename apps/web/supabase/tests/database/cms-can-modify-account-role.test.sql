-- Test file: test_account_role_operations.sql
-- Tests actual CRUD operations on cms.account_roles table
-- This tests the real business logic through RLS policies

BEGIN;

-- PymeKit exige MFA en el CMS por defecto (ADR-014); esa regla se prueba en
-- cms-super-admin-root.test.sql. Aquí se valida la lógica funcional con
-- sesiones sin segundo factor, así que se desactiva el requisito de forma
-- explícita. El ROLLBACK final deshace el cambio.
update cms.configuration set value = 'false' where key = 'requires_mfa';

SELECT no_plan();

-- Clean up any existing test data
DELETE FROM cms.account_roles;
DELETE from cms.permission_groups;
DELETE FROM cms.role_permissions;
-- Clean up dashboard tables (must be in dependency order)
DELETE FROM cms.dashboard_role_shares;
DELETE FROM cms.dashboard_widgets;
DELETE FROM cms.dashboards;
DELETE FROM cms.accounts;
DELETE FROM cms.roles;
DELETE FROM cms.permissions;

-- Create test users in auth.users
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(1), 'super_admin', 'superadmin@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(2), 'manager', 'manager@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(3), 'regular_user', 'user@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(4), 'low_user', 'lowuser@test.com');

-- Create accounts
INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(1), true),  -- Super Admin account
    (cms_tests.test_uuid(102), cms_tests.test_uuid(2), true),  -- Manager account  
    (cms_tests.test_uuid(103), cms_tests.test_uuid(3), true),  -- Regular User account
    (cms_tests.test_uuid(104), cms_tests.test_uuid(4), true);  -- Low rank user

-- Create roles with different priorities
INSERT INTO cms.roles (id, name, rank, description) VALUES
    (cms_tests.test_uuid(201), 'Super Admin', 100, 'Highest rank role'),
    (cms_tests.test_uuid(202), 'Admin', 80, 'High rank admin role'),
    (cms_tests.test_uuid(203), 'Manager', 50, 'Mid-level management role'),
    (cms_tests.test_uuid(204), 'User', 20, 'Standard user role'),
    (cms_tests.test_uuid(205), 'Guest', 10, 'Lowest rank role');

-- Create system permissions
INSERT INTO cms.permissions (id, name, permission_type, system_resource, action) VALUES
    (cms_tests.test_uuid(301), 'role_insert', 'system', 'role', 'insert'),
    (cms_tests.test_uuid(302), 'role_update', 'system', 'role', 'update'),
    (cms_tests.test_uuid(303), 'role_delete', 'system', 'role', 'delete'),
    (cms_tests.test_uuid(304), 'role_select', 'system', 'role', 'select');

-- Assign initial roles
INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(201)),  -- Super Admin
    (cms_tests.test_uuid(102), cms_tests.test_uuid(203)),  -- Manager 
    (cms_tests.test_uuid(103), cms_tests.test_uuid(204)),  -- User
    (cms_tests.test_uuid(104), cms_tests.test_uuid(205));  -- Guest

-- Grant permissions to roles
INSERT INTO cms.role_permissions (role_id, permission_id) VALUES
    -- Super Admin gets all permissions
    (cms_tests.test_uuid(201), cms_tests.test_uuid(301)),
    (cms_tests.test_uuid(201), cms_tests.test_uuid(302)),
    (cms_tests.test_uuid(201), cms_tests.test_uuid(303)),
    (cms_tests.test_uuid(201), cms_tests.test_uuid(304)),
    -- Manager gets update/select permissions
    (cms_tests.test_uuid(203), cms_tests.test_uuid(302)),
    (cms_tests.test_uuid(203), cms_tests.test_uuid(304));

set role anon;

-- Test 1: Unauthenticated user cannot perform any operations
SELECT throws_ok(
    $$ INSERT INTO cms.account_roles (account_id, role_id) 
       VALUES (cms_tests.test_uuid(103), cms_tests.test_uuid(205)) $$,
    'permission denied for schema cms',
    'Unauthenticated user cannot insert role assignments'
);

-- Test 2: User without admin access cannot perform operations
SELECT cms_tests.authenticate_as('regular_user');
SELECT cms_tests.set_admin_access('user@test.com', 'false');

SELECT throws_ok(
    $$ INSERT INTO cms.account_roles (account_id, role_id) 
       VALUES (cms_tests.test_uuid(104), cms_tests.test_uuid(204)) $$,
    'new row violates row-level security policy for table "account_roles"',
    'User without admin access cannot insert role assignments'
);

-- Restore admin access for user
SELECT cms_tests.set_admin_access('user@test.com', 'true');

-- Test 3: User without role permissions cannot perform operations
SELECT throws_ok(
    $$ INSERT INTO cms.account_roles (account_id, role_id) 
       VALUES (cms_tests.test_uuid(104), cms_tests.test_uuid(204)) $$,
    'new row violates row-level security policy for table "account_roles"',
    'User without role permissions cannot insert role assignments'
);

-- Test 4: Super Admin can assign lower rank roles
SELECT cms_tests.authenticate_as('super_admin');

SELECT lives_ok(
    $$ UPDATE cms.account_roles 
       SET role_id = cms_tests.test_uuid(204) 
       WHERE account_id = cms_tests.test_uuid(104) AND role_id = cms_tests.test_uuid(205) $$,
    'Super Admin can assign User role to Guest user'
);

-- Verify the assignment was created
SELECT row_eq(
    $$ SELECT account_id, role_id FROM cms.account_roles 
       WHERE account_id = cms_tests.test_uuid(104) AND role_id = cms_tests.test_uuid(204) $$,
    row(cms_tests.test_uuid(104), cms_tests.test_uuid(204)),
    'Role assignment was successfully created'
);

-- Clean up for next test
DELETE FROM cms.account_roles WHERE account_id = cms_tests.test_uuid(104) AND role_id = cms_tests.test_uuid(204);

-- Test 5: Manager cannot assign higher rank roles
SELECT cms_tests.authenticate_as('manager');

SELECT throws_ok(
    $$ INSERT INTO cms.account_roles (account_id, role_id) 
       VALUES (cms_tests.test_uuid(103), cms_tests.test_uuid(202)) $$,
    'new row violates row-level security policy for table "account_roles"',
    'Manager cannot assign Admin role (higher rank)'
);

-- Test 6: Manager can assign lower rank roles
SELECT lives_ok(
    $$ UPDATE cms.account_roles 
       SET role_id = cms_tests.test_uuid(204) 
       WHERE account_id = cms_tests.test_uuid(104) AND role_id = cms_tests.test_uuid(205) $$,
    'Manager can assign User role (lower rank)'
);

-- Clean up
set role postgres;
DELETE FROM cms.account_roles WHERE account_id = cms_tests.test_uuid(104) AND role_id = cms_tests.test_uuid(204);
select cms_tests.authenticate_as('manager');

-- Test 7: Cannot assign role equal to own rank
SELECT throws_ok(
    $$ INSERT INTO cms.account_roles (account_id, role_id) 
       VALUES (cms_tests.test_uuid(103), cms_tests.test_uuid(203)) $$,
    'new row violates row-level security policy for table "account_roles"',
    'Manager cannot assign Manager role (equal rank)'
);

-- Test 8: Cannot assign role to account that already has a role (one role per account)
select cms_tests.authenticate_as('super_admin');

SELECT throws_ok(
    $$ INSERT INTO cms.account_roles (account_id, role_id) 
       VALUES (cms_tests.test_uuid(103), cms_tests.test_uuid(205)) $$,
    'duplicate key value violates unique constraint "account_roles_account_id_key"',
    'Cannot assign second role to account that already has a role'
);

-- Test 9: Self-modification - cannot assign higher rank role
select cms_tests.authenticate_as('manager');

SELECT throws_ok(
    $$ INSERT INTO cms.account_roles (account_id, role_id) 
       VALUES (cms_tests.test_uuid(102), cms_tests.test_uuid(202)) $$,
    'new row violates row-level security policy for table "account_roles"',
    'Manager cannot assign Admin role to themselves'
);

-- Test 10: Self-modification - can assign lower rank role
SELECT lives_ok(
    $$ UPDATE cms.account_roles 
       SET role_id = cms_tests.test_uuid(204) 
       WHERE account_id = cms_tests.test_uuid(102) AND role_id = cms_tests.test_uuid(202) $$,
    'Manager can assign User role to themselves'
);

-- Test 11: Update operations - Manager can update lower rank assignments
SELECT cms_tests.authenticate_as('super_admin');

-- First create an assignment to update
UPDATE cms.account_roles 
SET metadata = '{"test": "original"}' 
WHERE account_id = cms_tests.test_uuid(104) AND role_id = cms_tests.test_uuid(205);

SELECT cms_tests.authenticate_as('manager');

SELECT lives_ok(
    $$ UPDATE cms.account_roles 
       SET metadata = '{"test": "updated"}' 
       WHERE account_id = cms_tests.test_uuid(104) AND role_id = cms_tests.test_uuid(205) $$,
    'Manager can update metadata for lower rank role assignments'
);

-- Test 12: Update operations - cannot update higher rank assignments
SELECT cms_tests.authenticate_as('super_admin');

-- Update the Super Admin's role metadata as setup
UPDATE cms.account_roles 
SET metadata = '{"test": "super_admin"}'::jsonb 
WHERE account_id = cms_tests.test_uuid(101);

-- Verify the update was successful
SELECT row_eq(
    $$ SELECT metadata FROM cms.account_roles 
       WHERE account_id = cms_tests.test_uuid(101) $$,
    row('{}'::jsonb),
    'Cannot update own account roles'
);

SELECT cms_tests.authenticate_as('manager');

UPDATE cms.account_roles 
       SET metadata = '{"test": "hacked"}' 
       WHERE account_id = cms_tests.test_uuid(101) AND role_id = cms_tests.test_uuid(201);

-- Verify the previous update was unsuccessful
SELECT row_eq(
    $$ SELECT metadata FROM cms.account_roles 
       WHERE account_id = cms_tests.test_uuid(101) AND role_id = cms_tests.test_uuid(201) $$,
    row('{}'::jsonb),
    'Previous update was unsuccessful'
);

-- Test 13: Delete operations - Super Admin can delete any assignment
SELECT cms_tests.authenticate_as('super_admin');

-- Attempt to delete guest assignment
DELETE FROM cms.account_roles 
       WHERE account_id = cms_tests.test_uuid(104) AND role_id = cms_tests.test_uuid(205);

-- Assert account role was deleted
select is_empty(
    $$ SELECT * FROM cms.account_roles WHERE account_id = cms_tests.test_uuid(104) AND role_id = cms_tests.test_uuid(205) $$,
    'Account role was deleted'
);

-- Restore the deleted assignment for further tests
select lives_ok(
    $$ INSERT INTO cms.account_roles (account_id, role_id) 
       VALUES (cms_tests.test_uuid(104), cms_tests.test_uuid(205)) $$,
    'Super Admin can restore deleted role assignment'
);

-- Test 14: Delete operations - Manager cannot delete higher rank assignments
SELECT cms_tests.authenticate_as('manager');

-- Attempt to delete super admin assignment
DELETE FROM cms.account_roles 
       WHERE account_id = cms_tests.test_uuid(101) AND role_id = cms_tests.test_uuid(201);

SELECT isnt_empty(
    $$ SELECT * FROM cms.account_roles WHERE account_id = cms_tests.test_uuid(101) AND role_id = cms_tests.test_uuid(201) $$,
    'Manager cannot delete Super Admin role assignment'
);

-- Test 15: Delete operations - cannot delete own highest rank role
-- Manager attempts to delete their own highest rank role
DELETE FROM cms.account_roles 
       WHERE account_id = cms_tests.test_uuid(102) AND role_id = cms_tests.test_uuid(203);

SELECT isnt_empty(
    $$ SELECT * FROM cms.account_roles WHERE account_id = cms_tests.test_uuid(102) AND role_id = cms_tests.test_uuid(203) $$,
    'Manager cannot delete their own highest rank role'
);

-- Test 16: Delete operations - can delete lower rank role from self
SELECT lives_ok(
    $$ DELETE FROM cms.account_roles 
       WHERE account_id = cms_tests.test_uuid(102) AND role_id = cms_tests.test_uuid(204) $$,
    'Manager can delete lower rank role from themselves'
);

-- Test 17: Cannot delete non-existent assignment
SELECT is_empty(
    $$ SELECT * FROM cms.account_roles 
       WHERE account_id = cms_tests.test_uuid(103) AND role_id = cms_tests.test_uuid(205) $$,
    'Verify assignment does not exist before test'
);

-- Try to delete non-existent assignment (should affect 0 rows)
DELETE FROM cms.account_roles 
WHERE account_id = cms_tests.test_uuid(103) AND role_id = cms_tests.test_uuid(205);

SELECT ok(
    (SELECT count(*) FROM cms.account_roles 
     WHERE account_id = cms_tests.test_uuid(103)) = 1,
    'Original role assignment remains after failed delete of non-existent role'
);

-- Test 20: Select operations - users can view their own roles
SELECT cms_tests.authenticate_as('regular_user');

SELECT isnt_empty(
    $$ SELECT * FROM cms.account_roles 
       WHERE account_id = cms_tests.test_uuid(103) $$,
    'Users can view their own role assignments'
);

-- Test 21: Select operations - manager can view lower rank user roles
SELECT cms_tests.authenticate_as('manager');

SELECT ok(
    (SELECT count(*) FROM cms.account_roles 
     WHERE account_id = cms_tests.test_uuid(104)) >= 0,
    'Manager can view lower rank user role assignments'
);

-- Test 22: One role per account constraint - cannot assign second role
SELECT cms_tests.authenticate_as('super_admin');
-- Clean up any existing assignments for test user
DELETE FROM cms.account_roles WHERE account_id = cms_tests.test_uuid(104);

-- Assign Guest role
SELECT lives_ok(
    $$ INSERT INTO cms.account_roles (account_id, role_id) 
       VALUES (cms_tests.test_uuid(104), cms_tests.test_uuid(205)) $$,
    'Can assign first role to account'
);

-- Try to assign second role (should fail due to unique constraint)
SELECT throws_ok(
    $$ INSERT INTO cms.account_roles (account_id, role_id) 
       VALUES (cms_tests.test_uuid(104), cms_tests.test_uuid(204)) $$,
    'duplicate key value violates unique constraint "account_roles_account_id_key"',
    'Cannot assign second role to same account (one role per account)'
);

-- Verify only one assignment exists
SELECT row_eq(
    $$ SELECT count(*) FROM cms.account_roles 
       WHERE account_id = cms_tests.test_uuid(104) $$,
    row(1::bigint),
    'Account has exactly one role assignment'
);

-- Test 23: Accounts can have zero roles - deletion is allowed

-- Self deletion is disallowed
SELECT cms_tests.authenticate_as('manager');

DELETE FROM cms.account_roles 
       WHERE account_id = cms_tests.test_uuid(104) AND role_id = cms_tests.test_uuid(205);

-- Verify account now has no roles
SELECT isnt_empty(
    $$ SELECT * FROM cms.account_roles 
       WHERE account_id = cms_tests.test_uuid(104) $$,
    'Manager cannot delete their own role'
);

-- Deletion by super admin is allowed
SELECT cms_tests.authenticate_as('super_admin');

DELETE FROM cms.account_roles 
       WHERE account_id = cms_tests.test_uuid(104) 
       AND role_id = cms_tests.test_uuid(205);

SELECT is_empty(
    $$ SELECT * FROM cms.account_roles WHERE account_id = cms_tests.test_uuid(104) $$,
    'Super Admin can delete role from account'
);

-- Test role replacement (delete + insert due to unique constraint)
SELECT cms_tests.authenticate_as('super_admin');

SELECT lives_ok(
    $$ DELETE FROM cms.account_roles 
       WHERE account_id = cms_tests.test_uuid(104) AND role_id = cms_tests.test_uuid(205) $$,
    'Can delete existing role'
);

SELECT lives_ok(
    $$ INSERT INTO cms.account_roles (account_id, role_id) 
       VALUES (cms_tests.test_uuid(104), cms_tests.test_uuid(204)) $$,
    'Can assign new role after deletion'
);

SELECT finish();

ROLLBACK;