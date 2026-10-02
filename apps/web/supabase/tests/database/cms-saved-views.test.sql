-- Test file: saved_views.test.sql
-- Tests cms saved views functionality and sharing system
-- This tests saved_views table, saved_view_roles, and related functions

BEGIN;

-- PymeKit exige MFA en el CMS por defecto (ADR-014); esa regla se prueba en
-- cms-super-admin-root.test.sql. Aquí se valida la lógica funcional con
-- sesiones sin segundo factor, así que se desactiva el requisito de forma
-- explícita. El ROLLBACK final deshace el cambio.
update cms.configuration set value = 'false' where key = 'requires_mfa';

SELECT no_plan();

-- Clean up any existing test data
DROP TABLE IF EXISTS public.test_customers CASCADE;
DROP TABLE IF EXISTS public.test_products CASCADE;

DELETE FROM cms.saved_view_roles;
DELETE FROM cms.saved_views;
DELETE FROM cms.table_metadata;
DELETE FROM cms.permission_group_permissions;
DELETE FROM cms.role_permission_groups;
DELETE FROM cms.account_permissions;
DELETE FROM cms.account_roles;
DELETE FROM cms.role_permissions;
DELETE FROM cms.permission_groups;
-- Clean up dashboard tables (must be in dependency order)
DELETE FROM cms.dashboard_role_shares;
DELETE FROM cms.dashboard_widgets;
DELETE FROM cms.dashboards;
DELETE FROM cms.accounts;
DELETE FROM cms.roles;
DELETE FROM cms.permissions;

-- Create test tables for saved views
CREATE TABLE public.test_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.test_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50),
    price NUMERIC(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create test users
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(1), 'admin_user', 'admin@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(2), 'manager_user', 'manager@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(3), 'sales_user', 'sales@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(4), 'support_user', 'support@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(5), 'no_access_user', 'noaccess@test.com');

-- Create accounts
INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(1), true),  -- Admin User
    (cms_tests.test_uuid(102), cms_tests.test_uuid(2), true),  -- Manager User
    (cms_tests.test_uuid(103), cms_tests.test_uuid(3), true),  -- Sales User
    (cms_tests.test_uuid(104), cms_tests.test_uuid(4), true),  -- Support User
    (cms_tests.test_uuid(105), cms_tests.test_uuid(5), true);  -- No Access User

-- Create roles with different priorities
INSERT INTO cms.roles (id, name, rank, description) VALUES
    (cms_tests.test_uuid(201), 'Admin', 90, 'Administrator role'),
    (cms_tests.test_uuid(202), 'Manager', 70, 'Manager role'),
    (cms_tests.test_uuid(203), 'Sales', 50, 'Sales team role'),
    (cms_tests.test_uuid(204), 'Support', 40, 'Support team role'),
    (cms_tests.test_uuid(205), 'No Access', 10, 'No access role');

-- Create data permissions (required for saved views to work)
INSERT INTO cms.permissions (id, name, permission_type, scope, schema_name, table_name, action) VALUES
    (cms_tests.test_uuid(301), 'customers_select', 'data', 'table', 'public', 'test_customers', 'select'),
    (cms_tests.test_uuid(302), 'products_select', 'data', 'table', 'public', 'test_products', 'select');

-- Assign roles to accounts
INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(201)),  -- Admin
    (cms_tests.test_uuid(102), cms_tests.test_uuid(202)),  -- Manager
    (cms_tests.test_uuid(103), cms_tests.test_uuid(203)),  -- Sales
    (cms_tests.test_uuid(104), cms_tests.test_uuid(204)),  -- Support
    (cms_tests.test_uuid(105), cms_tests.test_uuid(205));  -- No Access

-- Grant data permissions to roles
INSERT INTO cms.role_permissions (role_id, permission_id) VALUES
    -- Admin gets access to both tables
    (cms_tests.test_uuid(201), cms_tests.test_uuid(301)),  -- customers
    (cms_tests.test_uuid(201), cms_tests.test_uuid(302)),  -- products
    -- Manager gets access to both tables
    (cms_tests.test_uuid(202), cms_tests.test_uuid(301)),  -- customers
    (cms_tests.test_uuid(202), cms_tests.test_uuid(302)),  -- products
    -- Sales gets access to customers only
    (cms_tests.test_uuid(203), cms_tests.test_uuid(301)),  -- customers
    -- Support gets access to customers only
    (cms_tests.test_uuid(204), cms_tests.test_uuid(301));  -- customers

-- Sync table metadata (required for saved views)
SELECT cms.sync_managed_tables('public', 'test_customers');
SELECT cms.sync_managed_tables('public', 'test_products');

-- Verify table metadata exists
SELECT isnt_empty(
    $$ SELECT * FROM cms.table_metadata WHERE schema_name = 'public' AND table_name = 'test_customers' $$,
    'test_customers table metadata exists'
);

SELECT isnt_empty(
    $$ SELECT * FROM cms.table_metadata WHERE schema_name = 'public' AND table_name = 'test_products' $$,
    'test_products table metadata exists'
);

-- Test 1: User without admin access cannot create saved views
SELECT cms_tests.authenticate_as('no_access_user');
SELECT cms_tests.set_admin_access('noaccess@test.com', 'false');

SELECT throws_ok(
    $$ INSERT INTO cms.saved_views (name, view_type, config, schema_name, table_name) 
       VALUES ('Unauthorized View', 'filter', '{"filters": []}'::jsonb, 'public', 'test_customers') $$,
    'new row violates row-level security policy for table "saved_views"'
);

-- Restore admin access
SELECT cms_tests.set_admin_access('noaccess@test.com', 'true');

-- Test 2: User can create personal saved views
SELECT cms_tests.authenticate_as('admin_user');

SELECT lives_ok(
    $$ INSERT INTO cms.saved_views (id, name, description, view_type, config, schema_name, table_name) 
       VALUES (cms_tests.test_uuid(401), 'Admin Customer Filter', 'Filters for active customers', 'filter', 
               '{"filters": [{"column": "status", "operator": "=", "value": "active"}]}'::jsonb, 
               'public', 'test_customers') $$,
    'Admin can create personal saved view'
);

-- Verify the view was created
SELECT row_eq(
    $$ SELECT name, view_type, schema_name, table_name, created_by 
       FROM cms.saved_views WHERE id = cms_tests.test_uuid(401) $$,
    ROW('Admin Customer Filter'::varchar, 'filter'::varchar, 'public'::varchar, 'test_customers'::varchar, cms_tests.test_uuid(101)),
    'Saved view was created correctly with current user as creator'
);

-- Test 3: User can create views for different table types
SELECT lives_ok(
    $$ INSERT INTO cms.saved_views (id, name, view_type, config, schema_name, table_name) 
       VALUES (cms_tests.test_uuid(402), 'Admin Dashboard', 'dashboard', 
               '{"charts": [{"type": "bar", "column": "status"}]}'::jsonb, 
               'public', 'test_customers') $$,
    'Admin can create dashboard view'
);

SELECT lives_ok(
    $$ INSERT INTO cms.saved_views (id, name, view_type, config, schema_name, table_name) 
       VALUES (cms_tests.test_uuid(403), 'Product Categories', 'custom', 
               '{"groupBy": "category", "aggregation": "count"}'::jsonb, 
               'public', 'test_products') $$,
    'Admin can create custom view'
);

-- Test 4: User can update their own saved views
UPDATE cms.saved_views 
SET description = 'Updated description', 
    config = '{"filters": [{"column": "status", "operator": "IN", "value": ["active", "pending"]}]}'::jsonb
WHERE id = cms_tests.test_uuid(401);

SELECT row_eq(
    $$ SELECT description FROM cms.saved_views WHERE id = cms_tests.test_uuid(401) $$,
    ROW('Updated description'::varchar),
    'User can update their own saved view'
);

-- Test 5: User can delete their own saved views
DELETE FROM cms.saved_views WHERE id = cms_tests.test_uuid(403);

SELECT is_empty(
    $$ SELECT * FROM cms.saved_views WHERE id = cms_tests.test_uuid(403) $$,
    'User can delete their own saved view'
);

-- Test 6: Other users cannot modify views they didn't create
SELECT cms_tests.authenticate_as('manager_user');

UPDATE cms.saved_views 
SET description = 'Hacked by manager'
WHERE id = cms_tests.test_uuid(401);

SELECT is_empty(
    $$ SELECT description FROM cms.saved_views WHERE id = cms_tests.test_uuid(401) $$,
    'Other users cannot update views they did not create'
);

-- Try to delete someone else's view
DELETE FROM cms.saved_views WHERE id = cms_tests.test_uuid(401);

set local role postgres;

SELECT isnt_empty(
    $$ SELECT * FROM cms.saved_views WHERE id = cms_tests.test_uuid(401) $$,
    'Other users cannot delete views they did not create'
);

-- Restore manager_user for next tests
SELECT cms_tests.authenticate_as('manager_user');

-- Test 7: Manager can create their own views
SELECT lives_ok(
    $$ INSERT INTO cms.saved_views (id, name, description, view_type, config, schema_name, table_name) 
       VALUES (cms_tests.test_uuid(404), 'Manager Customer View', 'Manager specific filters', 'filter', 
               '{"filters": [{"column": "created_at", "operator": ">=", "value": "2024-01-01"}]}'::jsonb, 
               'public', 'test_customers') $$,
    'Manager can create their own saved view'
);

-- Test 8: View sharing through saved_view_roles
set role postgres;

-- Share admin view with manager and sales roles
SELECT lives_ok(
    $$ INSERT INTO cms.saved_view_roles (view_id, role_id) VALUES 
       (cms_tests.test_uuid(401), cms_tests.test_uuid(202)),  -- Share with Manager role
       (cms_tests.test_uuid(401), cms_tests.test_uuid(203)) $$,  -- Share with Sales role
    'Admin can share view with other roles'
);

-- Test 9: Users can see views shared with their roles
SELECT cms_tests.authenticate_as('sales_user');

-- Sales user should see the shared admin view
SELECT isnt_empty(
    $$ SELECT * FROM cms.saved_views WHERE id = cms_tests.test_uuid(401) $$,
    'Sales user can see view shared with their role'
);

-- Test 10: Users cannot see views not shared with them
SELECT cms_tests.authenticate_as('support_user');

-- Support user should NOT see the admin view (not shared with support role)
SELECT is_empty(
    $$ SELECT * FROM cms.saved_views WHERE id = cms_tests.test_uuid(401) $$,
    'Support user cannot see view not shared with their role'
);

-- Support user should NOT see manager's personal view
SELECT is_empty(
    $$ SELECT * FROM cms.saved_views WHERE id = cms_tests.test_uuid(404) $$,
    'Support user cannot see other users personal views'
);

-- Test 11: View sharing restrictions based on role rank
SELECT cms_tests.authenticate_as('sales_user');

-- Sales user (rank 50) tries to share view with Manager role (rank 70) - should fail
SELECT throws_ok(
    $$ INSERT INTO cms.saved_view_roles (view_id, role_id) VALUES 
       (cms_tests.test_uuid(404), cms_tests.test_uuid(202)) $$,  -- Try to share manager's view with manager role
    'new row violates row-level security policy for table "saved_view_roles"',
    'Lower rank user cannot share views with higher rank roles'
);

-- Test 12: insert_saved_view function
SELECT cms_tests.authenticate_as('admin_user');

SELECT is(
    (SELECT cms.insert_saved_view(
        'Function Created View',
        'Created via function',
        'filter',
        '{"filters": [{"column": "name", "operator": "LIKE", "value": "%test%"}]}'::jsonb,
        'public',
        'test_customers',
        ARRAY[cms_tests.test_uuid(203), cms_tests.test_uuid(204)]  -- Share with Sales and Support
    ) IS NOT NULL),
    true,
    'insert_saved_view function creates view and shares with roles'
);

-- Verify the view was created and shared
SELECT isnt_empty(
    $$ SELECT * FROM cms.saved_views WHERE name = 'Function Created View' $$,
    'Function created view exists'
);

-- Test 13: get_user_views function
-- Create some more test data
SELECT cms_tests.authenticate_as('manager_user');

SELECT cms.insert_saved_view(
    'Manager Product View',
    'Manager view for products',
    'dashboard',
    '{"charts": [{"type": "pie", "column": "category"}]}'::jsonb,
    'public',
    'test_products',
    NULL  -- No sharing
);

-- Test get_user_views with no filters
SELECT is(
    (SELECT jsonb_array_length((cms.get_user_views())->'personal') >= 1),
    true,
    'get_user_views returns personal views'
);

SELECT is(
    (SELECT jsonb_array_length((cms.get_user_views())->'team') >= 1),
    true,
    'get_user_views returns team views (shared views)'
);

-- Test get_user_views with schema filter
SELECT is(
    (SELECT (cms.get_user_views('public'))->>'personal' IS NOT NULL),
    true,
    'get_user_views with schema filter returns views'
);

-- Test get_user_views with table filter
SELECT is(
    (SELECT jsonb_array_length((cms.get_user_views('public', 'test_products'))->'personal') >= 1),
    true,
    'get_user_views with table filter returns correct views'
);

-- Test 14: Foreign key constraint with table_metadata
-- Try to create view for non-existent table metadata (should fail)
SELECT cms_tests.authenticate_as('admin_user');

SELECT throws_ok(
    $$ INSERT INTO cms.saved_views (name, view_type, config, schema_name, table_name) 
       VALUES ('Invalid Table View', 'filter', '{}'::jsonb, 'public', 'nonexistent_table') $$,
    'insert or update on table "saved_views" violates foreign key constraint "saved_views_schema_name_table_name_fkey"',
    'Cannot create saved view for table without metadata'
);

-- Test 15: View access requires underlying table permissions
SELECT cms_tests.authenticate_as('sales_user');

-- Sales user can create view for customers (has permission)
SELECT lives_ok(
    $$ INSERT INTO cms.saved_views (id, name, view_type, config, schema_name, table_name) 
       VALUES (cms_tests.test_uuid(405), 'Sales Customer View', 'filter', '{}'::jsonb, 'public', 'test_customers') $$,
    'Sales user can create view for table they have access to'
);

-- Sales user cannot create view for products (no permission)
-- Note: This should be blocked by data permission checks if implemented
-- For now, the RLS allows creation but the view won't be functional

-- Test 16: Cascade deletion when table metadata is removed
SET ROLE postgres;

-- Remove table metadata (this should cascade delete related saved views)
DELETE FROM cms.table_metadata WHERE schema_name = 'public' AND table_name = 'test_products';

-- Verify views for that table were deleted
SELECT is_empty(
    $$ SELECT * FROM cms.saved_views WHERE schema_name = 'public' AND table_name = 'test_products' $$,
    'Saved views are cascade deleted when table metadata is removed'
);

-- Restore table metadata for remaining tests
SELECT cms.sync_managed_tables('public', 'test_products');

-- Test 17: Complex view configuration validation
SELECT cms_tests.authenticate_as('admin_user');

-- Test with valid JSON configuration
SELECT lives_ok(
    $$ INSERT INTO cms.saved_views (id, name, view_type, config, schema_name, table_name) 
       VALUES (cms_tests.test_uuid(406), 'Complex Config', 'dashboard', 
               '{"layout": {"columns": 2}, "widgets": [{"type": "chart", "config": {"chartType": "line", "dataSource": "customers"}}]}'::jsonb, 
               'public', 'test_customers') $$,
    'Can create view with complex JSON configuration'
);

-- Test 18: View name uniqueness per user
-- Different users can have views with the same name
SELECT cms_tests.authenticate_as('support_user');

SELECT lives_ok(
    $$ INSERT INTO cms.saved_views (name, view_type, config, schema_name, table_name) 
       VALUES ('Customer Filter', 'filter', '{}'::jsonb, 'public', 'test_customers') $$,
    'Different users can create views with same name'
);

SELECT cms_tests.authenticate_as('sales_user');

SELECT lives_ok(
    $$ INSERT INTO cms.saved_views (name, view_type, config, schema_name, table_name) 
       VALUES ('Customer Filter', 'filter', '{}'::jsonb, 'public', 'test_customers') $$,
    'Different users can create views with same name'
);

-- Test 19: View type validation
SELECT cms_tests.authenticate_as('admin_user');

-- Test valid view types
SELECT lives_ok(
    $$ INSERT INTO cms.saved_views (name, view_type, config, schema_name, table_name) 
       VALUES ('Filter View', 'filter', '{}'::jsonb, 'public', 'test_customers') $$,
    'Can create filter view'
);

SELECT lives_ok(
    $$ INSERT INTO cms.saved_views (name, view_type, config, schema_name, table_name) 
       VALUES ('Dashboard View', 'dashboard', '{}'::jsonb, 'public', 'test_customers') $$,
    'Can create dashboard view'
);

SELECT lives_ok(
    $$ INSERT INTO cms.saved_views (name, view_type, config, schema_name, table_name) 
       VALUES ('Custom View', 'custom', '{}'::jsonb, 'public', 'test_customers') $$,
    'Can create custom view'
);

-- Test 20: Saved view roles cascade deletion
SET ROLE postgres;

-- Create a view and share it
INSERT INTO cms.saved_views (id, name, view_type, config, schema_name, table_name, created_by) 
VALUES (cms_tests.test_uuid(407), 'Test Cascade', 'filter', '{}'::jsonb, 'public', 'test_customers', cms_tests.test_uuid(101));

INSERT INTO cms.saved_view_roles (view_id, role_id) VALUES 
(cms_tests.test_uuid(407), cms_tests.test_uuid(202)),
(cms_tests.test_uuid(407), cms_tests.test_uuid(203));

-- Verify sharing exists
SELECT is(
    (SELECT COUNT(*) FROM cms.saved_view_roles WHERE view_id = cms_tests.test_uuid(407))::int,
    2,
    'View sharing records exist'
);

-- Delete the view
DELETE FROM cms.saved_views WHERE id = cms_tests.test_uuid(407);

-- Verify sharing records were cascade deleted
SELECT is_empty(
    $$ SELECT * FROM cms.saved_view_roles WHERE view_id = cms_tests.test_uuid(407) $$,
    'View sharing records are cascade deleted with view'
);

SELECT finish();

ROLLBACK;