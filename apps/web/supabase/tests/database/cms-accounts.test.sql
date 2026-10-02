-- Test suite for cms accounts functionality
-- Tests RLS policies, functions, triggers, and account management

BEGIN;

-- PymeKit exige MFA en el CMS por defecto (ADR-014); esa regla se prueba en
-- cms-super-admin-root.test.sql. Aquí se valida la lógica funcional con
-- sesiones sin segundo factor, así que se desactiva el requisito de forma
-- explícita. El ROLLBACK final deshace el cambio.
update cms.configuration set value = 'false' where key = 'requires_mfa';

-- Create test plan (reduced by 1 since Test 16 was removed as not applicable)
SELECT plan(24);

-- Clean up any existing test data
DELETE FROM cms.role_permissions WHERE permission_id IN (
    SELECT id FROM cms.permissions WHERE name LIKE '%Account Test%'
);
DELETE FROM cms.permissions WHERE name LIKE '%Account Test%';
DELETE FROM cms.account_roles WHERE account_id IN (
    SELECT id FROM cms.accounts WHERE metadata->>'email' LIKE '%accounttest%'
);
DELETE FROM cms.accounts WHERE metadata->>'email' LIKE '%accounttest%';
DELETE FROM cms.role_permissions WHERE role_id IN (
    SELECT id FROM cms.roles WHERE name LIKE '%Account Test%'
);
DELETE FROM cms.roles WHERE name LIKE '%Account Test%';

-- Create test users
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(1001), 'admin_acct', 'admin_accounttest@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(1002), 'manager_acct', 'manager_accounttest@test.com'); 
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(1003), 'user_acct', 'user_accounttest@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(1004), 'inactive_acct', 'inactive_accounttest@test.com');

-- Create test roles with different ranks (using unique ranks not in use)
INSERT INTO cms.roles (id, name, description, rank) VALUES
(cms_tests.test_uuid(701), 'Account Test Admin', 'High rank admin role for account tests', 88),
(cms_tests.test_uuid(702), 'Account Test Manager', 'Mid rank manager role for account tests', 38),
(cms_tests.test_uuid(703), 'Account Test User', 'Low rank user role for account tests', 8);

-- Create test accounts
INSERT INTO cms.accounts (id, auth_user_id, is_active, metadata, preferences) VALUES
(cms_tests.test_uuid(601), cms_tests.test_uuid(1001), true, '{"email": "admin_accounttest@test.com"}', '{"language": "en", "timezone": "UTC"}'),
(cms_tests.test_uuid(602), cms_tests.test_uuid(1002), true, '{"email": "manager_accounttest@test.com"}', '{"language": "en", "timezone": "America/New_York"}'),
(cms_tests.test_uuid(603), cms_tests.test_uuid(1003), true, '{"email": "user_accounttest@test.com"}', '{"language": "es", "timezone": "Europe/Madrid"}'),
(cms_tests.test_uuid(604), cms_tests.test_uuid(1004), false, '{"email": "inactive_accounttest@test.com"}', '{"language": "en", "timezone": ""}');

-- Assign roles to accounts
INSERT INTO cms.account_roles (account_id, role_id) VALUES
(cms_tests.test_uuid(601), cms_tests.test_uuid(701)),  -- admin account -> admin role
(cms_tests.test_uuid(602), cms_tests.test_uuid(702)),  -- manager account -> manager role
(cms_tests.test_uuid(603), cms_tests.test_uuid(703));  -- user account -> user role

-- Create account update permission and grant to admin role
INSERT INTO cms.permissions (id, name, permission_type, system_resource, action, description) 
VALUES (cms_tests.test_uuid(801), 'Account Test Update', 'system', 'account', 'update', 'Permission to update accounts for account test')
ON CONFLICT DO NOTHING;

INSERT INTO cms.role_permissions (role_id, permission_id)
VALUES (cms_tests.test_uuid(701), cms_tests.test_uuid(801))
ON CONFLICT DO NOTHING;

-- Set admin user context
SELECT cms_tests.authenticate_as('admin_acct');
SELECT cms_tests.set_admin_access('admin_accounttest@test.com', 'true');

-- ===== SECTION 1: BASIC ACCOUNT OPERATIONS =====

-- Test 1: Admin can view accounts (SELECT policy)
SELECT results_eq(
    $$ SELECT COUNT(*) > 0 FROM cms.accounts WHERE metadata->>'email' LIKE '%accounttest%' $$,
    $$ VALUES (true) $$,
    'Admin can view accounts through SELECT policy'
);

-- Test 2: get_current_user_account_id function works for admin
SELECT results_eq(
    $$ SELECT cms.get_current_user_account_id() $$,
    $$ VALUES (cms_tests.test_uuid(601)::uuid) $$,
    'get_current_user_account_id returns correct ID for admin'
);

-- Test 3: Admin can update other accounts through can_action_account
SELECT lives_ok(
    $$ UPDATE cms.accounts 
       SET metadata = '{"email": "updated_user_accounttest@test.com"}' 
       WHERE id = cms_tests.test_uuid(603) $$,
    'Admin can update other accounts (lower rank user)'
);

-- Test 4: Admin can update their own account through self-account condition
SELECT lives_ok(
    $$ UPDATE cms.accounts 
       SET metadata = '{"email": "updated_admin_accounttest@test.com"}' 
       WHERE id = cms_tests.test_uuid(601) $$,
    'Admin can update their own account through self-account condition'
);

-- revert the update
UPDATE cms.accounts 
SET metadata = '{"email": "admin_accounttest@test.com"}' 
WHERE id = cms_tests.test_uuid(601);

-- ===== SECTION 2: PREFERENCE UPDATE FUNCTION =====

-- Test 5: update_user_preferences function works for admin (self)
SELECT results_eq(
    $$ SELECT (cms.update_user_preferences('{"language": "fr", "timezone": "Europe/Paris"}'::jsonb)->>'success')::boolean $$,
    $$ VALUES (true) $$,
    'Admin can update their own preferences through function'
);

-- Test 6: Preferences were actually updated
SELECT results_eq(
    $$ SELECT preferences->'language' FROM cms.accounts WHERE id = cms_tests.test_uuid(601) $$,
    $$ VALUES ('"fr"'::jsonb) $$,
    'Admin preferences were actually updated in database'
);

-- Test 7: update_user_preferences function includes old and new data in response
SELECT results_eq(
    $$ SELECT (cms.update_user_preferences('{"language": "de", "timezone": "Europe/Berlin"}'::jsonb)->'data'->'new_preferences'->>'language') $$,
    $$ VALUES ('de') $$,
    'update_user_preferences returns new preferences in response data'
);

-- ===== SECTION 3: REGULAR USER TESTS =====

-- Switch to regular user context
SELECT cms_tests.authenticate_as('user_acct');
SELECT cms_tests.set_admin_access('user_accounttest@test.com', 'true');

-- Test 8: Regular user cannot update higher rank accounts (RLS should block)
-- Attempt the update (this will succeed with 0 rows affected due to RLS)
UPDATE cms.accounts 
SET metadata = '{"email": "hacked_admin_accounttest@test.com"}' 
WHERE id = cms_tests.test_uuid(601);

-- Verify the admin account was NOT updated (RLS prevented it)
SELECT results_eq(
    $$ SELECT metadata->>'email' FROM cms.accounts WHERE id = cms_tests.test_uuid(601) $$,
    $$ VALUES ('admin_accounttest@test.com') $$,
    'Regular user cannot update admin account - RLS prevented the update'
);

-- Test 9: Regular user can view accounts (has admin access)
SELECT results_eq(
    $$ SELECT COUNT(*) > 0 FROM cms.accounts WHERE metadata->>'email' LIKE '%accounttest%' $$,
    $$ VALUES (true) $$,
    'Regular user with admin access can view accounts'
);

-- Test 10: Regular user can update their own account through self-account condition
SELECT lives_ok(
    $$ UPDATE cms.accounts 
       SET metadata = '{"email": "updated_user_accounttest@test.com", "display_name": "Updated User"}' 
       WHERE id = cms_tests.test_uuid(603) $$,
    'Regular user can update their own account through self-account condition'
);

-- Test 11: Regular user can update their own preferences
SELECT results_eq(
    $$ SELECT (cms.update_user_preferences('{"language": "it", "timezone": "Europe/Rome"}'::jsonb)->>'success')::boolean $$,
    $$ VALUES (true) $$,
    'Regular user can update their own preferences'
);

-- Test 12: Regular user preferences were actually updated
SELECT results_eq(
    $$ SELECT preferences->'timezone' FROM cms.accounts WHERE id = cms_tests.test_uuid(603) $$,
    $$ VALUES ('"Europe/Rome"'::jsonb) $$,
    'Regular user preferences were actually updated in database'
);

-- ===== SECTION 4: CONSTRAINT AND TRIGGER TESTS =====

-- Test 13: Cannot update auth_user_id (column permissions prevent it)
SELECT throws_ok(
    $$ UPDATE cms.accounts 
       SET auth_user_id = cms_tests.test_uuid(1002)
       WHERE id = cms_tests.test_uuid(603) $$,
    'permission denied for table accounts'
);

-- Test 14: Cannot update account ID (column permissions prevent it)  
SELECT throws_ok(
    $$ UPDATE cms.accounts 
       SET id = cms_tests.test_uuid(999)
       WHERE id = cms_tests.test_uuid(603) $$,
    'permission denied for table accounts'
);

-- Switch back to admin for is_active tests
SELECT cms_tests.authenticate_as('admin_acct');

-- Test 15: Users cannot update is_active (column permission protection)
SELECT throws_ok(
    $$ UPDATE cms.accounts 
       SET is_active = false
       WHERE id = cms_tests.test_uuid(601) $$,
    'permission denied for table accounts',
    'Users cannot update is_active status (column permissions block it)'
);

-- Test 16: Only service_role can update is_active status (skip this test - not applicable to authenticated users)
-- This would require service_role context which is not part of normal user operations

-- ===== SECTION 5: RLS POLICY BOUNDARY TESTS =====

-- Test 16: User without admin access cannot view accounts (SELECT RLS blocks silently)
SELECT cms_tests.authenticate_as('user_acct');
SELECT cms_tests.set_admin_access('user_accounttest@test.com', 'false');

SELECT results_eq(
    $$ SELECT COUNT(*) FROM cms.accounts WHERE metadata->>'email' LIKE '%accounttest%' $$,
    $$ VALUES (0::bigint) $$,
    'User without admin access cannot view accounts - SELECT RLS returns no rows'
);

-- Test 17: User without admin access cannot update preferences (function fails due to SELECT RLS)
-- The function will fail because it can't SELECT the user's current preferences (RLS blocks it)
-- This should return an error or null result since no account data can be accessed
select cms.update_user_preferences('{"language": "pt", "timezone": "America/Sao_Paulo"}'::jsonb);

select row_eq(
    $$ select preferences from cms.accounts where auth_user_id = (select auth.uid()) $$,
    ROW (NULL::jsonb),
    'User without admin access cannot update preferences - preferences are not updated'
);

-- Restore admin access for remaining tests
SELECT cms_tests.set_admin_access('user_accounttest@test.com', 'true');

-- ===== SECTION 6: EDGE CASES =====

-- Test 19: update_user_preferences with null preferences
SELECT results_eq(
    $$ SELECT (cms.update_user_preferences('{}'::jsonb)->>'success')::boolean $$,
    $$ VALUES (true) $$,
    'update_user_preferences accepts empty preferences object'
);

-- Test 20: update_user_preferences with partial preferences (only timezone)
SELECT results_eq(
    $$ SELECT (cms.update_user_preferences('{"timezone": "Asia/Tokyo"}'::jsonb)->>'success')::boolean $$,
    $$ VALUES (true) $$,
    'update_user_preferences accepts partial preferences (timezone only)'
);

-- Test 21: Verify partial update overwrote entire preferences field
SELECT results_eq(
    $$ SELECT preferences->>'language' IS NULL FROM cms.accounts WHERE id = cms_tests.test_uuid(603) $$,
    $$ VALUES (true) $$,
    'Partial preferences update overwrites entire preferences field (language now null)'
);

-- Test 22: get_current_user_account_id returns null for inactive user
SELECT cms_tests.authenticate_as('inactive_acct');
SELECT cms_tests.set_admin_access('inactive_accounttest@test.com', 'true');

SELECT results_eq(
    $$ SELECT cms.get_current_user_account_id() IS NULL $$,
    $$ VALUES (true) $$,
    'get_current_user_account_id returns null for inactive user'
);

-- ===== SECTION 7: DELETE POLICY TESTS =====

-- Switch back to admin
SELECT cms_tests.authenticate_as('admin_acct');

-- Test 23: can_action_account prevents self-deletion (admin cannot delete own account)
SELECT results_eq(
    $$ SELECT cms.can_action_account(cms_tests.test_uuid(601), 'delete') $$,
    $$ VALUES (false) $$,
    'can_action_account prevents admin self-deletion'
);

-- Test 24: DELETE policy respects can_action_account (admin cannot delete own account)
-- Attempt the delete (this will succeed with 0 rows affected due to RLS)
DELETE FROM cms.accounts WHERE id = cms_tests.test_uuid(601);

-- Verify the admin account still exists (RLS prevented the deletion)
SELECT results_eq(
    $$ SELECT COUNT(*) FROM cms.accounts WHERE id = cms_tests.test_uuid(601) $$,
    $$ VALUES (1::bigint) $$,
    'DELETE policy prevents admin from deleting own account - account still exists'
);

-- Test 25: Admin can delete other accounts (lower rank)
SELECT lives_ok(
    $$ DELETE FROM cms.accounts WHERE id = cms_tests.test_uuid(603) $$,
    'Admin can delete other accounts through can_action_account'
);

-- Clean up test data
DELETE FROM cms.role_permissions WHERE role_id IN (cms_tests.test_uuid(701), cms_tests.test_uuid(702), cms_tests.test_uuid(703));
DELETE FROM cms.account_roles WHERE account_id IN (cms_tests.test_uuid(601), cms_tests.test_uuid(602), cms_tests.test_uuid(603), cms_tests.test_uuid(604));
DELETE FROM cms.accounts WHERE id IN (cms_tests.test_uuid(601), cms_tests.test_uuid(602), cms_tests.test_uuid(603), cms_tests.test_uuid(604));
DELETE FROM cms.roles WHERE id IN (cms_tests.test_uuid(701), cms_tests.test_uuid(702), cms_tests.test_uuid(703));
DELETE FROM cms.permissions WHERE id = cms_tests.test_uuid(801);

-- Reset JWT context
DO $$ BEGIN
    PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

SELECT finish();

ROLLBACK;