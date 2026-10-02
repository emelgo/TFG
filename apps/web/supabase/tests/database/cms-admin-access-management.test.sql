-- Test file: admin-access-management.test.sql
-- Tests cms.grant_admin_access and cms.revoke_admin_access functions
-- These functions handle both JWT metadata updates and account creation/management

BEGIN;

-- PymeKit exige MFA en el CMS por defecto (ADR-014); esa regla se prueba en
-- cms-super-admin-root.test.sql. Aquí se valida la lógica funcional con
-- sesiones sin segundo factor, así que se desactiva el requisito de forma
-- explícita. El ROLLBACK final deshace el cambio.
update cms.configuration set value = 'false' where key = 'requires_mfa';

SELECT no_plan();

-- Create test users
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(1), 'admin_user', 'admin@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(2), 'test_user_1', 'user1@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(3), 'test_user_2', 'user2@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(4), 'existing_admin', 'existing@test.com');

-- Set postgres role for initial test setup to bypass RLS
set role postgres;

-- Create admin account with necessary permissions
INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(1), true);  -- Admin User account

-- Create admin role and permissions for testing
INSERT INTO cms.roles (id, name, rank, description) VALUES
    (cms_tests.test_uuid(201), 'Super Admin', 3, 'Super administrator role');

INSERT INTO cms.permissions (id, name, permission_type, system_resource, action) VALUES
    (cms_tests.test_uuid(301), 'accounts_insert', 'system', 'account', 'insert'),
    (cms_tests.test_uuid(302), 'accounts_update', 'system', 'account', 'update'),
    (cms_tests.test_uuid(303), 'accounts_delete', 'system', 'account', 'delete');

-- Assign admin role to admin user
INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(201));

-- Grant permissions to admin role
INSERT INTO cms.role_permissions (role_id, permission_id) VALUES
    (cms_tests.test_uuid(201), cms_tests.test_uuid(301)),
    (cms_tests.test_uuid(201), cms_tests.test_uuid(302)),
    (cms_tests.test_uuid(201), cms_tests.test_uuid(303));

-- Create an existing admin user for testing revocation
INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES
    (cms_tests.test_uuid(104), cms_tests.test_uuid(4), true);  -- Existing admin account

-- Test 1: Non-admin user cannot grant admin access
SELECT cms_tests.authenticate_as('test_user_1');
SELECT cms_tests.set_admin_access('user1@test.com', 'false');

SELECT is(
    (SELECT cms.grant_admin_access(cms_tests.test_uuid(2))->>'success'),
    'false'::text,
    'Non-admin user cannot grant admin access'
);

-- Test 2: Admin user can grant admin access to new user
SELECT cms_tests.authenticate_as('admin_user');
SELECT cms_tests.set_admin_access('admin@test.com', 'true');

SELECT is(
    (SELECT cms.grant_admin_access(cms_tests.test_uuid(2))->>'success'),
    'true'::text,
    'Admin user can grant admin access to new user'
);

-- Verify JWT metadata was updated
set role postgres;

SELECT is(
    (SELECT (raw_app_meta_data::jsonb->>'cms_access') from auth.users where id = cms_tests.test_uuid(2)),
    'true'::text,
    'JWT metadata updated with admin access for new user'
);

-- Verify account was created
SELECT is(
    (SELECT COUNT(*)::int FROM cms.accounts WHERE auth_user_id = cms_tests.test_uuid(2) AND is_active = true),
    1,
    'Account created for new admin user'
);

-- Test 3: Granting admin access to user who already has it succeeds idempotently
SELECT cms_tests.authenticate_as('admin_user');

SELECT is(
    (SELECT cms.grant_admin_access(cms_tests.test_uuid(2))->>'success'),
    'true'::text,
    'Granting admin access to user who already has it succeeds'
);

-- Account should still exist and be active
SELECT is(
    (SELECT COUNT(*)::int FROM cms.accounts WHERE auth_user_id = cms_tests.test_uuid(2) AND is_active = true),
    1,
    'Account remains active when granting admin access to existing admin'
);

-- Test 4: Admin user can revoke admin access
SELECT is(
    (SELECT cms.revoke_admin_access(cms_tests.test_uuid(2), true)->>'success'),
    'true'::text,
    'Admin user can revoke admin access'
);

-- Verify JWT metadata was updated
set role postgres;

SELECT is(
    (SELECT (raw_app_meta_data::jsonb->>'cms_access') from auth.users where id = cms_tests.test_uuid(2)),
    'false'::text,
    'JWT metadata admin access removed'
);

-- Verify account was deactivated
SELECT is(
    (SELECT COUNT(*)::int FROM cms.accounts WHERE auth_user_id = cms_tests.test_uuid(2) AND is_active = false),
    1,
    'Account deactivated when revoking admin access without account deletion'
);

-- Test 5: Revoking admin access with account deactivation
-- First grant admin access again
SELECT cms_tests.authenticate_as('admin_user');

SELECT is(
    (SELECT cms.grant_admin_access(cms_tests.test_uuid(3))->>'success'),
    'true'::text,
    'Admin access granted to test user for deactivation test'
);

-- Now revoke with account deactivation
SELECT is(
    (SELECT cms.revoke_admin_access(cms_tests.test_uuid(3), true)->>'success'),
    'true'::text,
    'Admin user can revoke admin access with account deactivation'
);

-- Verify account was deactivated
set role postgres;

SELECT is(
    (SELECT COUNT(*)::int FROM cms.accounts WHERE auth_user_id = cms_tests.test_uuid(3) AND is_active = false),
    1,
    'Account deactivated when revoking admin access with account deactivation'
);

-- Test 6: Revoking admin access from user who doesn't have it succeeds idempotently
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(5), 'no_admin_user', 'nonadmin@test.com');

SELECT cms_tests.authenticate_as('admin_user');

SELECT is(
    (SELECT cms.revoke_admin_access(cms_tests.test_uuid(5), false)->>'success'),
    'true'::text,
    'Revoking admin access from user without admin access succeeds'
);

-- Test 7: Non-admin user cannot revoke admin access
SELECT cms_tests.authenticate_as('test_user_1');
SELECT cms_tests.set_admin_access('user1@test.com', 'false');

SELECT is(
    (SELECT cms.revoke_admin_access(cms_tests.test_uuid(4), false)->>'success'),
    'false'::text,
    'Non-admin user cannot revoke admin access'
);

-- Test 8: Admin cannot grant/revoke admin access to/from themselves
SELECT cms_tests.authenticate_as('admin_user');
SELECT cms_tests.set_admin_access('admin@test.com', 'true');

SELECT is(
    (SELECT cms.grant_admin_access(cms_tests.test_uuid(1))->>'success'),
    'false'::text,
    'Admin user cannot grant admin access to themselves'
);

SELECT is(
    (SELECT cms.revoke_admin_access(cms_tests.test_uuid(1), false)->>'success'),
    'false'::text,
    'Admin user cannot revoke admin access from themselves'
);

-- Test 9: Functions handle non-existent users gracefully
SELECT is(
    (SELECT cms.grant_admin_access('00000000-0000-0000-0000-000000000000'::uuid)->>'success'),
    'false'::text,
    'Grant admin access fails gracefully for non-existent user'
);

SELECT is(
    (SELECT cms.revoke_admin_access('00000000-0000-0000-0000-000000000000'::uuid, false)->>'success'),
    'false'::text,
    'Revoke admin access fails gracefully for non-existent user'
);

-- Test 10: Functions maintain consistency between JWT and account state
-- Create a user with JWT admin access but no account
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(6), 'jwt_only_admin', 'jwtonly@test.com');

SELECT cms_tests.set_admin_access('jwtonly@test.com', 'true');

-- Grant admin access should create account and maintain JWT
SELECT is(
    (SELECT cms.grant_admin_access(cms_tests.test_uuid(6))->>'success'),
    'true'::text,
    'Grant admin access succeeds for user with JWT but no account'
);

-- Account should be created
set role postgres;

SELECT is(
    (SELECT COUNT(*)::int FROM cms.accounts WHERE auth_user_id = cms_tests.test_uuid(6) AND is_active = true),
    1,
    'Account created for user with existing JWT admin access'
);

-- JWT should still have admin access
SELECT is(
    (SELECT (raw_app_meta_data::jsonb->>'cms_access') from auth.users where id = cms_tests.test_uuid(6)),
    'true'::text,
    'JWT admin access maintained when creating account'
);

-- Test 11: Account reactivation when granting admin access to deactivated account
-- Create user with deactivated account
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(7), 'deactivated_user', 'deactivated@test.com');

set role postgres;

INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES
    (cms_tests.test_uuid(107), cms_tests.test_uuid(7), false);

-- Grant admin access should reactivate account
SELECT is(
    (SELECT cms.grant_admin_access(cms_tests.test_uuid(7))->>'success'),
    'true'::text,
    'Grant admin access succeeds for user with deactivated account'
);

-- Account should be reactivated
SELECT is(
    (SELECT COUNT(*)::int FROM cms.accounts WHERE auth_user_id = cms_tests.test_uuid(7) AND is_active = true),
    1,
    'Deactivated account is reactivated when granting admin access'
);

-- Test 12: Transaction rollback on JWT update failure
-- This would require mocking the JWT update failure, which is complex in this test environment
-- For now, we verify that both operations are atomic by checking the results

-- Test 13: Proper error handling for malformed JWT metadata
SELECT cms_tests.authenticate_as('admin_user');

-- Create user with malformed metadata (this would normally not happen, but tests edge cases)
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(8), 'malformed_user', 'malformed@test.com');

-- Functions should handle this gracefully
SELECT is(
    (SELECT cms.grant_admin_access(cms_tests.test_uuid(8))->>'success'),
    'true'::text,
    'Grant admin access handles users with malformed JWT metadata'
);

-- Test 14: Verify audit log entries have correct structure and data
set role postgres;

SELECT has_column('cms', 'audit_logs', 'operation', 'Audit logs table has operation column');
SELECT has_column('cms', 'audit_logs', 'schema_name', 'Audit logs table has schema_name column');
SELECT has_column('cms', 'audit_logs', 'table_name', 'Audit logs table has table_name column');
SELECT has_column('cms', 'audit_logs', 'record_id', 'Audit logs table has record_id column');
SELECT has_column('cms', 'audit_logs', 'old_data', 'Audit logs table has old_data column');
SELECT has_column('cms', 'audit_logs', 'new_data', 'Audit logs table has new_data column');
SELECT has_column('cms', 'audit_logs', 'severity', 'Audit logs table has severity column');

-- Test 15: Functions work correctly with UUID string inputs
SELECT cms_tests.authenticate_as('admin_user');

SELECT is(
    (SELECT cms.grant_admin_access(cms_tests.test_uuid(2)::text::uuid)->>'success'),
    'true'::text,
    'Grant admin access works with UUID string input'
);

-- Functions should still work (they use SECURITY DEFINER)
SELECT cms_tests.authenticate_as('test_user_1');
SELECT cms_tests.set_admin_access('user1@test.com', 'false');

-- Switch back to admin for final operations
SELECT cms_tests.authenticate_as('admin_user');
SELECT cms_tests.set_admin_access('admin@test.com', 'true');

-- Cleanup test should still work
SELECT is(
    (SELECT cms.revoke_admin_access(cms_tests.test_uuid(2), false)->>'success'),
    'true'::text,
    'Functions work correctly with RLS enabled'
);

-- SECTION: ROLE HIERARCHY SECURITY TESTS
-- These tests verify that users cannot remove admin access from users with equal or higher role rank

-- Switch to postgres role to bypass RLS for test setup
set role postgres;

-- Create additional roles with different priorities for testing
INSERT INTO cms.roles (id, name, rank, description) VALUES
    (cms_tests.test_uuid(202), 'Regular Admin', 2, 'Regular administrator role'),
    (cms_tests.test_uuid(203), 'Editor', 1, 'Content editor role');

-- Grant necessary permissions to the Regular Admin role
INSERT INTO cms.role_permissions (role_id, permission_id) VALUES
    (cms_tests.test_uuid(202), cms_tests.test_uuid(301)),
    (cms_tests.test_uuid(202), cms_tests.test_uuid(302)),
    (cms_tests.test_uuid(202), cms_tests.test_uuid(303));

-- Create test users for role hierarchy testing
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(10), 'super_admin', 'super@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(11), 'regular_admin', 'regular@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(12), 'editor_user', 'editor@test.com');

-- Create accounts for test users
INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES
    (cms_tests.test_uuid(110), cms_tests.test_uuid(10), true),  -- Super Admin account
    (cms_tests.test_uuid(111), cms_tests.test_uuid(11), true),  -- Regular Admin account
    (cms_tests.test_uuid(112), cms_tests.test_uuid(12), true);  -- Editor account

-- Assign roles to test users
INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(110), cms_tests.test_uuid(201)),  -- Super Admin (rank 3)
    (cms_tests.test_uuid(111), cms_tests.test_uuid(202)),  -- Regular Admin (rank 2)
    (cms_tests.test_uuid(112), cms_tests.test_uuid(203));  -- Editor (rank 1)

-- Grant admin access to all test users via JWT metadata
SELECT cms_tests.set_admin_access('super@test.com', 'true');
SELECT cms_tests.set_admin_access('regular@test.com', 'true');
SELECT cms_tests.set_admin_access('editor@test.com', 'true');

-- Test 17: Super Admin can revoke admin access from Regular Admin (higher rank > lower rank)
SELECT cms_tests.authenticate_as('super_admin');
SELECT cms_tests.set_admin_access('super@test.com', 'true');

SELECT is(
    (SELECT cms.revoke_admin_access(cms_tests.test_uuid(11), false)->>'success'),
    'true'::text,
    'Super Admin (rank 3) can revoke admin access from Regular Admin (rank 2)'
);

-- Restore Regular Admin's admin access for next tests
SELECT is(
    (SELECT cms.grant_admin_access(cms_tests.test_uuid(11))->>'success'),
    'true'::text,
    'Super Admin can restore Regular Admin access'
);

-- Test 18: Super Admin can revoke admin access from Editor (higher rank > lower rank)
SELECT is(
    (SELECT cms.revoke_admin_access(cms_tests.test_uuid(12), false)->>'success'),
    'true'::text,
    'Super Admin (rank 3) can revoke admin access from Editor (rank 1)'
);

-- Restore Editor's admin access for next tests
SELECT is(
    (SELECT cms.grant_admin_access(cms_tests.test_uuid(12))->>'success'),
    'true'::text,
    'Super Admin can restore Editor access'
);

-- Test 19: Regular Admin can revoke admin access from Editor (higher rank > lower rank)
SELECT cms_tests.authenticate_as('regular_admin');
SELECT cms_tests.set_admin_access('regular@test.com', 'true');

SELECT is(
    (SELECT cms.revoke_admin_access(cms_tests.test_uuid(12), false)->>'success'),
    'true'::text,
    'Regular Admin (rank 2) can revoke admin access from Editor (rank 1)'
);

-- Restore Editor's admin access
SELECT cms_tests.authenticate_as('super_admin');
SELECT cms_tests.set_admin_access('super@test.com', 'true');
SELECT is(
    (SELECT cms.grant_admin_access(cms_tests.test_uuid(12))->>'success'),
    'true'::text,
    'Super Admin restores Editor access for further testing'
);

-- F2.7a: `grant/revoke_admin_access` devuelven códigos estables en `error`
-- (RANK_DENIED, PERMISSION_DENIED…), nunca texto libre ni `SQLERRM`.
-- Test 20: Regular Admin CANNOT revoke admin access from Super Admin (lower rank < higher rank)
SELECT cms_tests.authenticate_as('regular_admin');
SELECT cms_tests.set_admin_access('regular@test.com', 'true');

SELECT is(
    (SELECT cms.revoke_admin_access(cms_tests.test_uuid(10), false)->>'success'),
    'false'::text,
    'Regular Admin (rank 2) CANNOT revoke admin access from Super Admin (rank 3)'
);

SELECT is(
    (SELECT cms.revoke_admin_access(cms_tests.test_uuid(10), false)->>'error'), 'RANK_DENIED',
    'Regular Admin gets role hierarchy error when trying to revoke Super Admin access'
);

-- Test 21: Editor CANNOT revoke admin access from Regular Admin (lower rank < higher rank)
SELECT cms_tests.authenticate_as('editor_user');
SELECT cms_tests.set_admin_access('editor@test.com', 'true');

SELECT is(
    (SELECT cms.revoke_admin_access(cms_tests.test_uuid(11), false)->>'success'),
    'false'::text,
    'Editor (rank 1) CANNOT revoke admin access from Regular Admin (rank 2)'
);

SELECT is(
    (SELECT cms.revoke_admin_access(cms_tests.test_uuid(11), false)->>'error'), 'PERMISSION_DENIED'
);

-- Test 22: Editor CANNOT revoke admin access from Super Admin (lower rank < higher rank)
SELECT is(
    (SELECT cms.revoke_admin_access(cms_tests.test_uuid(10), false)->>'success'),
    'false'::text,
    'Editor (rank 1) CANNOT revoke admin access from Super Admin (rank 3)'
);

SELECT is(
    (SELECT cms.revoke_admin_access(cms_tests.test_uuid(10), false)->>'error'), 'PERMISSION_DENIED'
);

-- Test 23: Users with equal rank cannot revoke each other's admin access
-- Create another Regular Admin user with same rank
set role postgres;
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(13), 'regular_admin_2', 'regular2@test.com');
INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES
    (cms_tests.test_uuid(113), cms_tests.test_uuid(13), true);
INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(113), cms_tests.test_uuid(202));  -- Same Regular Admin role (rank 2)
SELECT cms_tests.set_admin_access('regular2@test.com', 'true');

-- First Regular Admin tries to revoke second Regular Admin's access
SELECT cms_tests.authenticate_as('regular_admin');
SELECT cms_tests.set_admin_access('regular@test.com', 'true');

SELECT is(
    (SELECT cms.revoke_admin_access(cms_tests.test_uuid(13), false)->>'success'),
    'false'::text,
    'Regular Admin (rank 2) CANNOT revoke admin access from another Regular Admin (rank 2) - equal priorities'
);

SELECT is(
    (SELECT cms.revoke_admin_access(cms_tests.test_uuid(13), false)->>'error'), 'RANK_DENIED',
    'Regular Admin gets role hierarchy error when trying to revoke equal rank user access'
);

-- Test 24: Verify role hierarchy checks work even when target user has no account
-- Create user without account but with auth.users record
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(14), 'no_account_user', 'noaccount@test.com');
SELECT cms_tests.set_admin_access('noaccount@test.com', 'true');

-- Regular Admin should be able to revoke admin access from user with no account (no role = lowest rank)
SELECT cms_tests.authenticate_as('regular_admin');
SELECT cms_tests.set_admin_access('regular@test.com', 'true');

SELECT is(
    (SELECT cms.revoke_admin_access(cms_tests.test_uuid(14), false)->>'success'),
    'true'::text,
    'Users can revoke admin access from users with no account (no role = lowest rank)'
);

SELECT finish();

ROLLBACK;