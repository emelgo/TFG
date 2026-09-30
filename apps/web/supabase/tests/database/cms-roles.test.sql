-- Test file: test_roles_operations.sql
-- Tests actual CRUD operations on cms.roles table
-- This tests role management through RLS policies and business rules

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

-- Create initial roles with different priorities
INSERT INTO cms.roles (id, name, rank, description) VALUES
    (cms_tests.test_uuid(201), 'Super Admin', 100, 'Highest rank role'),
    (cms_tests.test_uuid(202), 'Manager', 50, 'Mid-level management role'),
    (cms_tests.test_uuid(203), 'User', 20, 'Standard user role');

-- Create system permissions for role management
INSERT INTO cms.permissions (id, name, permission_type, system_resource, action) VALUES
    (cms_tests.test_uuid(301), 'role_insert', 'system', 'role', 'insert'),
    (cms_tests.test_uuid(302), 'role_update', 'system', 'role', 'update'),
    (cms_tests.test_uuid(303), 'role_delete', 'system', 'role', 'delete'),
    (cms_tests.test_uuid(304), 'role_select', 'system', 'role', 'select');

-- Assign roles to accounts
INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(201)),  -- Super Admin
    (cms_tests.test_uuid(102), cms_tests.test_uuid(202)),  -- Manager
    (cms_tests.test_uuid(103), cms_tests.test_uuid(203));  -- User

-- Grant permissions to roles
INSERT INTO cms.role_permissions (role_id, permission_id) VALUES
    -- Super Admin gets all role permissions
    (cms_tests.test_uuid(201), cms_tests.test_uuid(301)),
    (cms_tests.test_uuid(201), cms_tests.test_uuid(302)),
    (cms_tests.test_uuid(201), cms_tests.test_uuid(303)),
    (cms_tests.test_uuid(201), cms_tests.test_uuid(304)),
    -- Manager gets insert/update/delete/select permissions  
    (cms_tests.test_uuid(202), cms_tests.test_uuid(301)),
    (cms_tests.test_uuid(202), cms_tests.test_uuid(302)),
    (cms_tests.test_uuid(202), cms_tests.test_uuid(303)),
    (cms_tests.test_uuid(202), cms_tests.test_uuid(304));

-- [TFG] B-47: desde que `view_account_roles` solo muestra las asignaciones
-- ajenas a quien tiene `account:select`, gestionar (y comprobar) los roles
-- de otras cuentas exige también poder consultarlas, como en Ajustes >
-- Miembros. Por eso los roles que actúan sobre otras cuentas lo reciben.
INSERT INTO cms.permissions (id, name, permission_type, system_resource, action) VALUES
    (cms_tests.test_uuid(305), 'account_select', 'system', 'account', 'select');

INSERT INTO cms.role_permissions (role_id, permission_id) VALUES
    (cms_tests.test_uuid(201), cms_tests.test_uuid(305)),
    (cms_tests.test_uuid(202), cms_tests.test_uuid(305));

-- Test 1: Unauthenticated user cannot view roles
SET ROLE anon;

SELECT throws_ok(
    $$ SELECT * FROM cms.roles $$,
    'permission denied for schema cms'
);

-- Test 2: Authenticated user with admin access can view all roles
SELECT cms_tests.authenticate_as('regular_user');

SELECT isnt_empty(
    $$ SELECT * FROM cms.roles $$,
    'Authenticated user with admin access can view roles'
);

-- Test 3: User without admin access cannot view roles  
SELECT cms_tests.set_admin_access('user@test.com', 'false');

SELECT is_empty(
    $$ SELECT * FROM cms.roles $$,
    'User without admin access cannot view roles'
);

-- Restore admin access
SELECT cms_tests.set_admin_access('user@test.com', 'true');

-- Test 4: User without role permissions cannot create roles
SELECT throws_ok(
    $$ INSERT INTO cms.roles (id, name, rank, description) 
    VALUES (cms_tests.test_uuid(210), 'New Role', 10, 'Test role') $$,
    'new row violates row-level security policy for table "roles"',
    'User without role insert permission cannot create roles'
);

-- Test 5: Super Admin can create new roles with lower rank
SELECT cms_tests.authenticate_as('super_admin');

INSERT INTO cms.roles (id, name, rank, description) 
VALUES (cms_tests.test_uuid(210), 'Guest Role', 10, 'Lowest rank role');

SELECT row_eq(
    $$ SELECT name, rank FROM cms.roles WHERE id = cms_tests.test_uuid(210) $$,
    ROW('Guest Role'::varchar, 10),
    'Super Admin can create roles with lower rank'
);

-- Test 6: Cannot create role with rank equal to own max rank
SELECT throws_ok(
    $$ INSERT INTO cms.roles (id, name, rank, description) 
    VALUES (cms_tests.test_uuid(211), 'Equal rank', 100, 'Same as super admin') $$,
    'new row violates row-level security policy for table "roles"',
    'Cannot create role with rank equal to own max rank'
);

-- Test 7: Cannot create role with rank higher than own max rank  
SELECT throws_ok(
    $$ INSERT INTO cms.roles (id, name, rank, description) 
    VALUES (cms_tests.test_uuid(212), 'Higher rank', 110, 'Higher than super admin') $$,
    'new row violates row-level security policy for table "roles"',
    'Cannot create role with rank higher than own max rank'
);

-- Test 8: rank must be unique - duplicate rank fails
SELECT throws_ok(
    $$ INSERT INTO cms.roles (id, name, rank, description) 
    VALUES (cms_tests.test_uuid(213), 'Duplicate rank', 10, 'Same rank as Guest Role') $$,
    'duplicate key value violates unique constraint "roles_rank_unique"',
    'Cannot create role with duplicate rank'
);

-- Test 9: Manager can create roles with lower rank than their own
SELECT cms_tests.authenticate_as('manager');

SELECT lives_ok(
    $$ INSERT INTO cms.roles (id, name, rank, description) 
       VALUES (cms_tests.test_uuid(214), 'Trainee', 15, 'Lower than manager rank') $$,
    'Manager can create roles with lower rank'
);

SELECT row_eq(
    $$ SELECT name, rank FROM cms.roles WHERE id = cms_tests.test_uuid(214) $$,
    ROW('Trainee'::varchar, 15),
    'Trainee role was created successfully'
);

-- Test 10: Manager cannot create roles with equal or higher rank
SELECT throws_ok(
    $$ INSERT INTO cms.roles (id, name, rank, description) 
       VALUES (cms_tests.test_uuid(215), 'Senior Manager', 50, 'Equal to manager rank') $$,
    'new row violates row-level security policy for table "roles"',
    'Manager cannot create role with equal rank to own'
);

SELECT is_empty(
    $$ SELECT * FROM cms.roles WHERE id = cms_tests.test_uuid(215) $$,
    'Senior Manager role was not created'
);

SELECT throws_ok(
    $$ INSERT INTO cms.roles (id, name, rank, description) 
       VALUES (cms_tests.test_uuid(216), 'Director', 80, 'Higher than manager rank') $$,
    'new row violates row-level security policy for table "roles"',
    'Manager cannot create role with higher rank than own'
);

SELECT is_empty(
    $$ SELECT * FROM cms.roles WHERE id = cms_tests.test_uuid(216) $$,
    'Director role was not created'
);

-- Test 11: Super Admin can update any lower rank role
SELECT cms_tests.authenticate_as('super_admin');

UPDATE cms.roles 
SET description = 'Updated by super admin' 
WHERE id = cms_tests.test_uuid(202);

SELECT row_eq(
    $$ SELECT description FROM cms.roles WHERE id = cms_tests.test_uuid(202) $$,
    ROW('Updated by super admin'::varchar),
    'Super Admin can update lower rank roles'
);

-- Test 12: Manager can update lower rank roles
SELECT cms_tests.authenticate_as('manager');

UPDATE cms.roles 
SET description = 'Updated by manager' 
WHERE id = cms_tests.test_uuid(214);

SELECT row_eq(
    $$ SELECT description FROM cms.roles WHERE id = cms_tests.test_uuid(214) $$,
    ROW('Updated by manager'::varchar),
    'Manager can update lower rank roles'
);

-- Test 13: Manager cannot update higher rank roles
UPDATE cms.roles 
SET description = 'Hacked by manager' 
WHERE id = cms_tests.test_uuid(201);

SELECT row_eq(
    $$ SELECT description FROM cms.roles WHERE id = cms_tests.test_uuid(201) $$,
    ROW('Highest rank role'::varchar),
    'Manager cannot update Super Admin role (no change occurred)'
);

-- Test 14: Manager cannot update equal rank roles (their own role)
UPDATE cms.roles 
SET description = 'Self-updated' 
WHERE id = cms_tests.test_uuid(202);

SELECT row_eq(
    $$ SELECT description FROM cms.roles WHERE id = cms_tests.test_uuid(202) $$,
    ROW('Updated by super admin'::varchar),
    'Manager cannot update their own role (no change occurred)'
);

-- Test 15: Cannot update role rank to value >= own max rank
SELECT cms_tests.authenticate_as('super_admin');

select throws_ok(
    $$ UPDATE cms.roles 
       SET rank = 100
       WHERE id = cms_tests.test_uuid(214) $$,
    'Cannot modify a role with a rank higher than or equal to your maximum role rank (100). Your max rank: 100, Role rank: 100'
);

SELECT row_eq(
    $$ SELECT rank FROM cms.roles WHERE id = cms_tests.test_uuid(214) $$,
    ROW(15),
    'Cannot update role rank to high value (no change occurred)'
);

-- Test 16: Super Admin can delete lower rank roles
DELETE FROM cms.roles WHERE id = cms_tests.test_uuid(214);

SELECT is_empty(
    $$ SELECT * FROM cms.roles WHERE id = cms_tests.test_uuid(214) $$,
    'Super Admin can delete lower rank roles'
);

-- Test 17: Manager cannot delete higher rank roles
SELECT cms_tests.authenticate_as('manager');

DELETE FROM cms.roles WHERE id = cms_tests.test_uuid(201);

SELECT isnt_empty(
    $$ SELECT * FROM cms.roles WHERE id = cms_tests.test_uuid(201) $$,
    'Manager cannot delete Super Admin role (role still exists)'
);

-- Test 18: Cannot delete role you currently have assigned
DELETE FROM cms.roles WHERE id = cms_tests.test_uuid(202);

SELECT isnt_empty(
    $$ SELECT * FROM cms.roles WHERE id = cms_tests.test_uuid(202) $$,
    'Manager cannot delete their own assigned role (role still exists)'
);

-- Test 19: Can delete role after it's no longer assigned to you
SELECT cms_tests.authenticate_as('super_admin');

-- Remove manager's role assignment
DELETE FROM cms.account_roles 
WHERE account_id = cms_tests.test_uuid(102) AND role_id = cms_tests.test_uuid(202);

-- Now manager (who no longer has that role) should not be able to delete it
SELECT cms_tests.authenticate_as('manager');

DELETE FROM cms.roles WHERE id = cms_tests.test_uuid(202);

SELECT isnt_empty(
    $$ SELECT * FROM cms.roles WHERE id = cms_tests.test_uuid(202) $$,
    'User without roles cannot delete any roles (role still exists)'
);

-- Test 20: Super Admin can delete the role after removing assignment
SELECT cms_tests.authenticate_as('super_admin');

DELETE FROM cms.roles WHERE id = cms_tests.test_uuid(202);

SELECT is_empty(
    $$ SELECT * FROM cms.roles WHERE id = cms_tests.test_uuid(202) $$,
    'Super Admin can delete role after removing assignments'
);

-- Test 21: Role deletion cascades properly (verify no orphaned assignments)
-- First create a test role and assign it
SELECT lives_ok(
    $$ UPDATE cms.roles 
       SET rank = 5
       WHERE id = cms_tests.test_uuid(220) $$,
    'Test role created successfully'
);

set role postgres;

-- Create new user
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(4), 'test_user', 'test_user@test.com');

-- Create Role
SELECT lives_ok(
    $$ INSERT INTO cms.roles (id, name, rank, description) 
       VALUES (cms_tests.test_uuid(220), 'Test Delete', 5, 'Will be deleted') $$,
    'Test role created successfully'
);

-- Delete the role
DELETE FROM cms.roles WHERE id = cms_tests.test_uuid(220);

SELECT is_empty(
    $$ SELECT * FROM cms.account_roles WHERE role_id = cms_tests.test_uuid(220) $$,
    'Role deletion cascades to remove account assignments'
);

-- Test 22: Name uniqueness constraint
SELECT throws_ok(
    $$ INSERT INTO cms.roles (id, name, rank, description) 
       VALUES (cms_tests.test_uuid(221), 'User', 25, 'Duplicate name') $$,
    'duplicate key value violates unique constraint "roles_name_key"',
    'Cannot create role with duplicate name'
);

SELECT is_empty(
    $$ SELECT * FROM cms.roles WHERE id = cms_tests.test_uuid(221) $$,
    'Role with duplicate name was not created'
);

SELECT finish();

ROLLBACK;