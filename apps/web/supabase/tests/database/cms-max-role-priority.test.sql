-- Test file: get_user_max_role_rank.test.sql
-- Tests cms.get_user_max_role_rank function
-- This function is critical for role hierarchy-based security decisions
-- NOTE: Each account can only have ONE role assigned due to unique constraint

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
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(2), 'manager_user', 'manager@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(3), 'regular_user', 'regular@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(4), 'no_role_user', 'nouser@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(5), 'role_change_user', 'rolechange@test.com');

-- Create accounts
INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES
                                                                (cms_tests.test_uuid(101), cms_tests.test_uuid(1), true),  -- Super Admin account
                                                                (cms_tests.test_uuid(102), cms_tests.test_uuid(2), true),  -- Manager User account
                                                                (cms_tests.test_uuid(103), cms_tests.test_uuid(3), true),  -- Regular User account
                                                                (cms_tests.test_uuid(104), cms_tests.test_uuid(4), true),  -- No Role User account
                                                                (cms_tests.test_uuid(105), cms_tests.test_uuid(5), true);  -- Role Change User account

-- Create roles with different priorities
INSERT INTO cms.roles (id, name, rank, description) VALUES
                                                                 (cms_tests.test_uuid(201), 'Super Admin', 100, 'Highest rank role'),
                                                                 (cms_tests.test_uuid(202), 'Senior Manager', 80, 'High rank management role'),
                                                                 (cms_tests.test_uuid(203), 'Manager', 60, 'Mid-level management role'),
                                                                 (cms_tests.test_uuid(204), 'Team Lead', 40, 'Team leadership role'),
                                                                 (cms_tests.test_uuid(205), 'Senior User', 30, 'Senior user role'),
                                                                 (cms_tests.test_uuid(206), 'Regular User', 20, 'Standard user role'),
                                                                 (cms_tests.test_uuid(207), 'Guest', 10, 'Lowest rank role'),
                                                                 (cms_tests.test_uuid(208), 'Zero rank', 0, 'Zero rank role'),
                                                                 (cms_tests.test_uuid(209), 'High rank Test', 95, 'High rank test role'),
                                                                 (cms_tests.test_uuid(210), 'Mid rank Test', 50, 'Mid rank test role');

-- [TFG] B-47: con una sesión de usuario, `get_user_max_role_rank` solo
-- responde sobre otras cuentas a quien tiene `account:select`. Estas
-- pruebas consultan el rango de muchas cuentas, así que el rol del
-- super-admin de prueba (que se le asigna en el test 4) y el de Manager lo
-- reciben (la
-- restricción se prueba en
-- cms-rbac-isolation.test.sql, P2).
INSERT INTO cms.permissions (id, name, permission_type, system_resource, action) VALUES
    (cms_tests.test_uuid(305), 'account_select', 'system', 'account', 'select');

INSERT INTO cms.role_permissions (role_id, permission_id) VALUES
    (cms_tests.test_uuid(201), cms_tests.test_uuid(305)),
    (cms_tests.test_uuid(203), cms_tests.test_uuid(305));

-- Authenticate as super admin for testing
SELECT cms_tests.authenticate_as('super_admin');

-- Test 1: NULL input returns NULL
SELECT is(
               cms.get_user_max_role_rank(NULL),
               NULL,
               'Function returns NULL for NULL input'
       );

-- Test 2: Nonexistent account returns NULL
SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(999)),
               NULL,
               'Function returns NULL for nonexistent account'
       );

-- Test 3: Account with no roles returns NULL
SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(104)),
               NULL,
               'Function returns NULL for account with no roles'
       );

-- Test 4: Single role assignment returns correct rank (highest rank)
set role postgres;
INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(201));  -- Super Admin (rank 100)

SELECT cms_tests.authenticate_as('super_admin');

SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(101)),
               100,
               'Function returns correct rank for Super Admin role (100)'
       );

-- Test 5: Different role assignment returns different rank
set role postgres;
INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(102), cms_tests.test_uuid(203));  -- Manager (rank 60)

SELECT cms_tests.authenticate_as('super_admin');
SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(102)),
               60,
               'Function returns correct rank for Manager role (60)'
       );

-- Test 6: Low rank role
set role postgres;
INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(103), cms_tests.test_uuid(206));  -- Regular User (rank 20)

SELECT cms_tests.authenticate_as('super_admin');
SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(103)),
               20,
               'Function returns correct rank for Regular User role (20)'
       );

-- Test 7: Lowest rank role (0)
set role postgres;
INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(105), cms_tests.test_uuid(208));  -- Zero rank (rank 0)

SELECT cms_tests.authenticate_as('super_admin');
SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(105)),
               0,
               'Function returns correct rank for zero rank role'
       );

-- Test 8: Cannot assign multiple roles (unique constraint)
SELECT throws_ok(
               $$ INSERT INTO cms.account_roles (account_id, role_id) VALUES
       (cms_tests.test_uuid(101), cms_tests.test_uuid(202)) $$
       );

-- Test 9: Role change updates result
-- Change user from Zero rank to High rank
set role postgres;
UPDATE cms.account_roles
SET role_id = cms_tests.test_uuid(209)  -- High rank Test (rank 95)
WHERE account_id = cms_tests.test_uuid(105);

SELECT cms_tests.authenticate_as('super_admin');

SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(105)),
               95,
               'Function returns updated rank after role change'
       );

-- Test 10: Removing role returns NULL
set role postgres;
DELETE FROM cms.account_roles
WHERE account_id = cms_tests.test_uuid(105);

SELECT cms_tests.authenticate_as('super_admin');
SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(105)),
               NULL,
               'Function returns NULL after removing role'
       );

-- Test 11: Role rank changes affect result
-- First assign a role
set role postgres;
INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(105), cms_tests.test_uuid(210));  -- Mid rank Test (rank 50)

SELECT cms_tests.authenticate_as('super_admin');
SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(105)),
               50,
               'Function returns correct rank before role rank change'
       );

-- Change the role's rank
set role postgres;
UPDATE cms.roles
SET rank = 75
WHERE id = cms_tests.test_uuid(210);

SELECT cms_tests.authenticate_as('super_admin');
SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(105)),
               75,
               'Function returns updated rank after role rank change'
       );

-- Test 12: All different rank levels work correctly
-- Test each major rank level
set role postgres;
DELETE FROM cms.account_roles WHERE account_id = cms_tests.test_uuid(105);

-- rank 100
INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(105), cms_tests.test_uuid(201));  -- Super Admin (100)

SELECT cms_tests.authenticate_as('super_admin');
SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(105)),
               100,
               'rank 100 works correctly'
       );

-- Change to rank 80
set role postgres;
UPDATE cms.account_roles
SET role_id = cms_tests.test_uuid(202)  -- Senior Manager (80)
WHERE account_id = cms_tests.test_uuid(105);

SELECT cms_tests.authenticate_as('super_admin');
SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(105)),
               80,
               'rank 80 works correctly'
       );

-- Change to rank 40
set role postgres;
UPDATE cms.account_roles
SET role_id = cms_tests.test_uuid(204)  -- Team Lead (40)
WHERE account_id = cms_tests.test_uuid(105);

SELECT cms_tests.authenticate_as('super_admin');
SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(105)),
               40,
               'rank 40 works correctly'
       );

-- Change to rank 10
set role postgres;
UPDATE cms.account_roles
SET role_id = cms_tests.test_uuid(207)  -- Guest (10)
WHERE account_id = cms_tests.test_uuid(105);

SELECT cms_tests.authenticate_as('super_admin');
SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(105)),
               10,
               'rank 10 works correctly'
       );

-- Test 13: Multiple users with different roles
SELECT cms_tests.authenticate_as('manager_user');

SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(101)),
               100,
               'User 1 still has rank 100'
       );

SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(102)),
               60,
               'User 2 still has rank 60'
       );

SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(103)),
               20,
               'User 3 still has rank 20'
       );

SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(104)),
               NULL,
               'User 4 still has no role (NULL)'
       );

SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(105)),
               10,
               'User 5 has rank 10 after changes'
       );

-- Test 14: Function consistency (multiple calls return same result)
SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(101)),
               100,
               'Function consistency: First call returns 100'
       );

SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(101)),
               100,
               'Function consistency: Second call returns 100'
       );

SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(102)),
               60,
               'Function consistency: Different user returns 60'
       );

SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(101)),
               100,
               'Function consistency: Back to first user still returns 100'
       );

-- Test 15: Role deletion affects result immediately
set role postgres;
DELETE FROM cms.roles WHERE id = cms_tests.test_uuid(201);  -- Delete Super Admin role

SELECT cms_tests.authenticate_as('super_admin');
SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(101)),
               NULL,
               'Role deletion: Function returns NULL when assigned role is deleted'
       );

-- Test 16: Account deletion cleanup (role assignments should cascade)
set role postgres;
DELETE FROM cms.accounts WHERE id = cms_tests.test_uuid(105);

SELECT cms_tests.authenticate_as('super_admin');
SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(105)),
               NULL,
               'Account deletion: Function returns NULL for deleted account'
       );

-- Test 17: Inactive account still returns rank (function doesn't check is_active)
set role postgres;
UPDATE cms.accounts
SET is_active = false
WHERE id = cms_tests.test_uuid(102);

-- [TFG] B-47: el rol del super-admin de prueba se borró en el test 15, así
-- que ya no tiene `account:select`. Se comprueba como `postgres`, el mismo
-- contexto de confianza en el que la usan las funciones internas.
SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(102)),
               60,
               'Inactive account: Function still returns rank (does not check is_active)'
       );

-- Test 18: Edge case - rank boundary values
-- Create edge case roles
set role postgres;
INSERT INTO cms.roles (id, name, rank) VALUES
                                                    (cms_tests.test_uuid(211), 'rank 1', 1),
                                                    (cms_tests.test_uuid(212), 'rank 99', 99);

-- Test rank 1
INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(211));  -- rank 1

SELECT cms_tests.authenticate_as('super_admin');
SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(101)),
               1,
               'Edge case: rank 1 works correctly'
       );

-- Test rank 99
set role postgres;
UPDATE cms.account_roles
SET role_id = cms_tests.test_uuid(212)  -- rank 99
WHERE account_id = cms_tests.test_uuid(101);

SELECT cms_tests.authenticate_as('super_admin');
SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(101)),
               99,
               'Edge case: rank 99 works correctly'
       );

-- Test 19: Reassigning same role doesn't break anything
set role postgres;
UPDATE cms.account_roles
SET role_id = cms_tests.test_uuid(212)  -- Same role (rank 99)
WHERE account_id = cms_tests.test_uuid(101);

SELECT cms_tests.authenticate_as('super_admin');
SELECT is(
               cms.get_user_max_role_rank(cms_tests.test_uuid(101)),
               99,
               'Reassigning same role: rank remains correct'
       );

-- Test 20: Role with same rank as existing
set role postgres;

-- Should not be able to create due to unique rank constraint
SELECT throws_ok(
               $$ INSERT INTO cms.roles (id, name, rank) VALUES
       (cms_tests.test_uuid(214), 'Duplicate rank 99', 99) $$
       );

SELECT finish();

ROLLBACK;