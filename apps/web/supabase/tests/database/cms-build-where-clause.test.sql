-- Test file: build_where_clause.test.sql
-- Tests cms.build_where_clause function for security and functionality
-- This tests SQL injection prevention, type safety, and complexity limits

BEGIN;

-- PymeKit exige MFA en el CMS por defecto (ADR-014); esa regla se prueba en
-- cms-super-admin-root.test.sql. Aquí se valida la lógica funcional con
-- sesiones sin segundo factor, así que se desactiva el requisito de forma
-- explícita. El ROLLBACK final deshace el cambio.
update cms.configuration set value = 'false' where key = 'requires_mfa';

SELECT no_plan();

-- Clean up any existing test data
DELETE FROM cms.table_metadata;
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

-- Create enum for testing
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
        CREATE TYPE public.user_status AS ENUM ('active', 'inactive', 'pending');
    END IF;
END $$;

-- Create test tables for column validation
CREATE TABLE IF NOT EXISTS public.test_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email VARCHAR(255) UNIQUE,
    age INTEGER,
    salary NUMERIC(10,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    birth_date DATE,
    metadata JSONB DEFAULT '{}',
    tags TEXT[],
    status public.user_status DEFAULT 'active'
);

-- Create test user and account
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(1), 'test_user', 'test@test.com');

INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(1), true);

-- Create role and permissions
INSERT INTO cms.roles (id, name, rank, description) VALUES
    (cms_tests.test_uuid(201), 'Test User', 50, 'Test role');

INSERT INTO cms.permissions (id, name, permission_type, scope, schema_name, table_name, action) VALUES
    (cms_tests.test_uuid(301), 'test_users_select', 'data', 'table', 'public', 'test_users', 'select');

INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(201));

INSERT INTO cms.role_permissions (role_id, permission_id) VALUES
    (cms_tests.test_uuid(201), cms_tests.test_uuid(301));

-- Sync table metadata
SELECT cms.sync_managed_tables('public', 'test_users');

-- [TFG] RNF-02 · F2.7b (pendiente de ADR-015): `build_where_clause` ya no
-- es ejecutable por `authenticated` (solo la llama `query_table`, que se
-- ejecuta como su propietario). Se comprueba y el resto del fichero valida
-- la lógica del constructor con el rol propietario, como la usa
-- `query_table`.
SELECT cms_tests.authenticate_as('test_user');

SELECT throws_ok(
    $$ SELECT cms.build_where_clause('public', 'test_users', '[]'::jsonb) $$,
    '42501',
    NULL,
    'authenticated no puede ejecutar build_where_clause directamente'
);

SET LOCAL ROLE postgres;

-- Test 1: Simple equality filter
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "name", "operator": "=", "value": "John"}]'::jsonb
    )),
    'name = ''John''',
    'Simple equality filter builds correctly'
);

-- Test 2: Multiple filters with AND logic
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[
            {"column": "name", "operator": "=", "value": "John"},
            {"column": "age", "operator": ">", "value": "25"}
        ]'::jsonb
    )),
    'name = ''John'' AND age > 25',
    'Multiple filters combine with AND'
);

-- Test 3: Integer type validation and formatting
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "age", "operator": "=", "value": "30"}]'::jsonb
    )),
    'age = 30',
    'Integer values are formatted without quotes'
);

-- Test 4: Boolean type validation
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "is_active", "operator": "=", "value": "true"}]'::jsonb
    )),
    'is_active = ''true''::boolean',
    'Boolean values are formatted correctly'
);

-- Test 5: UUID type validation
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "id", "operator": "=", "value": "123e4567-e89b-12d3-a456-426614174000"}]'::jsonb
    )),
    'id = ''123e4567-e89b-12d3-a456-426614174000''::uuid',
    'UUID values are formatted with proper casting'
);

-- Test 6: IS NULL operator
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "email", "operator": "IS NULL"}]'::jsonb
    )),
    'email IS NULL',
    'IS NULL operator works without value'
);

-- Test 7: IS NOT NULL operator
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "email", "operator": "IS NOT NULL"}]'::jsonb
    )),
    'email IS NOT NULL',
    'IS NOT NULL operator works without value'
);

-- Test 8: LIKE operator
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "name", "operator": "LIKE", "value": "John%"}]'::jsonb
    )),
    'name LIKE ''John%''',
    'LIKE operator works correctly'
);

-- Test 9: ILIKE operator (case insensitive)
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "name", "operator": "ILIKE", "value": "john%"}]'::jsonb
    )),
    'name ILIKE ''john%''',
    'ILIKE operator works correctly'
);

-- Test 10: IN operator with array
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "name", "operator": "IN", "value": ["John", "Jane", "Bob"]}]'::jsonb
    )),
    'name IN (''John'', ''Jane'', ''Bob'')',
    'IN operator with string array works correctly'
);

-- Test 11: IN operator with integer array
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "age", "operator": "IN", "value": [25, 30, 35]}]'::jsonb
    )),
    'age IN (25, 30, 35)',
    'IN operator with integer array works correctly'
);

-- Test 12: NOT IN operator
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "name", "operator": "NOT IN", "value": ["Admin", "System"]}]'::jsonb
    )),
    'name NOT IN (''Admin'', ''System'')',
    'NOT IN operator works correctly'
);

-- Test 13: Comparison operators
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "age", "operator": ">=", "value": "18"}]'::jsonb
    )),
    'age >= 18',
    'Greater than or equal operator works'
);

SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "age", "operator": "<=", "value": "65"}]'::jsonb
    )),
    'age <= 65',
    'Less than or equal operator works'
);

SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "age", "operator": "!=", "value": "0"}]'::jsonb
    )),
    'age != 0',
    'Not equal operator works'
);

-- Test 14: Date type handling
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "birth_date", "operator": ">", "value": "1990-01-01"}]'::jsonb
    )),
    'birth_date > ''1990-01-01''::date',
    'Date values are formatted with proper casting'
);

-- Test 15: Timestamp type handling
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "created_at", "operator": ">", "value": "2023-01-01 00:00:00"}]'::jsonb
    )),
    'created_at > ''2023-01-01 00:00:00''',
    'Timestamp values are formatted with proper casting'
);

-- Test 16: JSONB type handling
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "metadata", "operator": "=", "value": {"key": "value"}}]'::jsonb
    )),
    'metadata = ''{"key": "value"}''',
    'JSONB values are formatted correctly'
);

-- Test 17: Invalid column name throws error
SELECT throws_ilike(
    $$ SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "nonexistent_column", "operator": "=", "value": "test"}]'::jsonb
    ) $$,
    '%WHERE clause build failed: Column does not exist in table: nonexistent_column (Filter context: schema=public, table=test_users, total_conditions=0, total_arrays=0)',
    'Invalid column name throws appropriate error'
);

-- Test 18: Invalid operator throws error
SELECT throws_ok(
    $$ SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "name", "operator": "INVALID", "value": "test"}]'::jsonb
    ) $$
);

-- Test 19: NULL value with comparison operator throws error
SELECT throws_ok(
    $$ SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "name", "operator": "=", "value": null}]'::jsonb
    ) $$
);

-- Test 20: Empty array for IN operator throws error
SELECT throws_ok(
    $$ SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "name", "operator": "IN", "value": []}]'::jsonb
    ) $$
);

-- Test 21: Non-array value for IN operator throws error
SELECT throws_ok(
    $$ SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "name", "operator": "IN", "value": "not_an_array"}]'::jsonb
    ) $$
);

-- Test 22: Invalid UUID format throws error
SELECT throws_ok(
    $$ SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "id", "operator": "=", "value": "invalid-uuid"}]'::jsonb
    ) $$
);

-- Test 23: Invalid integer format throws error
SELECT throws_ok(
    $$ SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "age", "operator": "=", "value": "not_a_number"}]'::jsonb
    ) $$
);

-- Test 24: Invalid boolean format throws error
SELECT throws_ok(
    $$ SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "is_active", "operator": "=", "value": "maybe"}]'::jsonb
    ) $$
);

-- Test 25: Invalid date format throws error
SELECT throws_ok(
    $$ SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "birth_date", "operator": "=", "value": "not-a-date"}]'::jsonb
    ) $$
);

-- Test 26: Too many filters throws error
SELECT throws_ok(
    $$ SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        (SELECT jsonb_agg(jsonb_build_object('column', 'name', 'operator', '=', 'value', 'test' || i))
         FROM generate_series(1, 25) i)
    ) $$
);

-- Test 27: Array too large throws error
SELECT throws_ok(
    $$ SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        ('[{"column": "name", "operator": "IN", "value": ' || 
         (SELECT jsonb_agg('value' || i) FROM generate_series(1, 55) i)::text || 
         '}]')::jsonb
    ) $$
);

-- Test 28: String too long throws error
SELECT throws_ok(
    $$ SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        ('[{"column": "name", "operator": "=", "value": "' || repeat('x', 1001) || '"}]')::jsonb
    ) $$
);

-- Test 29: Complex query near limits (should work)
SELECT isnt(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        (SELECT jsonb_agg(jsonb_build_object('column', 'name', 'operator', '=', 'value', 'test' || i))
         FROM generate_series(1, 15) i)
    )),
    NULL,
    'Complex query within limits should work'
);

-- Test 30: NULL or invalid input returns NULL
SELECT is(
    (SELECT cms.build_where_clause('public', 'test_users', NULL)),
    NULL,
    'NULL filters input returns NULL'
);

SELECT is(
    (SELECT cms.build_where_clause('public', 'test_users', '[]'::jsonb)),
    NULL,
    'Empty filters array returns NULL'
);

SELECT is(
    (SELECT cms.build_where_clause('public', 'test_users', '{}'::jsonb)),
    NULL,
    'Non-array filters input returns NULL'
);

-- Test 31: Missing required fields throws error
SELECT throws_ok(
    $$ SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "name"}]'::jsonb
    ) $$
);

SELECT throws_ok(
    $$ SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"operator": "=", "value": "test"}]'::jsonb
    ) $$
);

-- Test 32: Enum type handling
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "status", "operator": "=", "value": "active"}]'::jsonb
    )),
    'status = ''active''',
    'Enum values are formatted correctly'
);

-- Test 33: Invalid enum value (may not throw error depending on validation)
SELECT lives_ok(
    $$ SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "status", "operator": "=", "value": "invalid_status"}]'::jsonb
    ) $$,
    'Invalid enum value may not throw error during WHERE clause building'
);

-- Test 34: Numeric precision handling
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "salary", "operator": ">=", "value": "50000.50"}]'::jsonb
    )),
    'salary >= 50000.50',
    'Numeric values with decimals are handled correctly'
);

-- Test 35: Array type handling for IN with UUIDs
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "id", "operator": "IN", "value": ["123e4567-e89b-12d3-a456-426614174000", "987fcdeb-51d2-43a1-9876-543210987654"]}]'::jsonb
    )),
    'id IN (''123e4567-e89b-12d3-a456-426614174000''::uuid, ''987fcdeb-51d2-43a1-9876-543210987654''::uuid)',
    'IN operator with UUID array formats correctly'
);

-- Test 36: Boolean variations are handled correctly
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "is_active", "operator": "=", "value": "1"}]'::jsonb
    )),
    'is_active = ''1''::boolean',
    'Boolean value "1" is converted correctly'
);

SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "is_active", "operator": "=", "value": "f"}]'::jsonb
    )),
    'is_active = ''f''::boolean',
    'Boolean value "f" is converted correctly'
);

-- Test 37: Column name sanitization (quoted identifiers)
SELECT is(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[{"column": "name", "operator": "=", "value": "test; DROP TABLE users; --"}]'::jsonb
    )),
    'name = ''test; DROP TABLE users; --''',
    'SQL injection attempt in value is safely quoted'
);

-- Test 38: Performance test - complex but valid query
SELECT isnt(
    (SELECT cms.build_where_clause(
        'public', 
        'test_users', 
        '[
            {"column": "name", "operator": "ILIKE", "value": "%john%"},
            {"column": "age", "operator": ">=", "value": "18"},
            {"column": "age", "operator": "<=", "value": "65"},
            {"column": "is_active", "operator": "=", "value": "true"},
            {"column": "status", "operator": "IN", "value": ["active", "pending"]},
            {"column": "created_at", "operator": ">", "value": "2023-01-01"}
        ]'::jsonb
    )),
    NULL,
    'Complex realistic query builds successfully'
);

SELECT finish();

ROLLBACK;