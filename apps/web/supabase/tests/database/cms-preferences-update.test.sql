-- Focused test for preferences update functionality
-- Tests the specific issue with timezone/preferences not persisting

BEGIN;

-- PymeKit exige MFA en el CMS por defecto (ADR-014); esa regla se prueba en
-- cms-super-admin-root.test.sql. Aquí se valida la lógica funcional con
-- sesiones sin segundo factor, así que se desactiva el requisito de forma
-- explícita. El ROLLBACK final deshace el cambio.
update cms.configuration set value = 'false' where key = 'requires_mfa';

SELECT plan(8);

-- Clean up any existing test data
DELETE FROM cms.account_roles WHERE account_id IN (
    SELECT id FROM cms.accounts WHERE metadata->>'email' = 'prefs_test@test.com'
);
DELETE FROM cms.accounts WHERE metadata->>'email' = 'prefs_test@test.com';

-- Create test user
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(2001), 'prefs_user', 'prefs_test@test.com');

-- Create test account
INSERT INTO cms.accounts (id, auth_user_id, is_active, metadata, preferences) VALUES
(cms_tests.test_uuid(801), cms_tests.test_uuid(2001), true, '{"email": "prefs_test@test.com"}', '{"language": "en", "timezone": ""}');

-- Set user context
SELECT cms_tests.authenticate_as('prefs_user');
SELECT cms_tests.set_admin_access('prefs_test@test.com', 'true');

-- Test 1: get_current_user_account_id works
SELECT results_eq(
    $$ SELECT cms.get_current_user_account_id() $$,
    $$ VALUES (cms_tests.test_uuid(801)::uuid) $$,
    'get_current_user_account_id returns correct ID'
);

-- Test 2: User can see their own account (SELECT policy)
SELECT results_eq(
    $$ SELECT COUNT(*) FROM cms.accounts WHERE id = cms_tests.test_uuid(801) $$,
    $$ VALUES (1::bigint) $$,
    'User can SELECT their own account'
);

-- Test 3: User can directly UPDATE preferences column (column-level permission)
SELECT lives_ok(
    $$ UPDATE cms.accounts 
       SET preferences = '{"language": "fr", "timezone": "Europe/Paris"}' 
       WHERE id = cms_tests.test_uuid(801) $$,
    'User can directly UPDATE preferences column'
);

-- Test 4: Verify direct UPDATE worked
SELECT results_eq(
    $$ SELECT preferences->'timezone' FROM cms.accounts WHERE id = cms_tests.test_uuid(801) $$,
    $$ VALUES ('"Europe/Paris"'::jsonb) $$,
    'Direct preferences UPDATE persisted in database'
);

-- Test 5: update_user_preferences function returns success
SELECT results_eq(
    $$ SELECT (cms.update_user_preferences('{"language": "es", "timezone": "Europe/Madrid"}'::jsonb)->>'success')::boolean $$,
    $$ VALUES (true) $$,
    'update_user_preferences function returns success'
);

-- Test 6: update_user_preferences actually updated preferences
SELECT results_eq(
    $$ SELECT preferences->'timezone' FROM cms.accounts WHERE id = cms_tests.test_uuid(801) $$,
    $$ VALUES ('"Europe/Madrid"'::jsonb) $$,
    'update_user_preferences function persisted preferences'
);

-- Test 7: Function works with partial preferences
SELECT results_eq(
    $$ SELECT (cms.update_user_preferences('{"timezone": "America/Guatemala"}'::jsonb)->>'success')::boolean $$,
    $$ VALUES (true) $$,
    'update_user_preferences works with partial preferences'
);

-- Test 8: Partial update overwrote entire preferences field
SELECT results_eq(
    $$ SELECT preferences FROM cms.accounts WHERE id = cms_tests.test_uuid(801) $$,
    $$ VALUES ('{"timezone": "America/Guatemala"}'::jsonb) $$,
    'Partial preferences update overwrote entire field (language is now missing)'
);

-- Clean up test data
DELETE FROM cms.accounts WHERE id = cms_tests.test_uuid(801);

-- Reset JWT context
DO $$ BEGIN
    PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

SELECT finish();

ROLLBACK;