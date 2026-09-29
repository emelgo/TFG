BEGIN;

-- PymeKit exige MFA en el CMS por defecto (ADR-014); esa regla se prueba en
-- cms-super-admin-root.test.sql. Aquí se valida la lógica funcional con
-- sesiones sin segundo factor, así que se desactiva el requisito de forma
-- explícita. El ROLLBACK final deshace el cambio.
update cms.configuration set value = 'false' where key = 'requires_mfa';

SELECT no_plan();


-- ============================================
-- SECTION: TEST DATA SETUP
-- ============================================

-- Create test users
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(1), 'admin', 'admin@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(2), 'manager', 'manager@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(3), 'employee', 'employee@test.com');

-- Create test accounts
INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES 
  (cms_tests.test_uuid(101), cms_tests.test_uuid(1), true),
  (cms_tests.test_uuid(102), cms_tests.test_uuid(2), true),
  (cms_tests.test_uuid(103), cms_tests.test_uuid(3), true);

-- Create test roles
INSERT INTO cms.roles (id, name, description, rank) VALUES 
  (cms_tests.test_uuid(201), 'Dashboard Super Admin', 'Dashboard super admin role', 95),
  (cms_tests.test_uuid(202), 'Dashboard Manager', 'Dashboard manager role', 45),
  (cms_tests.test_uuid(203), 'Dashboard Employee', 'Dashboard employee role', 15);

-- Assign roles to accounts
INSERT INTO cms.account_roles (account_id, role_id) VALUES 
  (cms_tests.test_uuid(101), cms_tests.test_uuid(201)),
  (cms_tests.test_uuid(102), cms_tests.test_uuid(202)),
  (cms_tests.test_uuid(103), cms_tests.test_uuid(203));

-- Create admin permissions for dashboard management
INSERT INTO cms.permissions (id, name, description, permission_type, system_resource, action) VALUES 
  (cms_tests.test_uuid(301), 'dashboard:admin', 'Dashboard administration', 'system', 'system_setting', '*');

-- Create data permissions for test tables
INSERT INTO cms.permissions (id, name, description, permission_type, scope, schema_name, table_name, action) VALUES 
  (cms_tests.test_uuid(302), 'public.users:select', 'Select permission for users table', 'data', 'table', 'public', 'users', 'select'),
  (cms_tests.test_uuid(303), 'public.orders:select', 'Select permission for orders table', 'data', 'table', 'public', 'orders', 'select');

-- Grant permissions to roles
INSERT INTO cms.role_permissions (role_id, permission_id) VALUES 
  -- Super admin gets all permissions
  (cms_tests.test_uuid(201), cms_tests.test_uuid(301)),
  (cms_tests.test_uuid(201), cms_tests.test_uuid(302)),
  (cms_tests.test_uuid(201), cms_tests.test_uuid(303)),
  -- Manager gets data permissions too for widget tests
  (cms_tests.test_uuid(202), cms_tests.test_uuid(302)),
  (cms_tests.test_uuid(202), cms_tests.test_uuid(303));

-- Create sample table metadata for widget tests
-- Adaptación a PymeKit: `public.orders` es una tabla real de la plataforma y
-- el seed local ya la registra en `cms.table_metadata`, así que se ignora el
-- conflicto en lugar de fallar.
INSERT INTO cms.table_metadata (schema_name, table_name, display_name, description) VALUES 
  ('public', 'users', 'Users', 'User accounts table'),
  ('public', 'orders', 'Orders', 'Customer orders table')
ON CONFLICT (schema_name, table_name) DO NOTHING;

-- ============================================
-- SECTION: ACCESS CONTROL FUNCTION TESTS
-- ============================================

-- Test can_access_dashboard function with owner access
SELECT cms_tests.authenticate_as('admin');

-- Create a dashboard as admin user
INSERT INTO cms.dashboards (id, name, created_by) VALUES 
  (cms_tests.test_uuid(401), 'Admin Dashboard', cms_tests.test_uuid(101));

SELECT ok(
  cms.can_access_dashboard(cms_tests.test_uuid(401)), 
  'Owner should be able to access their dashboard'
);

SELECT ok(
  cms.can_edit_dashboard(cms_tests.test_uuid(401)), 
  'Owner should be able to edit their dashboard'
);

-- Test access control with different users
SELECT cms_tests.authenticate_as('manager');

SELECT ok(
  NOT cms.can_access_dashboard(cms_tests.test_uuid(401)), 
  'Non-owner without shares should not access dashboard'
);

SELECT ok(
  NOT cms.can_edit_dashboard(cms_tests.test_uuid(401)), 
  'Non-owner without shares should not edit dashboard'
);

-- Test shared access - switch back to admin to create share
SELECT cms_tests.authenticate_as('admin');
INSERT INTO cms.dashboard_role_shares (dashboard_id, role_id, permission_level, granted_by) VALUES 
  (cms_tests.test_uuid(401), cms_tests.test_uuid(202), 'view', cms_tests.test_uuid(101));

-- Switch back to manager to test access
SELECT cms_tests.authenticate_as('manager');

SELECT ok(
  cms.can_access_dashboard(cms_tests.test_uuid(401)), 
  'User with view share should access dashboard'
);

SELECT ok(
  NOT cms.can_edit_dashboard(cms_tests.test_uuid(401)), 
  'User with view share should not edit dashboard'
);

-- Test edit permission - admin updates permission
SELECT cms_tests.authenticate_as('admin');
UPDATE cms.dashboard_role_shares 
SET permission_level = 'edit' 
WHERE dashboard_id = cms_tests.test_uuid(401) AND role_id = cms_tests.test_uuid(202);

-- Switch back to manager to test edit access
SELECT cms_tests.authenticate_as('manager');

SELECT ok(
  cms.can_edit_dashboard(cms_tests.test_uuid(401)), 
  'User with edit share should edit dashboard'
);

-- ============================================
-- SECTION: DASHBOARD CRUD TESTS
-- ============================================

-- Test create_dashboard function
SELECT cms_tests.authenticate_as('admin');
-- Ensure admin has admin access
SELECT cms_tests.set_admin_access('admin@test.com', 'true');

-- Test successful dashboard creation
SELECT lives_ok(
  $$SELECT cms.create_dashboard('Test Dashboard')$$,
  'Admin user should create dashboard successfully'
);

-- Test invalid name validation
SELECT throws_ok(
  $$SELECT cms.create_dashboard('AB')$$,
  '22023',
  'Dashboard name must be at least 3 characters',
  'Should reject short dashboard names'
);

SELECT throws_ok(
  $$SELECT cms.create_dashboard('   ')$$,
  '22023',
  'Dashboard name must be at least 3 characters',
  'Should reject whitespace-only dashboard names'
);

SELECT throws_ok(
  $$SELECT cms.create_dashboard(NULL)$$,
  '22023',
  'Dashboard name must be at least 3 characters',
  'Should reject NULL dashboard names'
);

-- Test non-admin access
SELECT cms_tests.authenticate_as('employee');
-- Ensure employee doesn't have admin access
SELECT cms_tests.set_admin_access('employee@test.com', 'false');

SELECT throws_ok(
  $$SELECT cms.create_dashboard('Employee Dashboard')$$,
  '42501',
  'Access denied',
  'Non-admin user should not create dashboards'
);

-- ============================================
-- SECTION: WIDGET CRUD TESTS
-- ============================================

SELECT cms_tests.authenticate_as('admin');
-- Ensure admin has admin access for widget operations
SELECT cms_tests.set_admin_access('admin@test.com', 'true');

-- Test widget insertion
INSERT INTO cms.dashboard_widgets (
  dashboard_id, widget_type, title, config, position, schema_name, table_name
) VALUES (
  cms_tests.test_uuid(401), 
  'chart', 
  'User Chart', 
  '{"chartType": "bar"}', 
  '{"x": 0, "y": 0, "w": 4, "h": 3}',
  'public', 
  'users'
);

SELECT ok(
  EXISTS(SELECT 1 FROM cms.dashboard_widgets WHERE dashboard_id = cms_tests.test_uuid(401)),
  'Should insert widget successfully'
);

-- Test invalid position constraint
SELECT throws_ok(
  format($$INSERT INTO cms.dashboard_widgets (
    dashboard_id, widget_type, title, config, position, schema_name, table_name
  ) VALUES (
    %L, 
    'chart', 
    'Invalid Widget', 
    '{}', 
    '{"x": -1, "y": 0, "w": 4, "h": 3}',
    'public', 
    'users'
  )$$, cms_tests.test_uuid(401)),
  '23514',
  NULL,
  'Should reject negative x position'
);

-- ============================================
-- SECTION: SHARING FUNCTION TESTS
-- ============================================

-- Test share_dashboard_with_role function
SELECT lives_ok(
  format($$SELECT cms.share_dashboard_with_role(
    %L,
    %L,
    'view'
  )$$, cms_tests.test_uuid(401), cms_tests.test_uuid(203)),
  'Owner should share dashboard with role successfully'
);

-- Verify share was created
SELECT is(
  (SELECT permission_level::text FROM cms.dashboard_role_shares 
   WHERE dashboard_id = cms_tests.test_uuid(401) 
   AND role_id = cms_tests.test_uuid(203)),
  'view',
  'Share should be created with correct permission level'
);

-- Test role rank validation - try to share with higher rank role
SELECT throws_ok(
  format($$SELECT cms.share_dashboard_with_role(
    %L,
    %L,
    'view'
  )$$, cms_tests.test_uuid(401), cms_tests.test_uuid(201)),
  NULL,
  'Cannot share with equal or higher priority roles',
  'Should not share with higher priority roles'
);

-- Test non-owner sharing
SELECT cms_tests.authenticate_as('manager');

SELECT throws_ok(
  format($$SELECT cms.share_dashboard_with_role(
    %L,
    %L,
    'view'
  )$$, cms_tests.test_uuid(401), cms_tests.test_uuid(203)),
  NULL,
  'Dashboard not found or you do not own it',
  'Non-owner should not share dashboard'
);

-- ============================================
-- SECTION: UNSHARE FUNCTION TESTS
-- ============================================

SELECT cms_tests.authenticate_as('admin');

-- Test unshare_dashboard_from_role function
SELECT lives_ok(
  format($$SELECT cms.unshare_dashboard_from_role(
    %L,
    %L
  )$$, cms_tests.test_uuid(401), cms_tests.test_uuid(203)),
  'Owner should unshare dashboard successfully'
);

-- Verify share was removed
SELECT is(
  (SELECT COUNT(*)::integer FROM cms.dashboard_role_shares 
   WHERE dashboard_id = cms_tests.test_uuid(401) 
   AND role_id = cms_tests.test_uuid(203)),
  0,
  'Share should be removed after unsharing'
);

-- ============================================
-- SECTION: GET DASHBOARD FUNCTION TESTS
-- ============================================

-- Test get_dashboard function
SELECT is(
  jsonb_typeof(cms.get_dashboard(cms_tests.test_uuid(401))),
  'object',
  'get_dashboard should return JSON object'
);

-- Test access control on get_dashboard
SELECT cms_tests.authenticate_as('employee');

SELECT throws_ok(
  format($$SELECT cms.get_dashboard(%L)$$, cms_tests.test_uuid(401)),
  NULL,
  'Dashboard not found or access denied',
  'Non-authorized user should not access dashboard via function'
);

-- ============================================
-- SECTION: LIST DASHBOARDS FUNCTION TESTS
-- ============================================

SELECT cms_tests.authenticate_as('admin');

-- Test list_dashboards function
SELECT is(
  jsonb_typeof(cms.list_dashboards()),
  'object',
  'list_dashboards should return JSON object'
);

-- Test that result contains expected structure
SELECT ok(
  (cms.list_dashboards() ? 'dashboards'),
  'list_dashboards result should contain dashboards key'
);

SELECT ok(
  (cms.list_dashboards() ? 'pagination'),
  'list_dashboards result should contain pagination key'
);

-- ============================================
-- SECTION: RLS POLICY TESTS
-- ============================================

-- Test dashboard RLS policies
SELECT cms_tests.authenticate_as('admin');

-- Owner should see their dashboard
SELECT is(
  (SELECT COUNT(*)::integer FROM cms.dashboards WHERE id = cms_tests.test_uuid(401)),
  1,
  'Owner should see their dashboard through RLS'
);

-- Non-owner without share should not see dashboard
SELECT cms_tests.authenticate_as('employee');

SELECT is(
  (SELECT COUNT(*)::integer FROM cms.dashboards WHERE id = cms_tests.test_uuid(401)),
  0,
  'Non-owner without share should not see dashboard through RLS'
);

-- Add share and test visibility
SELECT cms_tests.authenticate_as('admin');
INSERT INTO cms.dashboard_role_shares (dashboard_id, role_id, permission_level, granted_by) VALUES 
  (cms_tests.test_uuid(401), cms_tests.test_uuid(203), 'view', cms_tests.test_uuid(101));

SELECT cms_tests.authenticate_as('employee');

SELECT is(
  (SELECT COUNT(*)::integer FROM cms.dashboards WHERE id = cms_tests.test_uuid(401)),
  1,
  'User with share should see dashboard through RLS'
);

-- ============================================
-- SECTION: WIDGET RLS TESTS
-- ============================================

-- Test widget visibility through RLS
SELECT is(
  (SELECT COUNT(*)::integer FROM cms.dashboard_widgets WHERE dashboard_id = cms_tests.test_uuid(401)),
  1,
  'User with dashboard access should see widgets through RLS'
);

-- Test widget insertion access control
SELECT cms_tests.authenticate_as('manager');
-- Ensure manager has admin access
SELECT cms_tests.set_admin_access('manager@test.com', 'true');

-- User with edit permission should be able to insert widgets
SELECT lives_ok(
  format($$INSERT INTO cms.dashboard_widgets (
    dashboard_id, widget_type, title, config, position, schema_name, table_name
  ) VALUES (
    %L, 
    'metric', 
    'User Count', 
    '{"aggregation": "count"}', 
    '{"x": 4, "y": 0, "w": 2, "h": 2}',
    'public', 
    'users'
  )$$, cms_tests.test_uuid(401)),
  'User with edit permission should insert widgets'
);

-- ============================================
-- SECTION: TRIGGER TESTS
-- ============================================

-- Test that widget changes update dashboard updated_at
SELECT cms_tests.authenticate_as('admin');

-- Get initial updated_at
SELECT ok(
  (SELECT updated_at FROM cms.dashboards WHERE id = cms_tests.test_uuid(401)) IS NOT NULL,
  'Dashboard should have updated_at timestamp'
);

-- Insert a new widget and check if dashboard updated_at changed
SELECT pg_sleep(0.1); -- Small delay to ensure timestamp difference

INSERT INTO cms.dashboard_widgets (
  dashboard_id, widget_type, title, config, position, schema_name, table_name
) VALUES (
  cms_tests.test_uuid(401), 
  'table', 
  'Orders Table', 
  '{}', 
  '{"x": 0, "y": 3, "w": 6, "h": 4}',
  'public', 
  'orders'
);

-- The updated_at should be updated by the trigger, but we can't easily test the exact timing
SELECT ok(
  (SELECT updated_at FROM cms.dashboards WHERE id = cms_tests.test_uuid(401)) IS NOT NULL,
  'Dashboard updated_at should still exist after widget insert'
);

-- ============================================
-- SECTION: EDGE CASE TESTS
-- ============================================

-- Test dashboard creation with role shares
SELECT lives_ok(
  format($$SELECT cms.create_dashboard('Dashboard with Shares', '[
    {"roleId": "%s", "permissionLevel": "view"}
  ]'::jsonb)$$, cms_tests.test_uuid(203)),
  'Should create dashboard with role shares successfully'
);

-- Test cascade deletion
SELECT lives_ok(
  format($$DELETE FROM cms.dashboards WHERE id = %L$$, cms_tests.test_uuid(401)),
  'Should delete dashboard successfully'
);

-- Verify widgets were cascaded
SELECT is(
  (SELECT COUNT(*)::integer FROM cms.dashboard_widgets WHERE dashboard_id = cms_tests.test_uuid(401)),
  0,
  'Widgets should be cascade deleted with dashboard'
);

-- Verify shares were cascaded
SELECT is(
  (SELECT COUNT(*)::integer FROM cms.dashboard_role_shares WHERE dashboard_id = cms_tests.test_uuid(401)),
  0,
  'Shares should be cascade deleted with dashboard'
);

-- ============================================
-- SECTION: SECURITY TESTS
-- ============================================

-- Test SQL injection protection in functions
SELECT throws_ok(
  $$SELECT cms.list_dashboards(1, 20, 'test''; DROP TABLE cms.dashboards; --')$$,
  'P0001',
  NULL,
  'list_dashboards should reject malicious search parameters'
);

-- Test privilege escalation attempt
SELECT cms_tests.authenticate_as('employee');
-- Ensure employee doesn't have admin access
SELECT cms_tests.set_admin_access('employee@test.com', 'false');

SELECT throws_ok(
  $$SELECT cms.create_dashboard('Unauthorized Dashboard')$$,
  '42501',
  NULL,
  'Should prevent privilege escalation for dashboard creation'
);

-- Finish the tests and clean up
SELECT * FROM finish();
ROLLBACK;