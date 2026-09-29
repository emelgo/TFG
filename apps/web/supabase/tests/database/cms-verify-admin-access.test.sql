-- Test file: verify_admin_access.test.sql
-- Tests cms.verify_admin_access function through actual operations
-- This tests the foundational security function used throughout the system

BEGIN;

-- PymeKit exige MFA en el CMS por defecto (ADR-014); esa regla se prueba en
-- cms-super-admin-root.test.sql. Aquí se valida la lógica funcional con
-- sesiones sin segundo factor, así que se desactiva el requisito de forma
-- explícita. El ROLLBACK final deshace el cambio.
update cms.configuration set value = 'false' where key = 'requires_mfa';

SELECT no_plan();

-- Clean up any existing test data
DELETE FROM cms.configuration;
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
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(1), 'admin_user', 'admin@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(2), 'non_admin_user', 'user@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(3), 'mfa_user', 'mfa@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(4), 'config_test_user', 'config@test.com');

-- Create accounts
INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES
                                                                (cms_tests.test_uuid(101), cms_tests.test_uuid(1), true),  -- Admin User account
                                                                (cms_tests.test_uuid(102), cms_tests.test_uuid(2), true),  -- Non-Admin User account
                                                                (cms_tests.test_uuid(103), cms_tests.test_uuid(3), true),  -- MFA User account
                                                                (cms_tests.test_uuid(104), cms_tests.test_uuid(4), true);  -- Config Test User account

-- Create a basic role for testing
INSERT INTO cms.roles (id, name, rank, description) VALUES
    (cms_tests.test_uuid(201), 'Test Role', 50, 'Basic test role');

-- Create a basic permission for testing
INSERT INTO cms.permissions (id, name, permission_type, system_resource, action) VALUES
    (cms_tests.test_uuid(301), 'role_select', 'system', 'role', 'select');

-- Assign role to admin user
INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(201));

-- Grant permission to role
INSERT INTO cms.role_permissions (role_id, permission_id) VALUES
    (cms_tests.test_uuid(201), cms_tests.test_uuid(301));

-- Test 1: User without admin access cannot access admin functions
SELECT cms_tests.authenticate_as('non_admin_user');
SELECT cms_tests.set_admin_access('user@test.com', 'false');

-- Try to view roles (requires admin access)
SELECT is_empty(
               $$ SELECT * FROM cms.roles $$,
               'User without admin access cannot view roles'
       );

-- Direct function call should return false
SELECT is(
               (SELECT cms.verify_admin_access()),
               false,
               'verify_admin_access returns false for user without admin access'
       );

-- Test 2: User with admin access but no MFA requirement can access admin functions
SELECT cms_tests.authenticate_as('admin_user');
SELECT cms_tests.set_admin_access('admin@test.com', 'true');

-- Set configuration to not require MFA
set role postgres;
INSERT INTO cms.configuration (key, value) VALUES ('requires_mfa', 'false')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

SELECT cms_tests.authenticate_as('admin_user');

-- Should be able to access admin functions
SELECT isnt_empty(
               $$ SELECT * FROM cms.roles $$,
               'User with admin access can view roles when MFA not required'
       );

-- Direct function call should return true
SELECT is(
               (SELECT cms.verify_admin_access()),
               true,
               'verify_admin_access returns true for admin user when MFA not required'
       );

-- Test 3: Admin user without aal2 cannot access when MFA is required
set role postgres;
INSERT INTO cms.configuration (key, value) VALUES ('requires_mfa', 'true')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- User has admin access but no aal2
SELECT cms_tests.authenticate_as('admin_user');

SELECT is_empty(
               $$ SELECT * FROM cms.accounts $$,
               'Admin user without aal2 cannot view accounts when MFA required'
       );

-- Direct function call should return false
SELECT is(
               (SELECT cms.verify_admin_access()),
               false,
               'verify_admin_access returns false for admin user without aal2 when MFA required'
       );

-- Test 4: Admin user with aal2 can access when MFA is required
SELECT cms_tests.set_session_aal('aal2');

SELECT isnt_empty(
               $$ SELECT * FROM cms.roles $$,
               'Admin user with aal2 can view roles when MFA required'
       );

-- Direct function call should return true
SELECT is(
               (SELECT cms.verify_admin_access()),
               true,
               'verify_admin_access returns true for admin user with aal2 when MFA required'
       );

-- Test 5: si falta la opción requires_mfa, PymeKit la trata como «obligatorio»
-- (ADR-014, fallo en cerrado). El código heredado la trataba como opcional.
set role postgres;
DELETE FROM cms.configuration WHERE key = 'requires_mfa';

-- Sin aal2 no se debe poder entrar
select cms_tests.authenticate_as('admin_user');
SELECT cms_tests.set_session_aal('aal1');

SELECT is_empty(
               $$ SELECT * FROM cms.roles $$,
               'Sin aal2 y sin la opción requires_mfa, el admin no ve roles (MFA obligatorio por defecto)'
       );

SELECT is(
               (SELECT cms.verify_admin_access()),
               false,
               'verify_admin_access devuelve false sin la opción requires_mfa y sin aal2'
       );

-- With aal2, should succeed
SELECT cms_tests.set_session_aal('aal2');

SELECT isnt_empty(
               $$ SELECT * FROM cms.roles $$,
               'Admin user with aal2 can access when MFA config missing'
       );

-- Direct function call should return true
SELECT is(
               (SELECT cms.verify_admin_access()),
               true,
               'verify_admin_access returns true when MFA config missing but has aal2'
       );

-- Test 6: Invalid MFA configuration value defaults to requiring MFA
set role postgres;
INSERT INTO cms.configuration (key, value) VALUES ('requires_mfa', 'invalid_value')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Should default to requiring MFA, so without aal2 should fail
SELECT cms_tests.authenticate_as('admin_user');
SELECT cms_tests.set_session_aal('aal1');

SELECT is_empty(
               $$ SELECT * FROM cms.roles $$,
               'Invalid MFA config defaults to requiring MFA (access denied without aal2)'
       );

-- Direct function call should return false
SELECT is(
               (SELECT cms.verify_admin_access()),
               false,
               'verify_admin_access returns false with invalid MFA config and no aal2'
       );

-- With aal2, should succeed
SELECT cms_tests.set_session_aal('aal2');

SELECT isnt_empty(
               $$ SELECT * FROM cms.roles $$,
               'Invalid MFA config allows access with aal2'
       );

-- Direct function call should return true
SELECT is(
               (SELECT cms.verify_admin_access()),
               true,
               'verify_admin_access returns true with invalid MFA config but has aal2'
       );

-- Test 7: Function works correctly across different admin-protected resources
-- Reset to not require MFA for simpler testing
set role postgres;
INSERT INTO cms.configuration (key, value) VALUES ('requires_mfa', 'false')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Authenticate as admin user
SELECT cms_tests.authenticate_as('admin_user');
SELECT cms_tests.set_session_aal('aal1');

-- Test access to various admin-protected resources
SELECT isnt_empty(
               $$ SELECT * FROM cms.permissions $$,
               'Admin user can view permissions'
       );

SELECT isnt_empty(
               $$ SELECT * FROM cms.accounts $$,
               'Admin user can view accounts'
       );

-- Test with non-admin user
SELECT cms_tests.authenticate_as('non_admin_user');
SELECT cms_tests.set_admin_access('user@test.com', 'false');

SELECT is_empty(
               $$ SELECT * FROM cms.permissions $$,
               'Non-admin user cannot view permissions'
       );

SELECT is_empty(
               $$ SELECT * FROM cms.accounts $$,
               'Non-admin user cannot view accounts'
       );

-- Test 8: Function correctly handles edge cases with aal levels
SELECT cms_tests.authenticate_as('mfa_user');
SELECT cms_tests.set_admin_access('mfa@test.com', 'true');

-- Test with missing aal (should be treated as aal1)
SET ROLE postgres;
-- Simulate missing aal by setting it to null/empty
SELECT set_config('request.jwt.claims', json_build_object(
        'sub', cms_tests.test_uuid(3),
        'email', 'mfa@test.com',
        'app_metadata', json_build_object('cms_access', 'true')
                                        )::text, true);


INSERT INTO cms.configuration (key, value) VALUES ('requires_mfa', 'true')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Should fail without aal2
SELECT cms_tests.authenticate_as('mfa_user');

SELECT is(
               (SELECT cms.verify_admin_access()),
               false,
               'verify_admin_access returns false with missing aal when MFA required'
       );

-- Test 9: Function works with case variations in configuration
set role postgres;
INSERT INTO cms.configuration (key, value) VALUES ('requires_mfa', 'true')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Should still require MFA (case sensitive)
SELECT cms_tests.authenticate_as('admin_user');
SELECT is(
               (SELECT cms.verify_admin_access()),
               false,
               'verify_admin_access treats "TRUE" as invalid (case sensitive)'
       );

set role postgres;

-- Test correct case
INSERT INTO cms.configuration (key, value) VALUES ('requires_mfa', 'false')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

SELECT is(
               (SELECT cms.verify_admin_access()),
               true,
               'verify_admin_access works with correct case "false"'
       );

-- Test 11: Function state doesn't leak between users
SELECT cms_tests.authenticate_as('admin_user');
SELECT cms_tests.set_admin_access('admin@test.com', 'true');

set role postgres;
INSERT INTO cms.configuration (key, value) VALUES ('requires_mfa', 'false')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

select cms_tests.authenticate_as('admin_user');
SELECT cms_tests.set_session_aal('aal1');
-- Admin user should have access
SELECT is(
               (SELECT cms.verify_admin_access()),
               true,
               'Admin user has access'
       );

-- Switch to non-admin user
SELECT cms_tests.authenticate_as('non_admin_user');
SELECT cms_tests.set_admin_access('user@test.com', 'false');

SELECT is(
               (SELECT cms.verify_admin_access()),
               false,
               'Non-admin user state is independent of previous admin user'
       );

-- Switch back to admin user
SELECT cms_tests.authenticate_as('admin_user');

SELECT is(
               (SELECT cms.verify_admin_access()),
               true,
               'Admin user still has access after switching users'
       );

-- Test 12: Configuration changes take effect immediately
set role postgres;
INSERT INTO cms.configuration (key, value) VALUES ('requires_mfa', 'false')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Authenticate as admin user
SELECT cms_tests.authenticate_as('admin_user');
SELECT cms_tests.set_session_aal('aal1');

SELECT is(
               (SELECT cms.verify_admin_access()),
               true,
               'Admin user has access when MFA not required'
       );

-- Change configuration to require MFA
set role postgres;
INSERT INTO cms.configuration (key, value) VALUES ('requires_mfa', 'true')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;


-- Admin user should lose access immediately
SELECT cms_tests.authenticate_as('admin_user');
SELECT is(
               (SELECT cms.verify_admin_access()),
               false,
               'Admin user loses access immediately when MFA requirement changes'
       );

-- Test 13: Empty string configuration values are treated as invalid
set role postgres;
INSERT INTO cms.configuration (key, value) VALUES ('requires_mfa', '')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Test with aal1
SELECT cms_tests.authenticate_as('admin_user');
SELECT cms_tests.set_session_aal('aal1');

SELECT is(
               (SELECT cms.verify_admin_access()),
               false,
               'Empty string MFA config defaults to requiring MFA'
       );

-- Test with aal2
SELECT cms_tests.set_session_aal('aal2');

SELECT is(
               (SELECT cms.verify_admin_access()),
               true,
               'Empty string MFA config allows access with aal2'
       );

-- Test 14: Whitespace-only configuration values are treated as invalid
set role postgres;
INSERT INTO cms.configuration (key, value) VALUES ('requires_mfa', '   ')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Test with aal1
SELECT cms_tests.authenticate_as('admin_user');
SELECT cms_tests.set_session_aal('aal1');

SELECT is(
               (SELECT cms.verify_admin_access()),
               false,
               'Whitespace-only MFA config defaults to requiring MFA'
       );

SELECT finish();

ROLLBACK;