-- Test suite for cms.can_action_account function
-- Tests the updated logic that prevents all self-modification

BEGIN;

-- PymeKit exige MFA en el CMS por defecto (ADR-014); esa regla se prueba en
-- cms-super-admin-root.test.sql. Aquí se valida la lógica funcional con
-- sesiones sin segundo factor, así que se desactiva el requisito de forma
-- explícita. El ROLLBACK final deshace el cambio.
update cms.configuration set value = 'false' where key = 'requires_mfa';

-- Create test plan
SELECT plan(8);

-- Clean up any existing test data
DELETE FROM cms.role_permissions WHERE permission_id = cms_tests.test_uuid(801);
DELETE FROM cms.permissions WHERE id = cms_tests.test_uuid(801);
DELETE FROM cms.account_roles WHERE account_id IN (
    SELECT id FROM cms.accounts WHERE metadata->>'email' LIKE '%canactionaccount%'
);
DELETE FROM cms.accounts WHERE metadata->>'email' LIKE '%canactionaccount%';
DELETE FROM cms.role_permissions WHERE role_id IN (
    SELECT id FROM cms.roles WHERE name LIKE '%CAA%'
);
DELETE FROM cms.roles WHERE name LIKE '%CAA%';

-- Create test users
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(801), 'admin_caa', 'admin_canactionaccount@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(802), 'manager_caa', 'manager_canactionaccount@test.com'); 
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(803), 'user_caa', 'user_canactionaccount@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(804), 'inactive_caa', 'inactive_canactionaccount@test.com');

-- Create test roles with different ranks (using unique ranks not in use)
INSERT INTO cms.roles (id, name, description, rank) VALUES
(cms_tests.test_uuid(701), 'Test Admin CAA', 'High rank admin role', 95),
(cms_tests.test_uuid(702), 'Test Manager CAA', 'Mid rank manager role', 45),
(cms_tests.test_uuid(703), 'Test User CAA', 'Low rank user role', 5);

-- Create test accounts
INSERT INTO cms.accounts (id, auth_user_id, is_active, metadata) VALUES
(cms_tests.test_uuid(601), cms_tests.test_uuid(801), true, '{"email": "admin_canactionaccount@test.com"}'),
(cms_tests.test_uuid(602), cms_tests.test_uuid(802), true, '{"email": "manager_canactionaccount@test.com"}'),
(cms_tests.test_uuid(603), cms_tests.test_uuid(803), true, '{"email": "user_canactionaccount@test.com"}'),
(cms_tests.test_uuid(604), cms_tests.test_uuid(804), false, '{"email": "inactive_canactionaccount@test.com"}');

-- Assign roles to accounts
INSERT INTO cms.account_roles (account_id, role_id) VALUES
(cms_tests.test_uuid(601), cms_tests.test_uuid(701)),  -- admin account -> admin role
(cms_tests.test_uuid(602), cms_tests.test_uuid(702)),  -- manager account -> manager role
(cms_tests.test_uuid(603), cms_tests.test_uuid(703));  -- user account -> user role

-- Create a standard account update permission and grant it to admin role
INSERT INTO cms.permissions (id, name, permission_type, system_resource, action, description) 
VALUES (cms_tests.test_uuid(801), 'Account Update CAA', 'system', 'account', 'update', 'Permission to update accounts for CAA test')
ON CONFLICT DO NOTHING;

-- Grant to admin role
INSERT INTO cms.role_permissions (role_id, permission_id)
VALUES (cms_tests.test_uuid(701), cms_tests.test_uuid(801))
ON CONFLICT DO NOTHING;

-- Set admin access and context for testing
SELECT cms_tests.authenticate_as('admin_caa');
SELECT cms_tests.set_admin_access('admin_canactionaccount@test.com', 'true');

-- Test 1: Admin cannot action their own account (self-modification blocked)
SELECT results_eq(
    $$ SELECT cms.can_action_account(cms_tests.test_uuid(601), 'update') $$,
    $$ VALUES (false) $$,
    'Admin cannot action their own account - self-modification is blocked'
);

-- Test 2: Admin can action lower rank account (different account, higher rank)
SELECT results_eq(
    $$ SELECT cms.can_action_account(cms_tests.test_uuid(603), 'update') $$,
    $$ VALUES (true) $$,
    'Admin can action lower rank account (different account, higher rank)'
);

-- Test 3: Manager cannot action admin account (higher rank)
-- First, set up the context to simulate manager user
DO $$
BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object(
        'sub', cms_tests.test_uuid(802)
    )::text, true);
END $$;

SELECT results_eq(
    $$ SELECT cms.can_action_account(cms_tests.test_uuid(601), 'update') $$,
    $$ VALUES (false) $$,
    'Manager cannot action admin account (higher rank)'
);

-- Test 4: Manager cannot action their own account (self-modification blocked)
SELECT results_eq(
    $$ SELECT cms.can_action_account(cms_tests.test_uuid(602), 'update') $$,
    $$ VALUES (false) $$,
    'Manager cannot action their own account - self-modification is blocked'
);

-- Test 5: NULL account ID returns false
SELECT results_eq(
    $$ SELECT cms.can_action_account(NULL, 'update') $$,
    $$ VALUES (false) $$,
    'NULL account ID returns false'
);

-- Test 6: NULL action returns false
SELECT results_eq(
    $$ SELECT cms.can_action_account(cms_tests.test_uuid(603), NULL) $$,
    $$ VALUES (false) $$,
    'NULL action returns false'
);

-- Test 7: Inactive account context returns false (no account ID found)
DO $$
BEGIN
    -- Set context to inactive user
    PERFORM set_config('request.jwt.claims', json_build_object(
        'sub', cms_tests.test_uuid(804)
    )::text, true);
END $$;

SELECT results_eq(
    $$ SELECT cms.can_action_account(cms_tests.test_uuid(603), 'update') $$,
    $$ VALUES (false) $$,
    'Inactive account context returns false'
);

-- Test 8: Delete action on self is blocked (even if self-modification was allowed)
-- Reset to admin context
DO $$
BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object(
        'sub', cms_tests.test_uuid(801)
    )::text, true);
END $$;

SELECT results_eq(
    $$ SELECT cms.can_action_account(cms_tests.test_uuid(601), 'delete') $$,
    $$ VALUES (false) $$,
    'Delete action on self is blocked'
);

-- Clean up test data
DELETE FROM cms.role_permissions WHERE role_id IN (cms_tests.test_uuid(701), cms_tests.test_uuid(702), cms_tests.test_uuid(703));
DELETE FROM cms.account_roles WHERE account_id IN (cms_tests.test_uuid(601), cms_tests.test_uuid(602), cms_tests.test_uuid(603), cms_tests.test_uuid(604));
DELETE FROM cms.accounts WHERE id IN (cms_tests.test_uuid(601), cms_tests.test_uuid(602), cms_tests.test_uuid(603), cms_tests.test_uuid(604));
DELETE FROM cms.roles WHERE id IN (cms_tests.test_uuid(701), cms_tests.test_uuid(702), cms_tests.test_uuid(703));

-- Reset JWT context
DO $$ BEGIN
    PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

SELECT finish();

ROLLBACK;