BEGIN;

-- PymeKit exige MFA en el CMS por defecto (ADR-014); esa regla se prueba en
-- cms-super-admin-root.test.sql. Aquí se valida la lógica funcional con
-- sesiones sin segundo factor, así que se desactiva el requisito de forma
-- explícita. El ROLLBACK final deshace el cambio.
update cms.configuration set value = 'false' where key = 'requires_mfa';

-- Load the TAP functions
SELECT plan(99); -- Updated count to match actual tests

-- ============================================
-- SECTION: SCHEMA AND TYPE TESTS
-- ============================================

-- Test ENUM types exist
SELECT has_type('cms', 'dashboard_permission_level', 'dashboard_permission_level enum should exist');
SELECT enum_has_labels('cms', 'dashboard_permission_level', ARRAY['owner', 'view', 'edit'], 'dashboard_permission_level should have correct values');

SELECT has_type('cms', 'dashboard_widget_type', 'dashboard_widget_type enum should exist');
SELECT enum_has_labels('cms', 'dashboard_widget_type', ARRAY['chart', 'metric', 'table'], 'dashboard_widget_type should have correct values');

-- ============================================
-- SECTION: TABLE EXISTENCE TESTS
-- ============================================

-- Test tables exist
SELECT has_table('cms', 'dashboards', 'dashboards table should exist');
SELECT has_table('cms', 'dashboard_widgets', 'dashboard_widgets table should exist');
SELECT has_table('cms', 'dashboard_role_shares', 'dashboard_role_shares table should exist');

-- ============================================
-- SECTION: COLUMN TESTS
-- ============================================

-- dashboards table columns
SELECT has_column('cms', 'dashboards', 'id', 'dashboards should have id column');
SELECT col_type_is('cms', 'dashboards', 'id', 'uuid', 'dashboards.id should be UUID');
SELECT col_is_pk('cms', 'dashboards', 'id', 'dashboards.id should be primary key');
SELECT col_has_default('cms', 'dashboards', 'id', 'dashboards.id should have default');

SELECT has_column('cms', 'dashboards', 'name', 'dashboards should have name column');
SELECT col_type_is('cms', 'dashboards', 'name', 'character varying(255)', 'dashboards.name should be varchar(255)');
SELECT col_not_null('cms', 'dashboards', 'name', 'dashboards.name should be NOT NULL');

SELECT has_column('cms', 'dashboards', 'created_by', 'dashboards should have created_by column');
SELECT col_type_is('cms', 'dashboards', 'created_by', 'uuid', 'dashboards.created_by should be UUID');
-- Nullable by design: created_by is ON DELETE SET NULL so that deleting an auth user
-- orphans their dashboards instead of destroying ones other people are still using.
SELECT col_is_null('cms', 'dashboards', 'created_by', 'dashboards.created_by should be nullable');

SELECT has_column('cms', 'dashboards', 'created_at', 'dashboards should have created_at column');
SELECT col_type_is('cms', 'dashboards', 'created_at', 'timestamp with time zone', 'dashboards.created_at should be timestamptz');
SELECT col_has_default('cms', 'dashboards', 'created_at', 'dashboards.created_at should have default');

SELECT has_column('cms', 'dashboards', 'updated_at', 'dashboards should have updated_at column');
SELECT col_type_is('cms', 'dashboards', 'updated_at', 'timestamp with time zone', 'dashboards.updated_at should be timestamptz');
SELECT col_has_default('cms', 'dashboards', 'updated_at', 'dashboards.updated_at should have default');

-- dashboard_widgets table columns
SELECT has_column('cms', 'dashboard_widgets', 'id', 'dashboard_widgets should have id column');
SELECT col_type_is('cms', 'dashboard_widgets', 'id', 'uuid', 'dashboard_widgets.id should be UUID');
SELECT col_is_pk('cms', 'dashboard_widgets', 'id', 'dashboard_widgets.id should be primary key');

SELECT has_column('cms', 'dashboard_widgets', 'dashboard_id', 'dashboard_widgets should have dashboard_id column');
SELECT col_type_is('cms', 'dashboard_widgets', 'dashboard_id', 'uuid', 'dashboard_widgets.dashboard_id should be UUID');
SELECT col_not_null('cms', 'dashboard_widgets', 'dashboard_id', 'dashboard_widgets.dashboard_id should be NOT NULL');

SELECT has_column('cms', 'dashboard_widgets', 'widget_type', 'dashboard_widgets should have widget_type column');
SELECT col_type_is('cms', 'dashboard_widgets', 'widget_type', 'cms.dashboard_widget_type', 'dashboard_widgets.widget_type should be enum type');

SELECT has_column('cms', 'dashboard_widgets', 'title', 'dashboard_widgets should have title column');
SELECT col_type_is('cms', 'dashboard_widgets', 'title', 'character varying(255)', 'dashboard_widgets.title should be varchar(255)');

SELECT has_column('cms', 'dashboard_widgets', 'config', 'dashboard_widgets should have config column');
SELECT col_type_is('cms', 'dashboard_widgets', 'config', 'jsonb', 'dashboard_widgets.config should be jsonb');
SELECT col_has_default('cms', 'dashboard_widgets', 'config', 'dashboard_widgets.config should have default');

SELECT has_column('cms', 'dashboard_widgets', 'position', 'dashboard_widgets should have position column');
SELECT col_type_is('cms', 'dashboard_widgets', 'position', 'jsonb', 'dashboard_widgets.position should be jsonb');

SELECT has_column('cms', 'dashboard_widgets', 'schema_name', 'dashboard_widgets should have schema_name column');
SELECT col_type_is('cms', 'dashboard_widgets', 'schema_name', 'character varying(64)', 'dashboard_widgets.schema_name should be varchar(64)');

SELECT has_column('cms', 'dashboard_widgets', 'table_name', 'dashboard_widgets should have table_name column');
SELECT col_type_is('cms', 'dashboard_widgets', 'table_name', 'character varying(64)', 'dashboard_widgets.table_name should be varchar(64)');

-- dashboard_role_shares table columns
SELECT has_column('cms', 'dashboard_role_shares', 'dashboard_id', 'dashboard_role_shares should have dashboard_id column');
SELECT has_column('cms', 'dashboard_role_shares', 'role_id', 'dashboard_role_shares should have role_id column');
SELECT has_column('cms', 'dashboard_role_shares', 'permission_level', 'dashboard_role_shares should have permission_level column');
SELECT col_type_is('cms', 'dashboard_role_shares', 'permission_level', 'cms.dashboard_permission_level', 'dashboard_role_shares.permission_level should be enum type');
SELECT col_has_default('cms', 'dashboard_role_shares', 'permission_level', 'dashboard_role_shares.permission_level should have default');

SELECT has_column('cms', 'dashboard_role_shares', 'granted_by', 'dashboard_role_shares should have granted_by column');
SELECT has_column('cms', 'dashboard_role_shares', 'granted_at', 'dashboard_role_shares should have granted_at column');

-- ============================================
-- SECTION: CONSTRAINT TESTS
-- ============================================

-- Test foreign key constraints
SELECT has_fk('cms', 'dashboards', 'dashboards should have foreign key constraint');
SELECT has_fk('cms', 'dashboard_widgets', 'dashboard_widgets should have foreign key constraints');
SELECT has_fk('cms', 'dashboard_role_shares', 'dashboard_role_shares should have foreign key constraints');

-- Test check constraints exist (pgTAP syntax for check constraints)
SELECT ok(
  EXISTS(SELECT 1 FROM information_schema.check_constraints 
         WHERE constraint_schema = 'cms' 
         AND constraint_name = 'dashboards_name_check'),
  'dashboards should have name length check constraint'
);

SELECT ok(
  EXISTS(SELECT 1 FROM information_schema.check_constraints 
         WHERE constraint_schema = 'cms' 
         AND constraint_name = 'position_valid'),
  'dashboard_widgets should have position validation constraint'
);

-- Test primary key constraints
SELECT has_pk('cms', 'dashboard_role_shares', 'dashboard_role_shares should have composite primary key');

-- ============================================
-- SECTION: INDEX TESTS
-- ============================================

SELECT has_index('cms', 'dashboards', 'idx_dashboards_created_by', 'dashboards should have created_by index');
SELECT has_index('cms', 'dashboard_widgets', 'idx_dashboard_widgets_dashboard', 'dashboard_widgets should have dashboard_id index');
SELECT has_index('cms', 'dashboard_role_shares', 'idx_dashboard_role_shares_dashboard', 'dashboard_role_shares should have dashboard_id index');
SELECT has_index('cms', 'dashboard_role_shares', 'idx_dashboard_role_shares_role', 'dashboard_role_shares should have role_id index');

-- ============================================
-- SECTION: RLS TESTS
-- ============================================

-- Test RLS is enabled
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'dashboards' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'cms')),
  'dashboards should have RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'dashboard_widgets' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'cms')),
  'dashboard_widgets should have RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'dashboard_role_shares' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'cms')),
  'dashboard_role_shares should have RLS enabled'
);

-- Test RLS policies exist
SELECT policies_are('cms', 'dashboards', ARRAY['select_dashboards', 'insert_dashboards', 'update_dashboards', 'delete_dashboards'], 'dashboards should have correct policies');
SELECT policies_are('cms', 'dashboard_widgets', ARRAY['select_widgets', 'insert_widgets', 'update_widgets', 'delete_widgets'], 'dashboard_widgets should have correct policies');
SELECT policies_are('cms', 'dashboard_role_shares', ARRAY['manage_shares'], 'dashboard_role_shares should have correct policies');

-- ============================================
-- SECTION: FUNCTION TESTS
-- ============================================

-- Test functions exist
SELECT has_function('cms', 'can_access_dashboard', ARRAY['uuid'], 'can_access_dashboard function should exist');
SELECT has_function('cms', 'can_edit_dashboard', ARRAY['uuid'], 'can_edit_dashboard function should exist');
SELECT has_function('cms', 'get_dashboard', ARRAY['uuid'], 'get_dashboard function should exist');
SELECT has_function('cms', 'list_dashboards', ARRAY['integer', 'integer', 'text', 'character varying'], 'list_dashboards function should exist');
SELECT has_function('cms', 'share_dashboard_with_role', ARRAY['uuid', 'uuid', 'cms.dashboard_permission_level'], 'share_dashboard_with_role function should exist');
SELECT has_function('cms', 'unshare_dashboard_from_role', ARRAY['uuid', 'uuid'], 'unshare_dashboard_from_role function should exist');
SELECT has_function('cms', 'create_dashboard', ARRAY['text', 'jsonb'], 'create_dashboard function should exist');

-- Test function return types
SELECT function_returns('cms', 'can_access_dashboard', ARRAY['uuid'], 'boolean', 'can_access_dashboard should return boolean');
SELECT function_returns('cms', 'can_edit_dashboard', ARRAY['uuid'], 'boolean', 'can_edit_dashboard should return boolean');
SELECT function_returns('cms', 'get_dashboard', ARRAY['uuid'], 'jsonb', 'get_dashboard should return jsonb');
SELECT function_returns('cms', 'list_dashboards', ARRAY['integer', 'integer', 'text', 'character varying'], 'jsonb', 'list_dashboards should return jsonb');
SELECT function_returns('cms', 'share_dashboard_with_role', ARRAY['uuid', 'uuid', 'cms.dashboard_permission_level'], 'jsonb', 'share_dashboard_with_role should return jsonb');
SELECT function_returns('cms', 'unshare_dashboard_from_role', ARRAY['uuid', 'uuid'], 'jsonb', 'unshare_dashboard_from_role should return jsonb');
SELECT function_returns('cms', 'create_dashboard', ARRAY['text', 'jsonb'], 'jsonb', 'create_dashboard should return jsonb');

-- ============================================
-- SECTION: TRIGGER TESTS
-- ============================================

SELECT has_trigger('cms', 'dashboard_widgets', 'widget_changes_update_dashboard', 'dashboard_widgets should have update trigger');

-- ============================================
-- SECTION: GRANTS TESTS
-- ============================================

-- Test table permissions using PostgreSQL system functions
SELECT ok(
  has_table_privilege('authenticated'::regrole, 'cms.dashboards'::regclass, 'SELECT'),
  'authenticated should have SELECT on dashboards'
);
SELECT ok(
  has_table_privilege('authenticated'::regrole, 'cms.dashboards'::regclass, 'INSERT'),
  'authenticated should have INSERT on dashboards'
);
SELECT ok(
  has_table_privilege('authenticated'::regrole, 'cms.dashboards'::regclass, 'UPDATE'),
  'authenticated should have UPDATE on dashboards'
);
SELECT ok(
  has_table_privilege('authenticated'::regrole, 'cms.dashboards'::regclass, 'DELETE'),
  'authenticated should have DELETE on dashboards'
);

SELECT ok(
  has_table_privilege('authenticated'::regrole, 'cms.dashboard_widgets'::regclass, 'SELECT'),
  'authenticated should have SELECT on dashboard_widgets'
);
SELECT ok(
  has_table_privilege('authenticated'::regrole, 'cms.dashboard_widgets'::regclass, 'INSERT'),
  'authenticated should have INSERT on dashboard_widgets'
);
SELECT ok(
  has_table_privilege('authenticated'::regrole, 'cms.dashboard_widgets'::regclass, 'UPDATE'),
  'authenticated should have UPDATE on dashboard_widgets'
);
SELECT ok(
  has_table_privilege('authenticated'::regrole, 'cms.dashboard_widgets'::regclass, 'DELETE'),
  'authenticated should have DELETE on dashboard_widgets'
);

SELECT ok(
  has_table_privilege('authenticated'::regrole, 'cms.dashboard_role_shares'::regclass, 'SELECT'),
  'authenticated should have SELECT on dashboard_role_shares'
);
SELECT ok(
  has_table_privilege('authenticated'::regrole, 'cms.dashboard_role_shares'::regclass, 'INSERT'),
  'authenticated should have INSERT on dashboard_role_shares'
);
SELECT ok(
  has_table_privilege('authenticated'::regrole, 'cms.dashboard_role_shares'::regclass, 'UPDATE'),
  'authenticated should have UPDATE on dashboard_role_shares'
);
SELECT ok(
  has_table_privilege('authenticated'::regrole, 'cms.dashboard_role_shares'::regclass, 'DELETE'),
  'authenticated should have DELETE on dashboard_role_shares'
);

-- Test function permissions using PostgreSQL system functions
SELECT ok(
  has_function_privilege('authenticated'::regrole, 'cms.can_access_dashboard(uuid)', 'EXECUTE'),
  'authenticated should have EXECUTE on can_access_dashboard'
);
SELECT ok(
  has_function_privilege('authenticated'::regrole, 'cms.can_edit_dashboard(uuid)', 'EXECUTE'),
  'authenticated should have EXECUTE on can_edit_dashboard'
);
SELECT ok(
  has_function_privilege('authenticated'::regrole, 'cms.get_dashboard(uuid)', 'EXECUTE'),
  'authenticated should have EXECUTE on get_dashboard'
);
SELECT ok(
  has_function_privilege('authenticated'::regrole, 'cms.list_dashboards(integer,integer,text,character varying)', 'EXECUTE'),
  'authenticated should have EXECUTE on list_dashboards'
);
SELECT ok(
  has_function_privilege('authenticated'::regrole, 'cms.share_dashboard_with_role(uuid,uuid,cms.dashboard_permission_level)', 'EXECUTE'),
  'authenticated should have EXECUTE on share_dashboard_with_role'
);
SELECT ok(
  has_function_privilege('authenticated'::regrole, 'cms.unshare_dashboard_from_role(uuid,uuid)', 'EXECUTE'),
  'authenticated should have EXECUTE on unshare_dashboard_from_role'
);
SELECT ok(
  has_function_privilege('authenticated'::regrole, 'cms.create_dashboard(text,jsonb)', 'EXECUTE'),
  'authenticated should have EXECUTE on create_dashboard'
);

-- Finish the tests and clean up
SELECT * FROM finish();
ROLLBACK;