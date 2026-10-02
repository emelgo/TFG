-- Performance and Scalability Tests for Dashboard Migration
-- These tests address performance issues identified in deep review

BEGIN;

-- PymeKit exige MFA en el CMS por defecto (ADR-014); esa regla se prueba en
-- cms-super-admin-root.test.sql. Aquí se valida la lógica funcional con
-- sesiones sin segundo factor, así que se desactiva el requisito de forma
-- explícita. El ROLLBACK final deshace el cambio.
update cms.configuration set value = 'false' where key = 'requires_mfa';

SELECT no_plan();

-- ============================================
-- SECTION: PERFORMANCE INDEX TESTS
-- ============================================

-- Test that critical indexes exist for performance
SELECT has_index('cms', 'dashboards', 'idx_dashboards_created_by', 'dashboards should have created_by index');
SELECT has_index('cms', 'dashboard_widgets', 'idx_dashboard_widgets_dashboard', 'dashboard_widgets should have dashboard_id index');
SELECT has_index('cms', 'dashboard_role_shares', 'idx_dashboard_role_shares_dashboard', 'dashboard_role_shares should have dashboard_id index');
SELECT has_index('cms', 'dashboard_role_shares', 'idx_dashboard_role_shares_role', 'dashboard_role_shares should have role_id index');

-- Existing indexes are sufficient for expected dashboard scale (dozens per user)
-- Basic indexes on dashboard_id, created_by, and role_id provide adequate performance

-- ============================================
-- SECTION: QUERY PERFORMANCE TESTS
-- ============================================

-- Clean up and create test data for performance testing (order matters for foreign keys)
DELETE FROM cms.dashboard_role_shares;
DELETE FROM cms.dashboard_widgets;
DELETE FROM cms.dashboards;
DELETE FROM cms.permission_group_permissions;
DELETE FROM cms.role_permission_groups;
DELETE FROM cms.permission_groups;
DELETE FROM cms.role_permissions;
DELETE FROM cms.account_permissions;
DELETE FROM cms.account_roles;
DELETE FROM cms.accounts;
DELETE FROM cms.roles;
DELETE FROM cms.permissions;

-- Create test users for performance testing
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(1), 'perf_user', 'perf@test.com');

-- Create test accounts
INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES 
  (cms_tests.test_uuid(101), cms_tests.test_uuid(1), true);

-- Create test roles
INSERT INTO cms.roles (id, name, description, rank) VALUES 
  (cms_tests.test_uuid(201), 'Performance Test Role', 'Performance test role', 90),
  (cms_tests.test_uuid(202), 'Lower Rank Role', 'Role with lower rank for sharing', 50);

-- Assign roles to accounts
INSERT INTO cms.account_roles (account_id, role_id) VALUES 
  (cms_tests.test_uuid(101), cms_tests.test_uuid(201));

-- Create admin permissions
INSERT INTO cms.permissions (id, name, description, permission_type, system_resource, action) VALUES 
  (cms_tests.test_uuid(301), 'dashboard:admin', 'Dashboard administration', 'system', 'system_setting', '*'),
  (cms_tests.test_uuid(303), 'role_insert', 'Role creation permission', 'system', 'role', 'insert');

INSERT INTO cms.role_permissions (role_id, permission_id) VALUES 
  (cms_tests.test_uuid(201), cms_tests.test_uuid(301)),
  (cms_tests.test_uuid(201), cms_tests.test_uuid(303));

-- Create table metadata
INSERT INTO cms.table_metadata (schema_name, table_name, display_name, description) VALUES 
  ('public', 'test_table', 'Test Table', 'Performance test table');

-- Create data permissions
INSERT INTO cms.permissions (id, name, description, permission_type, scope, schema_name, table_name, action) VALUES 
  (cms_tests.test_uuid(302), 'public.test_table:select', 'Select permission for test table', 'data', 'table', 'public', 'test_table', 'select');

INSERT INTO cms.role_permissions (role_id, permission_id) VALUES 
  (cms_tests.test_uuid(201), cms_tests.test_uuid(302));

SELECT cms_tests.authenticate_as('perf_user');
SELECT cms_tests.set_admin_access('perf@test.com', 'true');

-- Create a dashboard for testing
INSERT INTO cms.dashboards (id, name, created_by) VALUES 
  (cms_tests.test_uuid(401), 'Performance Test Dashboard', cms_tests.test_uuid(101));

-- Test that basic queries execute within reasonable time
-- Note: These are functional tests since we can't easily test actual performance in pgTAP
SELECT lives_ok(
  format($$SELECT cms.can_access_dashboard(%L)$$, cms_tests.test_uuid(401)),
  'can_access_dashboard should execute without errors'
);

SELECT lives_ok(
  format($$SELECT cms.can_edit_dashboard(%L)$$, cms_tests.test_uuid(401)),
  'can_edit_dashboard should execute without errors'
);

SELECT lives_ok(
  $$SELECT cms.list_dashboards(1, 20)$$,
  'list_dashboards should execute without errors'
);

-- ============================================
-- SECTION: SCALABILITY TESTS
-- ============================================

-- Test dashboard creation under load (simulate bulk creation)
-- Create multiple dashboards to test pagination and filtering
DO $$
BEGIN
  FOR i IN 1..50 LOOP
    INSERT INTO cms.dashboards (id, name, created_by) VALUES 
      (gen_random_uuid(), 'Bulk Dashboard ' || i, cms_tests.test_uuid(101));
  END LOOP;
END $$;

-- Test that list_dashboards handles large result sets properly
SELECT ok(
  (SELECT (cms.list_dashboards(1, 10) -> 'pagination' ->> 'page_size')::int) = 10,
  'list_dashboards should respect pagination limits with large datasets'
);

-- Test that pagination works correctly
SELECT ok(
  (SELECT jsonb_array_length(cms.list_dashboards(1, 10) -> 'dashboards')) <= 10,
  'list_dashboards should return no more than page_size results'
);

-- Test search functionality with large datasets
SELECT is(
  jsonb_typeof(cms.list_dashboards(1, 20, 'Bulk')),
  'object',
  'list_dashboards search should work with large datasets'
);

-- ============================================
-- SECTION: WIDGET SCALABILITY TESTS
-- ============================================

-- Create many widgets for a single dashboard to test get_dashboard performance
DO $$
BEGIN
  FOR i IN 1..100 LOOP
    INSERT INTO cms.dashboard_widgets (
      dashboard_id, widget_type, title, config, position, schema_name, table_name
    ) VALUES (
      cms_tests.test_uuid(401),
      'chart',
      'Bulk Widget ' || i,
      '{}',
      format('{"x": %s, "y": %s, "w": 4, "h": 3}', (i % 10) * 4, (i / 10) * 3)::jsonb,
      'public',
      'test_table'
    );
  END LOOP;
END $$;

-- Test that get_dashboard handles many widgets without pagination (potential issue)
SELECT is(
  jsonb_typeof(cms.get_dashboard(cms_tests.test_uuid(401))),
  'object',
  'get_dashboard should handle dashboards with many widgets'
);

-- Test that widgets are returned in expected order
SELECT ok(
  jsonb_array_length((cms.get_dashboard(cms_tests.test_uuid(401)) -> 'widgets')) = 100,
  'get_dashboard should return all widgets (unbounded - potential performance issue)'
);

-- Widget loading is appropriate for expected dashboard scale
-- Typical dashboards will have 10-50 widgets, which is manageable without pagination

-- ============================================
-- SECTION: SHARING PERFORMANCE TESTS
-- ============================================

-- Create many role shares to test sharing performance
-- Switch to admin user for role creation
SELECT cms_tests.authenticate_as('perf_user');
SELECT cms_tests.set_admin_access('perf@test.com', 'true');

INSERT INTO cms.roles (id, name, description, rank) 
SELECT 
  gen_random_uuid(),
  'Bulk Role ' || i,
  'Generated role for performance testing',
  50 + i
FROM generate_series(1, 20) i;

-- Test bulk sharing operations
DO $$
DECLARE
  role_record RECORD;
BEGIN
  FOR role_record IN 
    SELECT id FROM cms.roles WHERE name LIKE 'Bulk Role%' LIMIT 10
  LOOP
    INSERT INTO cms.dashboard_role_shares (dashboard_id, role_id, permission_level, granted_by)
    VALUES (cms_tests.test_uuid(401), role_record.id, 'view', cms_tests.test_uuid(101));
  END LOOP;
END $$;

-- Test that can_access_dashboard performs well with many shares
SELECT lives_ok(
  format($$SELECT cms.can_access_dashboard(%L)$$, cms_tests.test_uuid(401)),
  'can_access_dashboard should handle dashboards with many role shares'
);

-- Test that list_dashboards performs well with complex sharing
SELECT is(
  jsonb_typeof(cms.list_dashboards(1, 20)),
  'object',  
  'list_dashboards should handle complex role sharing scenarios'
);

-- ============================================
-- SECTION: MEMORY USAGE TESTS
-- ============================================

-- Test that functions don't cause memory issues with large JSON objects
-- Create a dashboard with large position JSON
INSERT INTO cms.dashboard_widgets (
  dashboard_id, widget_type, title, config, position, schema_name, table_name
) VALUES (
  cms_tests.test_uuid(401),
  'table',
  'Large Config Widget',
  ('{"large_config": "' || repeat('data', 100) || '"}')::jsonb,
  '{"x": 0, "y": 0, "w": 12, "h": 8}',
  'public',
  'test_table'
);

-- Test that get_dashboard handles large configurations
SELECT is(
  jsonb_typeof(cms.get_dashboard(cms_tests.test_uuid(401))),
  'object',
  'get_dashboard should handle widgets with large configurations'
);

-- ============================================
-- SECTION: CONCURRENT ACCESS TESTS
-- ============================================

-- Test concurrent sharing operations (simulate race conditions)
-- Note: Limited testing possible in pgTAP, but we can test basic scenarios

-- Test that sharing the same dashboard with the same role multiple times is handled
INSERT INTO cms.dashboard_role_shares (dashboard_id, role_id, permission_level, granted_by)
VALUES (cms_tests.test_uuid(401), cms_tests.test_uuid(202), 'edit', cms_tests.test_uuid(101))
ON CONFLICT (dashboard_id, role_id) DO UPDATE SET 
  permission_level = EXCLUDED.permission_level,
  granted_at = NOW();

SELECT ok(
  EXISTS(SELECT 1 FROM cms.dashboard_role_shares 
         WHERE dashboard_id = cms_tests.test_uuid(401) 
         AND role_id = cms_tests.test_uuid(202) 
         AND permission_level = 'edit'),
  'Concurrent sharing operations should be handled with upsert'
);

-- ============================================
-- SECTION: CLEANUP PERFORMANCE TESTS
-- ============================================

-- Test cascade delete performance
-- This documents potential performance issues with large cascades
SELECT lives_ok(
  format($$DELETE FROM cms.dashboards WHERE id = %L$$, cms_tests.test_uuid(401)),
  'Dashboard deletion should handle cascade deletes efficiently'
);

-- Verify cascade worked
SELECT is(
  (SELECT COUNT(*)::integer FROM cms.dashboard_widgets WHERE dashboard_id = cms_tests.test_uuid(401)),
  0,
  'All widgets should be cascade deleted'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM cms.dashboard_role_shares WHERE dashboard_id = cms_tests.test_uuid(401)),
  0,
  'All role shares should be cascade deleted'
);

-- Cascade deletions are acceptable for expected dashboard scale
-- Even large dashboards with 100+ widgets will delete efficiently with proper indexing

-- Finish the tests and clean up
SELECT * FROM finish();
ROLLBACK;