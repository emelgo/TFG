-- Test file: format_typed_value.test.sql
-- Tests cms.format_typed_value function for proper type formatting and validation
-- This tests the core value formatting logic used in dynamic SQL construction

BEGIN;

-- PymeKit exige MFA en el CMS por defecto (ADR-014); esa regla se prueba en
-- cms-super-admin-root.test.sql. Aquí se valida la lógica funcional con
-- sesiones sin segundo factor, así que se desactiva el requisito de forma
-- explícita. El ROLLBACK final deshace el cambio.
update cms.configuration set value = 'false' where key = 'requires_mfa';

SELECT no_plan();

-- Create test user and account for authentication
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(1), 'admin_user', 'admin@test.com');
INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(1), true);

-- Create test schemas and enum types for schema-qualified testing
CREATE SCHEMA IF NOT EXISTS test_licensing;
CREATE TYPE test_licensing.license_status AS ENUM ('active', 'inactive', 'suspended', 'expired');

CREATE SCHEMA IF NOT EXISTS test_orders;
CREATE TYPE test_orders.order_status AS ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled');

SELECT cms_tests.authenticate_as('admin_user');

-- Test 1: Integer type formatting
SELECT is(
               cms.format_typed_value('123'::jsonb, 'integer'),
               '123',
               'Integer value formats correctly'
       );

SELECT is(
               cms.format_typed_value('-456'::jsonb, 'int4'),
               '-456',
               'Negative integer formats correctly'
       );

SELECT is(
               cms.format_typed_value('0'::jsonb, 'bigint'),
               '0',
               'Zero integer formats correctly'
       );

-- Test 2: Valid integer edge cases
SELECT is(
               cms.format_typed_value('2147483647'::jsonb, 'integer'),
               '2147483647',
               'Maximum integer value formats correctly'
       );

-- Test 3: Numeric/decimal type formatting
SELECT is(
               cms.format_typed_value('123.45'::jsonb, 'numeric'),
               '123.45',
               'Decimal value formats correctly'
       );

SELECT is(
               cms.format_typed_value('1.23e10'::jsonb, 'decimal'),
               '12300000000',
               'Scientific notation expands to regular number'
       );

-- Test 4: Floating point types with special values
SELECT is(
               cms.format_typed_value('123.45'::jsonb, 'real'),
               '123.45::real',
               'Real number formats with cast'
       );

SELECT is(
               cms.format_typed_value('"Infinity"'::jsonb, 'float4'),
               '''Infinity''::float4',
               'Infinity formats correctly for float4'
       );

-- Test 5: Text type formatting with proper quoting
SELECT is(
               cms.format_typed_value('"Hello World"'::jsonb, 'text'),
               '''Hello World''',
               'Text value formats with proper quoting'
       );

SELECT is(
               cms.format_typed_value('"It''s a test"'::jsonb, 'varchar'),
               '''It''''s a test''',
               'Text with apostrophe formats correctly'
       );

-- Test 6: UUID type formatting and validation
SELECT is(
               cms.format_typed_value('"550e8400-e29b-41d4-a716-446655440000"'::jsonb, 'uuid'),
               '''550e8400-e29b-41d4-a716-446655440000''::uuid',
               'Valid UUID formats correctly'
       );

-- Test valid UUID edge cases
SELECT is(
               cms.format_typed_value('"00000000-0000-0000-0000-000000000000"'::jsonb, 'uuid'),
               '''00000000-0000-0000-0000-000000000000''::uuid',
               'Nil UUID formats correctly'
       );

-- Test 7: Boolean type formatting with various input formats
SELECT is(
               cms.format_typed_value('true'::jsonb, 'boolean'),
               'true',
               'Boolean true formats correctly'
       );

SELECT is(
               cms.format_typed_value('"t"'::jsonb, 'boolean'),
               'true',
               'Boolean "t" converts to true'
       );

SELECT is(
               cms.format_typed_value('"1"'::jsonb, 'boolean'),
               'true',
               'Boolean "1" converts to true'
       );

SELECT is(
               cms.format_typed_value('"yes"'::jsonb, 'boolean'),
               'true',
               'Boolean "yes" converts to true'
       );

SELECT throws_ok(
               $$SELECT cms.format_typed_value('"maybe"'::jsonb, 'boolean')$$,
               '22P02',
               'Failed to format value "maybe" for data type "boolean": Invalid boolean value: maybe. Must be true/false, t/f, 1/0, yes/no, y/n, or on/off',
               'Invalid boolean value throws correct error'
       );

-- Test 8: Date and time type formatting
SELECT is(
               cms.format_typed_value('"2023-12-25"'::jsonb, 'date'),
               '''2023-12-25''::date',
               'Date value formats correctly'
       );

SELECT is(
               cms.format_typed_value('"14:30:00"'::jsonb, 'time'),
               '''14:30:00''::time',
               'Time value formats correctly'
       );

SELECT throws_ok(
               $$SELECT cms.format_typed_value('"invalid-date"'::jsonb, 'date')$$,
               '22007',
               'Failed to format value "invalid-date" for data type "date": Invalid date value: invalid-date. Expected format: YYYY-MM-DD',
               'Invalid date format throws correct error'
       );

-- Test 9: JSON and JSONB type formatting
SELECT is(
               cms.format_typed_value('{"key": "value"}'::jsonb, 'json'),
               '''{"key": "value"}''::json',
               'JSON object formats correctly'
       );

SELECT is(
               cms.format_typed_value('[1, 2, 3]'::jsonb, 'jsonb'),
               '''[1, 2, 3]''::jsonb',
               'JSON array formats correctly'
       );

-- Test 10: Array type formatting with udt_name
SELECT is(
               cms.format_typed_value('[1, 2, 3]'::jsonb, 'ARRAY', 'integer'),
               '''[1, 2, 3]''::integer',
               'Integer array formats with base type cast'
       );

-- Test 11: NULL value handling
SELECT is(
               cms.format_typed_value('null'::jsonb, 'integer'),
               'NULL',
               'NULL integer value formats correctly'
       );

SELECT is(
               cms.format_typed_value('null'::jsonb, 'text'),
               'NULL',
               'NULL text value formats correctly'
       );

-- Test 12: Edge cases for numeric ranges
SELECT throws_ok(
               $$SELECT cms.format_typed_value('9999999999999999999999'::jsonb, 'integer')$$,
               '22003',
               'Failed to format value "9999999999999999999999" for data type "integer": Integer value out of range: 9999999999999999999999. Must be between -2147483648 and 2147483647',
               'Integer overflow throws correct error'
       );

-- Test 13: Case insensitive boolean handling
SELECT is(
               cms.format_typed_value('"TRUE"'::jsonb, 'boolean'),
               'true',
               'Boolean "TRUE" (uppercase) converts to true'
       );

-- Test 14: Whitespace handling in values
SELECT is(
               cms.format_typed_value('" 123 "'::jsonb, 'integer'),
               '123',
               'Integer with whitespace trims correctly'
       );

-- Test 15: Scientific notation expansion
SELECT is(
               cms.format_typed_value('1.23456789e-10'::jsonb, 'numeric'),
               '0.000000000123456789',
               'Scientific notation with negative exponent expands correctly'
       );

-- Test 16: Special characters in text
SELECT is(
               cms.format_typed_value('"Hello@World#!"'::jsonb, 'text'),
               '''Hello@World#!''',
               'Text with special characters formats correctly'
       );

-- Test 17: Large numbers and precision
SELECT is(
               cms.format_typed_value('999999999999999999'::jsonb, 'bigint'),
               '999999999999999999',
               'Large bigint value formats correctly'
       );

-- Test 18: Zero values with different types
SELECT is(
               cms.format_typed_value('0'::jsonb, 'real'),
               '0::real',
               'Zero real number formats correctly'
       );

-- Test 19: Complex JSON structures
SELECT is(
               cms.format_typed_value('{"users": [{"id": 1, "active": true}]}'::jsonb, 'jsonb'),
               '''{"users": [{"id": 1, "active": true}]}''::jsonb',
               'Complex nested JSON structure formats correctly'
       );

-- Test 20: Empty arrays
SELECT is(
               cms.format_typed_value('[]'::jsonb, 'ARRAY', 'integer'),
               '''[]''::integer',
               'Empty array formats with base type cast'
       );

-- Test 21: Date edge cases
SELECT is(
               cms.format_typed_value('"2000-02-29"'::jsonb, 'date'),
               '''2000-02-29''::date',
               'Leap year date formats correctly'
       );

SELECT throws_ok(
               $$SELECT cms.format_typed_value('"2023-02-29"'::jsonb, 'date')$$,
               '22007',
               'Failed to format value "2023-02-29" for data type "date": Invalid date value: 2023-02-29. Expected format: YYYY-MM-DD',
               'Invalid leap year date throws correct error'
       );

-- Test 22: Time edge cases
SELECT is(
               cms.format_typed_value('"00:00:00"'::jsonb, 'time'),
               '''00:00:00''::time',
               'Midnight time formats correctly'
       );

-- Test 23: Timestamp with microseconds
SELECT is(
               cms.format_typed_value('"2023-12-25 14:30:00.123456"'::jsonb, 'timestamp'),
               '''2023-12-25 14:30:00.123456''::timestamp',
               'Timestamp with microseconds formats correctly'
       );

-- Test 24: Boolean edge cases
SELECT is(
               cms.format_typed_value('"y"'::jsonb, 'boolean'),
               'true',
               'Boolean "y" converts to true'
       );

SELECT throws_ok(
               $$SELECT cms.format_typed_value('"true false"'::jsonb, 'boolean')$$,
               '22P02',
               'Failed to format value "true false" for data type "boolean": Invalid boolean value: true false. Must be true/false, t/f, 1/0, yes/no, y/n, or on/off',
               'Invalid boolean string throws correct error'
       );

-- Test 25: Numeric precision and scale
SELECT is(
               cms.format_typed_value('0.000000001'::jsonb, 'numeric'),
               '0.000000001',
               'Very small decimal formats correctly'
       );

-- Test 26: Invalid UUID format throws error
SELECT throws_ok(
               $$SELECT cms.format_typed_value('"not-a-valid-uuid"'::jsonb, 'uuid')$$,
               '22P02',
               'Failed to format value "not-a-valid-uuid" for data type "uuid": Invalid UUID format: not-a-valid-uuid. Expected format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
               'Invalid UUID format throws correct error'
       );

-- Test 27: Invalid integer format throws error
SELECT throws_ok(
               $$SELECT cms.format_typed_value('"not-a-number"'::jsonb, 'integer')$$,
               '22P02',
               'Failed to format value "not-a-number" for data type "integer": Invalid integer value: not-a-number. Must be a whole number between -2147483648 and 2147483647',
               'Invalid integer format throws correct error'
       );

-- Test 28: Invalid numeric format throws error
SELECT throws_ok(
               $$SELECT cms.format_typed_value('"abc.def"'::jsonb, 'numeric')$$,
               '22P02',
               'Failed to format value "abc.def" for data type "numeric": Invalid numeric value: abc.def. Must be a valid decimal number',
               'Invalid numeric format throws correct error'
       );

-- Test 29: Empty string handling for non-text types
SELECT is(
               cms.format_typed_value('""'::jsonb, 'integer'),
               'NULL',
               'Empty string for integer type returns NULL'
       );

-- Test 30: User-defined type handling (non-enum case)
-- For non-enum user-defined types, it should just cast with the type name
SELECT is(
               cms.format_typed_value('"some_value"'::jsonb, 'USER-DEFINED', 'custom_type'),
               '''some_value''::custom_type',
               'User-defined type formats with type cast'
       );

-- === NEW TESTS FOR SCHEMA-QUALIFIED ENUM TYPES ===

-- Test 31: Schema-qualified enum with valid value (test_licensing schema)
SELECT is(
               cms.format_typed_value('"active"'::jsonb, 'USER-DEFINED', 'license_status', 'test_licensing'),
               '''active''::test_licensing.license_status',
               'Schema-qualified enum (test_licensing.license_status) formats correctly with valid value'
       );

-- Test 32: Schema-qualified enum with another valid value
SELECT is(
               cms.format_typed_value('"suspended"'::jsonb, 'USER-DEFINED', 'license_status', 'test_licensing'),
               '''suspended''::test_licensing.license_status',
               'Schema-qualified enum formats correctly with different valid value'
       );

-- Test 33: Schema-qualified enum from different schema (test_orders)
SELECT is(
               cms.format_typed_value('"pending"'::jsonb, 'USER-DEFINED', 'order_status', 'test_orders'),
               '''pending''::test_orders.order_status',
               'Schema-qualified enum from different schema formats correctly'
       );

-- Test 34: Schema-qualified enum with invalid value throws proper error
SELECT throws_ok(
               $$SELECT cms.format_typed_value('"invalid_status"'::jsonb, 'USER-DEFINED', 'license_status', 'test_licensing')$$,
               '22023',
               'Failed to format value "invalid_status" for data type "USER-DEFINED": Invalid enum value: invalid_status for type test_licensing.license_status. Valid values are: active, inactive, suspended, expired',
               'Schema-qualified enum with invalid value throws proper error with schema qualification'
       );

-- Test 35: Schema-qualified enum with wrong schema throws error  
SELECT throws_ok(
               $$SELECT cms.format_typed_value('"active"'::jsonb, 'USER-DEFINED', 'license_status', 'nonexistent_schema')$$,
               '3F000',
               'Failed to format value "active" for data type "USER-DEFINED": Schema does not exist: nonexistent_schema',
               'Schema-qualified enum with nonexistent schema throws proper error'
       );

-- Test 36: Unqualified enum (public schema) should still work
set role postgres;
CREATE TYPE public.test_enum AS ENUM ('value1', 'value2', 'value3');

select cms_tests.authenticate_as('admin_user');

SELECT is(
               cms.format_typed_value('"value1"'::jsonb, 'USER-DEFINED', 'test_enum'),
               '''value1''::test_enum',
               'Unqualified enum (public schema) still works without schema parameter'
       );

-- Test 37: When the schema is not specified, the public schema is used
SELECT is(
               cms.format_typed_value('"value2"'::jsonb, 'USER-DEFINED', 'test_enum', 'public'),
               '''value2''::public.test_enum',
               'When the schema is not specified, the public schema is used'
       );

-- Test 38: is_textual_data_type function with schema-qualified enums
SELECT is(
               cms.is_textual_data_type('USER-DEFINED', 'license_status', 'test_licensing'),
               true,
               'is_textual_data_type correctly identifies schema-qualified enum as textual'
       );

-- Test 39: is_textual_data_type with non-enum user-defined type
SELECT is(
               cms.is_textual_data_type('USER-DEFINED', 'some_custom_type', 'test_licensing'),
               false,
               'is_textual_data_type correctly identifies non-enum user-defined type as non-textual'
       );

-- Test 40: Edge case - null schema with enum type name that exists in multiple schemas
-- This should work by finding the first matching enum
SELECT is(
               cms.format_typed_value('"active"'::jsonb, 'USER-DEFINED', 'license_status', NULL),
               '''active''::license_status',
               'NULL schema parameter works for enum lookup'
       );

SELECT finish();

ROLLBACK;