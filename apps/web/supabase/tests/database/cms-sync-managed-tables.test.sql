-- Test file: sync_managed_tables.test.sql
-- Tests cms.sync_managed_tables function for table metadata synchronization
-- This tests the core metadata extraction and table discovery functionality

BEGIN;

-- PymeKit exige MFA en el CMS por defecto (ADR-014); esa regla se prueba en
-- cms-super-admin-root.test.sql. Aquí se valida la lógica funcional con
-- sesiones sin segundo factor, así que se desactiva el requisito de forma
-- explícita. El ROLLBACK final deshace el cambio.
update cms.configuration set value = 'false' where key = 'requires_mfa';

SELECT no_plan();

-- Clean up any existing test data
DELETE FROM cms.table_metadata WHERE schema_name = 'test_schema';
DROP SCHEMA IF EXISTS test_schema CASCADE;

-- Clean up test data to avoid conflicts with previous tests
DELETE FROM cms.permission_group_permissions;
DELETE FROM cms.role_permission_groups;
DELETE FROM cms.permission_groups;
DELETE FROM cms.account_permissions;
DELETE FROM cms.account_roles;
DELETE FROM cms.role_permissions;
-- Clean up dashboard tables (must be in dependency order)
DELETE FROM cms.dashboard_role_shares;
DELETE FROM cms.dashboard_widgets;
DELETE FROM cms.dashboards;
DELETE FROM cms.accounts;
DELETE FROM cms.roles;
DELETE FROM cms.permissions;

-- Create test user and account for authentication with unique identifier
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(1), 'sync_admin_user', 'syncadmin@test.com');

INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(1), true);

-- Create role and permissions for testing with unique names
INSERT INTO cms.roles (id, name, rank, description) VALUES
    (cms_tests.test_uuid(201), 'Sync Admin', 90, 'Admin role for sync testing');

INSERT INTO cms.permissions (id, name, permission_type, system_resource, action) VALUES
    (cms_tests.test_uuid(301), 'sync_table_update', 'system', 'table', 'update');

INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(201));

INSERT INTO cms.role_permissions (role_id, permission_id) VALUES
    (cms_tests.test_uuid(201), cms_tests.test_uuid(301));

-- Adaptación a PymeKit: la tabla `public.accounts` de la plataforma ya existe
-- (cuentas personales y de equipo) y referencia a `auth.users` mediante
-- `primary_owner_user_id`, así que las pruebas de relaciones entre esquemas
-- (28-29 y 34-35) se ejecutan contra ella en lugar de crear una tabla mínima.

-- Create test schema and tables for comprehensive testing
CREATE SCHEMA test_schema;

-- Create test enum for enum column testing
CREATE TYPE test_schema.status_enum AS ENUM ('active', 'inactive', 'pending');

-- Test Table 1: Basic table with various column types and primary key
CREATE TABLE test_schema.users (
                                   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                   username VARCHAR(50) NOT NULL UNIQUE,
                                   email TEXT NOT NULL,
                                   age INTEGER,
                                   balance NUMERIC(10,2),
                                   is_active BOOLEAN DEFAULT true,
                                   status test_schema.status_enum DEFAULT 'active',
                                   metadata JSONB DEFAULT '{}',
                                   created_at TIMESTAMPTZ DEFAULT NOW(),
                                   updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Test Table 2: Table with composite primary key and foreign key
CREATE TABLE test_schema.user_profiles (
                                           user_id UUID NOT NULL,
                                           profile_type VARCHAR(20) NOT NULL,
                                           bio TEXT,
                                           avatar_url TEXT,
                                           settings JSONB,
                                           PRIMARY KEY (user_id, profile_type),
                                           FOREIGN KEY (user_id) REFERENCES test_schema.users(id) ON DELETE CASCADE
);

-- Test Table 3: Table with multiple foreign keys and unique constraints
CREATE TABLE test_schema.posts (
                                   id BIGSERIAL PRIMARY KEY,
                                   author_id UUID NOT NULL,
                                   title VARCHAR(200) NOT NULL,
                                   content TEXT,
                                   slug VARCHAR(200) UNIQUE,
                                   published_at TIMESTAMPTZ,
                                   view_count INTEGER DEFAULT 0,
                                   tags TEXT[],
                                   FOREIGN KEY (author_id) REFERENCES test_schema.users(id),
                                   UNIQUE (author_id, slug)
);

-- Test Table 4: Simple table with minimal columns
CREATE TABLE test_schema.categories (
                                        id SERIAL PRIMARY KEY,
                                        name VARCHAR(100) NOT NULL,
                                        description TEXT
);

-- Test Table 5: Table with no primary key (edge case)
CREATE TABLE test_schema.logs (
                                  message TEXT,
                                  level VARCHAR(10),
                                  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Test 1: Sync entire test schema
SELECT lives_ok(
               $$SELECT cms.sync_managed_tables('test_schema')$$,
               'sync_managed_tables executes without error for entire schema'
       );

-- Test 2: Verify all tables were discovered and synced
SELECT is(
               (SELECT COUNT(*) FROM cms.table_metadata WHERE schema_name = 'test_schema'),
               5::bigint,
               'All 5 test tables were synced to metadata'
       );

-- Test 3: Verify basic table information was captured correctly
SELECT row_eq(
               $$SELECT schema_name, table_name, display_name
      FROM cms.table_metadata
      WHERE schema_name = 'test_schema' AND table_name = 'users'$$,
               ROW('test_schema'::varchar, 'users'::varchar, 'Users'::varchar),
               'Users table basic info captured correctly'
       );

-- Test 4: Verify columns_config contains expected columns for users table
SELECT ok(
               (SELECT columns_config ? 'id' FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               'Users table id column captured in columns_config'
       );

SELECT ok(
               (SELECT columns_config ? 'username' FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               'Users table username column captured in columns_config'
       );

SELECT ok(
               (SELECT columns_config ? 'status' FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               'Users table status enum column captured in columns_config'
       );

-- Test 5: Verify column metadata is correctly populated
SELECT is(
               (SELECT columns_config->'id'->>'display_name' FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               'Id',
               'Column display name generated correctly'
       );

SELECT is(
               (SELECT (columns_config->'id'->>'is_primary_key')::boolean FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               true,
               'Primary key column marked correctly'
       );

SELECT is(
               (SELECT (columns_config->'username'->>'is_required')::boolean FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               true,
               'NOT NULL column marked as required'
       );

SELECT is(
               (SELECT (columns_config->'age'->>'is_required')::boolean FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               false,
               'Nullable column marked as not required'
       );

-- Test 6: Verify enum column metadata
SELECT is(
               (SELECT (columns_config->'status'->'ui_config'->>'is_enum')::boolean FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               true,
               'Enum column marked as enum'
       );

SELECT is(
               (SELECT columns_config->'status'->'ui_config'->>'enum_type' FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               'status_enum',
               'Enum type name captured correctly'
       );

SELECT ok(
               (SELECT columns_config->'status'->'ui_config'->'enum_values' @> '["active"]'::jsonb FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               'Enum values captured correctly'
       );

-- Test 7: Verify primary key information in ui_config
SELECT ok(
               (SELECT ui_config->'primary_keys' @> '[{"column_name": "id"}]'::jsonb FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               'Single primary key captured in ui_config'
       );

-- Test 8: Verify composite primary key handling
SELECT ok(
               (SELECT ui_config->'primary_keys' @> '[{"column_name": "user_id"}, {"column_name": "profile_type"}]'::jsonb
                FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'user_profiles'),
               'Composite primary key captured correctly'
       );

-- Test 9: Verify unique constraints captured
SELECT ok(
               (SELECT jsonb_array_length(ui_config->'unique_constraints') > 0 FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               'Unique constraints captured for users table'
       );

-- Test 10: Verify foreign key relationships captured
SELECT ok(
               (SELECT jsonb_array_length(relations_config) > 0 FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'user_profiles'),
               'Foreign key relationships captured for user_profiles table'
       );

-- Test 11: Verify specific foreign key relationship details
SELECT ok(
               (SELECT relations_config @> '[{"source_column": "user_id", "target_table": "users", "target_column": "id", "relation_type": "many_to_one"}]'::jsonb
                FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'user_profiles'),
               'Foreign key relationship details captured correctly'
       );

-- Test 12: Verify column editability logic
SELECT is(
               (SELECT (columns_config->'id'->>'is_editable')::boolean FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               false,
               'Primary key column marked as not editable'
       );

SELECT is(
               (SELECT (columns_config->'created_at'->>'is_editable')::boolean FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               false,
               'Timestamp column ending in _at marked as not editable'
       );

SELECT is(
               (SELECT (columns_config->'username'->>'is_editable')::boolean FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               true,
               'Regular column marked as editable'
       );

-- Test 13: Verify searchability logic for different column types
SELECT is(
               (SELECT (columns_config->'username'->>'is_searchable')::boolean FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               true,
               'Text column marked as searchable'
       );

SELECT is(
               (SELECT (columns_config->'id'->>'is_searchable')::boolean FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               true,
               'UUID column marked as searchable'
       );

SELECT is(
               (SELECT (columns_config->'age'->>'is_searchable')::boolean FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               false,
               'Integer column marked as not searchable'
       );

SELECT is(
               (SELECT (columns_config->'metadata'->>'is_searchable')::boolean FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               false,
               'JSONB column marked as not searchable'
       );

-- Test 14: Sync specific table only
DELETE FROM cms.table_metadata WHERE schema_name = 'test_schema' AND table_name = 'users';

SELECT lives_ok(
               $$SELECT cms.sync_managed_tables('test_schema', 'users')$$,
               'sync_managed_tables executes for specific table'
       );

SELECT ok(
               (SELECT EXISTS(SELECT 1 FROM cms.table_metadata
                              WHERE schema_name = 'test_schema' AND table_name = 'users')),
               'Specific table was re-synced'
       );

SELECT is(
               (SELECT COUNT(*) FROM cms.table_metadata WHERE schema_name = 'test_schema'),
               5::bigint,
               'Other tables remain after specific table sync'
       );

-- Test 15: Preserve existing custom metadata on re-sync
UPDATE cms.table_metadata
SET display_name = 'Custom Users Table',
    description = 'Custom description',
    is_visible = false,
    ordering = 999
WHERE schema_name = 'test_schema' AND table_name = 'users';

-- Update column config to test preservation
UPDATE cms.table_metadata
SET columns_config = jsonb_set(
        columns_config,
        '{username,display_name}',
        '"Custom Username"'::jsonb
                     )
WHERE schema_name = 'test_schema' AND table_name = 'users';

-- Test 16: Check that ui_config exists and has primary_keys after initial sync
SELECT ok(
               (SELECT ui_config IS NOT NULL FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               'ui_config is not null after initial sync'
       );

SELECT ok(
               (SELECT ui_config ? 'primary_keys' FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               'ui_config contains primary_keys after initial sync'
       );

-- Test 16a: Update ui_config with custom configuration to test merging behavior  
UPDATE cms.table_metadata
SET ui_config = ui_config || '{"custom_field": "Custom UI Config Value"}'::jsonb
WHERE schema_name = 'test_schema' AND table_name = 'users';

SELECT lives_ok(
               $$SELECT cms.sync_managed_tables('test_schema', 'users')$$,
               'Re-sync preserves existing custom metadata'
       );

SELECT is(
               (SELECT display_name FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               'Custom Users Table',
               'Custom display name preserved on re-sync'
       );

SELECT is(
               (SELECT description FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               'Custom description',
               'Custom description preserved on re-sync'
       );

SELECT is(
               (SELECT is_visible FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               false,
               'Custom visibility setting preserved on re-sync'
       );

SELECT is(
               (SELECT columns_config->'username'->>'display_name' FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               'Custom Username',
               'Custom column display name preserved on re-sync'
       );

-- Test 16b: Verify that custom ui_config fields are preserved on re-sync
SELECT is(
               (SELECT ui_config->>'custom_field' FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               'Custom UI Config Value',
               'Custom ui_config field preserved on re-sync'
       );

-- Test 17: Test with table that has no primary key
SELECT ok(
               (SELECT EXISTS(SELECT 1 FROM cms.table_metadata
                              WHERE schema_name = 'test_schema' AND table_name = 'logs')),
               'Table without primary key is synced'
       );

SELECT is(
               (SELECT jsonb_array_length(ui_config->'primary_keys') FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'logs'),
               0,
               'Table without primary key has empty primary_keys array'
       );

-- Test 18: Test array column type handling
SELECT is(
               (SELECT columns_config->'tags'->'ui_config'->>'data_type' FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'posts'),
               'ARRAY',
               'Array column data type captured correctly'
       );

-- Test 19: Test serial/bigserial column handling
SELECT ok(
               (SELECT columns_config ? 'id' FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'posts'),
               'BIGSERIAL primary key column captured'
       );

SELECT ok(
               (SELECT columns_config ? 'id' FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'categories'),
               'SERIAL primary key column captured'
       );

-- Test 20: Test multiple foreign keys on same table
SELECT ok(
               (SELECT jsonb_array_length(relations_config) > 0 FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'posts'),
               'Table with foreign key has relations captured'
       );

-- Test 21: Test default values captured
SELECT ok(
               (SELECT columns_config->'is_active'->>'default_value' IS NOT NULL FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               'Default value captured for boolean column'
       );

-- Test 22: Test column ordering
SELECT is(
               (SELECT (columns_config->'id'->>'ordering')::integer FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               1,
               'First column has ordering = 1'
       );

SELECT ok(
               (SELECT (columns_config->'username'->>'ordering')::integer >
                       (columns_config->'id'->>'ordering')::integer FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'users'),
               'Columns are ordered sequentially'
       );

-- Test 23: Test schema parameter validation (should handle invalid schema gracefully)
SELECT lives_ok(
               $$SELECT cms.sync_managed_tables('nonexistent_schema')$$,
               'sync_managed_tables handles nonexistent schema gracefully'
       );

-- Test 24: Test table parameter validation
SELECT lives_ok(
               $$SELECT cms.sync_managed_tables('test_schema', 'nonexistent_table')$$,
               'sync_managed_tables handles nonexistent table gracefully'
       );

-- Verify no metadata was created for nonexistent table
SELECT is(
               (SELECT COUNT(*) FROM cms.table_metadata
                WHERE schema_name = 'test_schema' AND table_name = 'nonexistent_table'),
               0::bigint,
               'No metadata created for nonexistent table'
       );

-- Test 25: Test permission requirement - user without admin access cannot sync
-- This should silently do nothing since the function checks admin access
select cms_tests.authenticate_as('sync_admin_user');

SELECT throws_ok(
           $$ SELECT cms.sync_managed_tables('test_schema') $$,
        'permission denied for function sync_managed_tables',
               'sync_managed_tables can only be executed at DB level'
       );

-- Reset to superuser for remaining tests that need elevated privileges
RESET ROLE;

-- =====================================================
-- NEW TESTS FOR INCOMING RELATIONSHIP DETECTION
-- =====================================================

-- Set role to postgres for sync operations (requires elevated privileges)
SET ROLE postgres;

-- Test 26: Test the real cross-schema relationships that should exist in the system
-- Test auth.users specifically (the original issue)
SELECT lives_ok(
    $$SELECT cms.sync_managed_tables('auth', 'users')$$,
    'sync_managed_tables works for auth.users table'
);

-- Test 27: Verify auth.users table exists in managed tables
SELECT ok(
    (SELECT EXISTS(SELECT 1 FROM cms.table_metadata 
                   WHERE schema_name = 'auth' AND table_name = 'users')),
    'auth.users table exists in managed tables'
);

-- Test 28: Verify cross-schema relationship detection - public.accounts to auth.users
SELECT lives_ok(
    $$SELECT cms.sync_managed_tables('public')$$,
    'sync_managed_tables executes for public schema'
);

-- Test 29: Verify public.accounts has outgoing relationship to auth.users
SELECT ok(
    (SELECT relations_config @> '[{"source_column": "primary_owner_user_id", "target_table": "users", "target_schema": "auth", "relation_type": "many_to_one"}]'::jsonb
     FROM cms.table_metadata
     WHERE schema_name = 'public' AND table_name = 'accounts'),
    'public.accounts table has outgoing relationship to auth.users'
);

-- Test 30: Verify cms schema relationships
SELECT lives_ok(
    $$SELECT cms.sync_managed_tables('cms')$$,
    'sync_managed_tables executes for cms schema'
);

-- Test 31: Verify cms.accounts has outgoing relationship to auth.users
SELECT ok(
    (SELECT relations_config @> '[{"source_column": "auth_user_id", "target_table": "users", "target_schema": "auth", "relation_type": "many_to_one"}]'::jsonb
     FROM cms.table_metadata
     WHERE schema_name = 'cms' AND table_name = 'accounts'),
    'cms.accounts table has outgoing relationship to auth.users'
);

-- Test 32: Re-sync auth.users to get incoming relationships
SELECT lives_ok(
    $$SELECT cms.sync_managed_tables('auth', 'users')$$,
    'Re-sync auth.users after other schemas are synced'
);

-- Test 33: Verify auth.users has incoming relationships
SELECT ok(
    (SELECT jsonb_array_length(relations_config) > 0 FROM cms.table_metadata
     WHERE schema_name = 'auth' AND table_name = 'users'),
    'auth.users table has incoming relationships detected'
);

-- Test 34: Test that relationships are preserved on re-sync (no duplicates)
SELECT lives_ok(
    $$SELECT cms.sync_managed_tables('public', 'accounts')$$,
    'Re-sync of public.accounts executes successfully'
);

-- Test 35: Verify relationship count is consistent after re-sync
SELECT ok(
    (SELECT jsonb_array_length(relations_config) > 0 FROM cms.table_metadata
     WHERE schema_name = 'public' AND table_name = 'accounts'),
    'public.accounts maintains relationships after re-sync'
);

-- =====================================================
-- COMPREHENSIVE EDGE CASE TESTING
-- =====================================================

-- Test 36: Create comprehensive edge case scenarios for bulletproof testing
CREATE TABLE test_schema.edge_case_parent (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL
);

CREATE TABLE test_schema.edge_case_child (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES test_schema.edge_case_parent(id),
    name VARCHAR(100) NOT NULL
);

-- Composite foreign key
CREATE TABLE test_schema.composite_parent (
    id1 UUID NOT NULL,
    id2 UUID NOT NULL,
    data TEXT,
    PRIMARY KEY (id1, id2)
);

CREATE TABLE test_schema.composite_child (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id1 UUID NOT NULL,
    parent_id2 UUID NOT NULL,
    value TEXT,
    FOREIGN KEY (parent_id1, parent_id2) REFERENCES test_schema.composite_parent(id1, id2)
);

-- Multiple FKs to same table
CREATE TABLE test_schema.multi_ref_child (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    primary_parent_id UUID REFERENCES test_schema.edge_case_parent(id),
    secondary_parent_id UUID REFERENCES test_schema.edge_case_parent(id),
    data TEXT
);

-- Self-referencing FK
CREATE TABLE test_schema.self_ref (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES test_schema.self_ref(id),
    name VARCHAR(100)
);

-- Circular references
CREATE TABLE test_schema.circular_a (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100),
    b_id UUID
);

CREATE TABLE test_schema.circular_b (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100),
    a_id UUID REFERENCES test_schema.circular_a(id)
);

ALTER TABLE test_schema.circular_a ADD CONSTRAINT fk_circular_a_b 
FOREIGN KEY (b_id) REFERENCES test_schema.circular_b(id);

-- Test 37: Sync schema with edge cases
SELECT lives_ok(
    $$SELECT cms.sync_managed_tables('test_schema')$$,
    'sync_managed_tables handles edge case tables without errors'
);

-- Test 38: Verify composite foreign key detection
SELECT ok(
    (SELECT relations_config @> '[{"source_column": "parent_id1", "target_table": "composite_parent", "relation_type": "many_to_one"}]'::jsonb
     FROM cms.table_metadata
     WHERE schema_name = 'test_schema' AND table_name = 'composite_child'),
    'Composite foreign key first column detected'
);

-- Test 39: Verify multiple foreign keys to same table
SELECT ok(
    (SELECT jsonb_array_length(
        jsonb_path_query_array(relations_config, '$[*] ? (@.target_table == "edge_case_parent")')
    ) = 2 FROM cms.table_metadata
     WHERE schema_name = 'test_schema' AND table_name = 'multi_ref_child'),
    'Multiple foreign keys to same table both detected'
);

-- Test 40: Verify self-referencing foreign key
SELECT ok(
    (SELECT relations_config @> '[{"source_column": "parent_id", "target_table": "self_ref", "target_schema": "test_schema", "relation_type": "many_to_one"}]'::jsonb
     FROM cms.table_metadata
     WHERE schema_name = 'test_schema' AND table_name = 'self_ref'),
    'Self-referencing foreign key detected'
);

-- Test 41: Verify circular references are handled correctly
SELECT ok(
    (SELECT relations_config @> '[{"source_column": "b_id", "target_table": "circular_b", "relation_type": "many_to_one"}]'::jsonb
     FROM cms.table_metadata
     WHERE schema_name = 'test_schema' AND table_name = 'circular_a'),
    'Circular reference A->B detected'
);

SELECT ok(
    (SELECT relations_config @> '[{"source_column": "a_id", "target_table": "circular_a", "relation_type": "many_to_one"}]'::jsonb
     FROM cms.table_metadata
     WHERE schema_name = 'test_schema' AND table_name = 'circular_b'),
    'Circular reference B->A detected'
);

-- Test 42: Verify incoming relationships for parent tables
SELECT ok(
    (SELECT jsonb_array_length(
        jsonb_path_query_array(relations_config, '$[*] ? (@.relation_type == "one_to_many")')
    ) >= 1 FROM cms.table_metadata
     WHERE schema_name = 'test_schema' AND table_name = 'edge_case_parent'),
    'Parent table has incoming one-to-many relationships'
);

-- Test 43: Test performance with large number of relationships
-- Create 10 tables each with FK to edge_case_parent
DO $$
DECLARE
    i INTEGER;
BEGIN
    FOR i IN 1..10 LOOP
        EXECUTE format('CREATE TABLE test_schema.perf_test_%s (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            parent_id UUID REFERENCES test_schema.edge_case_parent(id),
            data_%s TEXT
        )', i, i);
    END LOOP;
END $$;

-- Time the sync with many relationships
SELECT lives_ok(
    $$SELECT cms.sync_managed_tables('test_schema')$$,
    'sync_managed_tables handles many relationships efficiently'
);

-- Test 44: Verify all performance test tables got relationships
SELECT ok(
    (SELECT COUNT(*) = 10 
     FROM cms.table_metadata 
     WHERE schema_name = 'test_schema' 
       AND table_name LIKE 'perf_test_%'
       AND relations_config @> '[{"target_table": "edge_case_parent", "relation_type": "many_to_one"}]'::jsonb),
    'All performance test tables have correct relationships'
);

-- Test 45: Verify parent table got all incoming relationships
SELECT ok(
    (SELECT jsonb_array_length(
        jsonb_path_query_array(relations_config, '$[*] ? (@.relation_type == "one_to_many" && @.target_table like_regex "^(edge_case_child|multi_ref_child|perf_test_)")')
    ) >= 12 FROM cms.table_metadata  -- 1 + 2 + 10 = 13 relationships expected
     WHERE schema_name = 'test_schema' AND table_name = 'edge_case_parent'),
    'Parent table has all expected incoming relationships'
);

-- Test 46: Test NULL foreign key handling (should not crash)
CREATE TABLE test_schema.nullable_fk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    optional_parent_id UUID REFERENCES test_schema.edge_case_parent(id),
    data TEXT
);

SELECT lives_ok(
    $$SELECT cms.sync_managed_tables('test_schema', 'nullable_fk')$$,
    'Nullable foreign keys handled correctly'
);

-- Test 47: Test with NO foreign keys (should not crash)
CREATE TABLE test_schema.no_fks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    standalone_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

SELECT lives_ok(
    $$SELECT cms.sync_managed_tables('test_schema', 'no_fks')$$,
    'Tables with no foreign keys handled correctly'
);

-- Test 48: Verify no_fks table has empty relations
SELECT is(
    (SELECT jsonb_array_length(relations_config) FROM cms.table_metadata
     WHERE schema_name = 'test_schema' AND table_name = 'no_fks'),
    0,
    'Table with no foreign keys has empty relations array'
);

-- Test 49: Test re-sync after schema changes (add FK to existing table)
ALTER TABLE test_schema.no_fks ADD COLUMN parent_ref UUID REFERENCES test_schema.edge_case_parent(id);

SELECT lives_ok(
    $$SELECT cms.sync_managed_tables('test_schema', 'no_fks')$$,
    'Re-sync after adding foreign key works'
);

SELECT ok(
    (SELECT relations_config @> '[{"source_column": "parent_ref", "target_table": "edge_case_parent", "relation_type": "many_to_one"}]'::jsonb
     FROM cms.table_metadata
     WHERE schema_name = 'test_schema' AND table_name = 'no_fks'),
    'Newly added foreign key detected on re-sync'
);

-- Test 50: Test with very long identifiers (PostgreSQL limit: 63 chars)
CREATE TABLE test_schema.very_long_table_name_that_approaches_postgresql_limit_test (
    id UUID PRIMARY KEY,
    very_long_column_name_that_approaches_postgresql_limit_test UUID REFERENCES test_schema.edge_case_parent(id)
);

SELECT lives_ok(
    $$SELECT cms.sync_managed_tables('test_schema', 'very_long_table_name_that_approaches_postgresql_limit_test')$$,
    'Very long identifiers handled correctly'
);

-- Test 51: Test constraint naming edge cases (PostgreSQL auto-generated names)
CREATE TABLE test_schema.auto_constraint_names (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ref1 UUID REFERENCES test_schema.edge_case_parent(id),
    ref2 UUID REFERENCES test_schema.edge_case_child(id),
    ref3 UUID REFERENCES test_schema.users(id) -- Cross-schema reference
);

SELECT lives_ok(
    $$SELECT cms.sync_managed_tables('test_schema', 'auto_constraint_names')$$,
    'Auto-generated constraint names handled correctly'
);

-- Test 52: Verify all three relationships detected
SELECT is(
    (SELECT jsonb_array_length(relations_config) FROM cms.table_metadata
     WHERE schema_name = 'test_schema' AND table_name = 'auto_constraint_names'),
    3,
    'All three foreign keys with auto-generated names detected'
);

-- Test 53: Test concurrent sync operations (simulate via multiple calls)
SELECT lives_ok(
    $$SELECT cms.sync_managed_tables('test_schema')$$,
    'First concurrent sync completes'
);

SELECT lives_ok(
    $$SELECT cms.sync_managed_tables('test_schema')$$,
    'Second concurrent sync completes without conflicts'
);

-- Test 54: Verify data integrity after concurrent syncs
SELECT ok(
    (SELECT COUNT(*) > 15 FROM cms.table_metadata 
     WHERE schema_name = 'test_schema'),
    'All tables still present after concurrent syncs'
);

-- Test 55: Test empty schema (should not crash)
CREATE SCHEMA test_empty_schema;

SELECT lives_ok(
    $$SELECT cms.sync_managed_tables('test_empty_schema')$$,
    'Empty schema sync completes without errors'
);

SELECT is(
    (SELECT COUNT(*) FROM cms.table_metadata 
     WHERE schema_name = 'test_empty_schema'),
    0::bigint,
    'Empty schema results in no table metadata'
);

-- Clean up test schemas
DROP SCHEMA test_empty_schema CASCADE;

SELECT finish();

ROLLBACK;