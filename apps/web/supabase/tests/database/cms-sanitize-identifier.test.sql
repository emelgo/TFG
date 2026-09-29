-- Test file: sanitize-identifier.test.sql
-- Tests cms.sanitize_identifier function
-- Validates identifier normalization and security checks

BEGIN;

-- PymeKit exige MFA en el CMS por defecto (ADR-014); esa regla se prueba en
-- cms-super-admin-root.test.sql. Aquí se valida la lógica funcional con
-- sesiones sin segundo factor, así que se desactiva el requisito de forma
-- explícita. El ROLLBACK final deshace el cambio.
update cms.configuration set value = 'false' where key = 'requires_mfa';

SELECT no_plan();

-- =============================================================================
-- TEST SECTION 1: Valid Identifiers
-- =============================================================================

-- Test 1.1: Simple valid identifier
SELECT is(
    cms.sanitize_identifier('ValidTable'),
    'validtable',
    'Simple identifier is normalized to lowercase'
);

-- Test 1.2: Mixed case with numbers
SELECT is(
    cms.sanitize_identifier('User123'),
    'user123',
    'Mixed case identifier with numbers is normalized'
);

-- Test 1.3: Identifier starting with underscore
SELECT is(
    cms.sanitize_identifier('_PrivateTable'),
    '_privatetable',
    'Identifier starting with underscore is valid'
);

-- Test 1.4: Identifier with underscores
SELECT is(
    cms.sanitize_identifier('User_Profile_Data'),
    'user_profile_data',
    'Identifier with underscores is normalized'
);

-- Test 1.5: Single character identifiers
SELECT is(
    cms.sanitize_identifier('A'),
    'a',
    'Single letter identifier is valid'
);

SELECT is(
    cms.sanitize_identifier('_'),
    '_',
    'Single underscore identifier is valid'
);

-- Test 1.6: Maximum length identifier (63 characters)
SELECT is(
    cms.sanitize_identifier('a12345678901234567890123456789012345678901234567890123456789012'),
    'a12345678901234567890123456789012345678901234567890123456789012',
    '63-character identifier is valid'
);

-- =============================================================================
-- TEST SECTION 2: NULL and Empty Input Validation
-- =============================================================================

-- Test 2.1: NULL input returns NULL (STRICT function behavior)
SELECT is(
    cms.sanitize_identifier(NULL),
    NULL,
    'NULL identifier returns NULL due to STRICT function'
);

-- Test 2.2: Empty string should raise exception
SELECT throws_ok(
    $$ SELECT cms.sanitize_identifier('') $$,
    'P0001',
    'Identifier cannot be null or empty',
    'Empty string identifier raises exception'
);

-- Test 2.3: Whitespace-only string should raise exception
SELECT throws_ok(
    $$ SELECT cms.sanitize_identifier('   ') $$,
    'P0001',
    'Identifier cannot be null or empty',
    'Whitespace-only identifier raises exception'
);

-- =============================================================================
-- TEST SECTION 3: Invalid Character Pattern Validation
-- =============================================================================

-- Test 3.1: Identifier starting with number
SELECT throws_ok(
    $$ SELECT cms.sanitize_identifier('123table') $$,
    'P0001',
    'Invalid identifier "123table": must match ^[a-z_][a-z0-9_]{0,62}$',
    'Identifier starting with number raises exception'
);

-- Test 3.2: Identifier with special characters
SELECT throws_ok(
    $$ SELECT cms.sanitize_identifier('user-table') $$,
    'P0001',
    'Invalid identifier "user-table": must match ^[a-z_][a-z0-9_]{0,62}$',
    'Identifier with hyphen raises exception'
);

SELECT throws_ok(
    $$ SELECT cms.sanitize_identifier('user@table') $$,
    'P0001',
    'Invalid identifier "user@table": must match ^[a-z_][a-z0-9_]{0,62}$',
    'Identifier with @ symbol raises exception'
);

SELECT throws_ok(
    $$ SELECT cms.sanitize_identifier('user.table') $$,
    'P0001',
    'Invalid identifier "user.table": must match ^[a-z_][a-z0-9_]{0,62}$',
    'Identifier with dot raises exception'
);

SELECT throws_ok(
    $$ SELECT cms.sanitize_identifier('user table') $$,
    'P0001',
    'Invalid identifier "user table": must match ^[a-z_][a-z0-9_]{0,62}$',
    'Identifier with space raises exception'
);

-- Test 3.3: Identifier with other invalid characters
SELECT throws_ok(
    $$ SELECT cms.sanitize_identifier('user$table') $$,
    'P0001',
    'Invalid identifier "user$table": must match ^[a-z_][a-z0-9_]{0,62}$',
    'Identifier with dollar sign raises exception'
);

SELECT throws_ok(
    $$ SELECT cms.sanitize_identifier('user#table') $$,
    'P0001',
    'Invalid identifier "user#table": must match ^[a-z_][a-z0-9_]{0,62}$',
    'Identifier with hash raises exception'
);

-- =============================================================================
-- TEST SECTION 4: Length Validation
-- =============================================================================

-- Test 4.1: Identifier too long (64 characters)
SELECT throws_ok(
    $$ SELECT cms.sanitize_identifier('a123456789012345678901234567890123456789012345678901234567890123') $$,
    'P0001',
    'Invalid identifier "a123456789012345678901234567890123456789012345678901234567890123": must match ^[a-z_][a-z0-9_]{0,62}$',
    '64-character identifier raises exception'
);

-- Test 4.2: Much longer identifier
SELECT throws_ok(
    $$ SELECT cms.sanitize_identifier('this_is_a_very_long_identifier_name_that_exceeds_the_postgresql_limit_for_identifiers') $$,  
    'P0001',
    'Invalid identifier "this_is_a_very_long_identifier_name_that_exceeds_the_postgresql_limit_for_identifiers": must match ^[a-z_][a-z0-9_]{0,62}$',
    'Very long identifier raises exception'
);

-- =============================================================================
-- TEST SECTION 5: Reserved Keywords Validation
-- =============================================================================

-- Test 5.1: Common reserved keywords should raise exceptions
SELECT throws_ok(
    $$ SELECT cms.sanitize_identifier('SELECT') $$,
    'P0001',
    'Identifier "SELECT": reserved SQL/type/column keyword',
    'Reserved keyword SELECT raises exception'
);

SELECT throws_ok(
    $$ SELECT cms.sanitize_identifier('Table') $$,
    'P0001',
    'Identifier "Table": reserved SQL/type/column keyword',
    'Reserved keyword TABLE raises exception'
);

SELECT throws_ok(
    $$ SELECT cms.sanitize_identifier('WHERE') $$,
    'P0001',
    'Identifier "WHERE": reserved SQL/type/column keyword',
    'Reserved keyword WHERE raises exception'
);

SELECT throws_ok(
    $$ SELECT cms.sanitize_identifier('from') $$,
    'P0001',
    'Identifier "from": reserved SQL/type/column keyword',
    'Reserved keyword FROM raises exception'
);

SELECT throws_ok(
    $$ SELECT cms.sanitize_identifier('ORDER') $$,
    'P0001',
    'Identifier "ORDER": reserved SQL/type/column keyword',
    'Reserved keyword ORDER raises exception'
);

SELECT throws_ok(
    $$ SELECT cms.sanitize_identifier('group') $$,
    'P0001',
    'Identifier "group": reserved SQL/type/column keyword',
    'Reserved keyword GROUP raises exception'
);

-- Test 5.2: Type keywords should raise exceptions
SELECT throws_ok(
    $$ SELECT cms.sanitize_identifier('INT') $$,
    'P0001',
    'Identifier "INT": reserved SQL/type/column keyword',
    'Type keyword INT raises exception'
);

SELECT throws_ok(
    $$ SELECT cms.sanitize_identifier('varchar') $$,
    'P0001',
    'Identifier "varchar": reserved SQL/type/column keyword',  
    'Type keyword VARCHAR raises exception'
);

-- Test 5.3: Column name keywords should raise exceptions  
SELECT throws_ok(
    $$ SELECT cms.sanitize_identifier('user') $$,
    'P0001',
    'Identifier "user": reserved SQL/type/column keyword',
    'Column keyword USER raises exception'
);

-- =============================================================================
-- TEST SECTION 6: Case Sensitivity and Normalization
-- =============================================================================

-- Test 6.1: Different case variations should normalize to same result
SELECT is(
    cms.sanitize_identifier('MyTable'),
    'mytable',
    'MyTable normalizes to lowercase'
);

SELECT is(
    cms.sanitize_identifier('MYTABLE'),
    'mytable', 
    'MYTABLE normalizes to lowercase'
);

SELECT is(
    cms.sanitize_identifier('myTABLE'),
    'mytable',
    'myTABLE normalizes to lowercase'
);

-- Test 6.2: All variations should produce same result
SELECT is(
    cms.sanitize_identifier('User_Profile_123'),
    cms.sanitize_identifier('user_profile_123'),
    'Different case variations produce same result'
);

SELECT is(
    cms.sanitize_identifier('USER_PROFILE_123'),
    cms.sanitize_identifier('user_profile_123'),
    'Uppercase and lowercase produce same result'
);

-- =============================================================================
-- TEST SECTION 7: Edge Cases and Boundary Conditions
-- =============================================================================

-- Test 7.1: Identifiers with leading/trailing underscores
SELECT is(
    cms.sanitize_identifier('_table_'),
    '_table_',
    'Identifier with leading and trailing underscores is valid'
);

-- Test 7.2: Identifiers with multiple consecutive underscores
SELECT is(
    cms.sanitize_identifier('user__table'),
    'user__table',
    'Identifier with consecutive underscores is valid'
);

-- Test 7.3: Boundary case - exactly 63 characters with mixed content
SELECT is(
    cms.sanitize_identifier('_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d01'),
    '_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d01',
    '63-character mixed identifier is valid'
);

-- Test 7.4: Numbers in various positions (but not first)
SELECT is(
    cms.sanitize_identifier('a1b2c3'),
    'a1b2c3',
    'Identifier with numbers in middle is valid'
);

SELECT is(
    cms.sanitize_identifier('table123'),
    'table123',
    'Identifier ending with numbers is valid'
);

-- =============================================================================
-- TEST SECTION 8: Function Properties
-- =============================================================================

-- Test 8.1: Function is IMMUTABLE - same input should always give same output
SELECT is(
    cms.sanitize_identifier('TestTable'),
    cms.sanitize_identifier('TestTable'),
    'Function is immutable - consistent results'
);

-- Test 8.2: Function is STRICT - handles NULL appropriately
-- (Already tested in section 2, but confirming the STRICT behavior)
SELECT is(
    cms.sanitize_identifier(NULL),
    NULL,
    'STRICT function properly handles NULL by returning NULL'
);

-- =============================================================================
-- TEST SECTION 9: Integration with Real-world Scenarios
-- =============================================================================

-- Test 9.1: Common database object names
SELECT is(
    cms.sanitize_identifier('users'),
    'users',
    'Common table name "users" is valid (not reserved in this context)'
);

SELECT is(
    cms.sanitize_identifier('account_id'),
    'account_id',
    'Common column name pattern is valid'
);

SELECT is(
    cms.sanitize_identifier('created_at'),
    'created_at',
    'Timestamp column name is valid'
);

-- Test 9.2: API-style naming conventions
SELECT is(
    cms.sanitize_identifier('user_profiles'),
    'user_profiles',
    'Snake case naming is valid'
);

SELECT is(
    cms.sanitize_identifier('api_keys'),
    'api_keys',
    'API-related naming is valid'
);

-- Test 9.3: Generated identifier patterns
SELECT is(
    cms.sanitize_identifier('tmp_table_123'),
    'tmp_table_123',
    'Temporary table naming pattern is valid'
);

SELECT * FROM finish();
ROLLBACK;
