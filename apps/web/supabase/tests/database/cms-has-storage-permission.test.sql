-- Test file: has_storage_permission.test.sql
-- Tests cms.has_storage_permission function through actual operations
-- This tests storage permission management through RLS policies and business rules

BEGIN;

-- PymeKit exige MFA en el CMS por defecto (ADR-014); esa regla se prueba en
-- cms-super-admin-root.test.sql. Aquí se valida la lógica funcional con
-- sesiones sin segundo factor, así que se desactiva el requisito de forma
-- explícita. El ROLLBACK final deshace el cambio.
update cms.configuration set value = 'false' where key = 'requires_mfa';

SELECT no_plan();

-- Clean up any existing test data
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
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(1), 'storage_admin', 'storageadmin@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(2), 'user_uploader', 'useruploader@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(3), 'no_storage_user', 'nostorage@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(4), 'bucket_user', 'bucketuser@test.com');

-- Create accounts
INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(1), true),  -- Storage Admin account
    (cms_tests.test_uuid(102), cms_tests.test_uuid(2), true),  -- User Uploader account  
    (cms_tests.test_uuid(103), cms_tests.test_uuid(3), true),  -- No Storage User account
    (cms_tests.test_uuid(104), cms_tests.test_uuid(4), true);  -- Bucket User account

-- Create roles with different priorities
INSERT INTO cms.roles (id, name, rank, description) VALUES
    (cms_tests.test_uuid(201), 'Storage Admin', 90, 'Full storage administration role'),
    (cms_tests.test_uuid(202), 'User Uploader', 30, 'User-specific upload role'),
    (cms_tests.test_uuid(203), 'No Storage', 10, 'Role with no storage permissions'),
    (cms_tests.test_uuid(204), 'Bucket User', 40, 'Bucket-specific access role');

-- Create storage permissions for testing
INSERT INTO cms.permissions (id, name, permission_type, scope, action, metadata) VALUES
    -- Full storage admin permissions
    (cms_tests.test_uuid(301), 'storage_all_buckets_all', 'data', 'storage', '*', '{"bucket_name": "*", "path_pattern": "*"}'),
    -- User-specific upload permissions
    (cms_tests.test_uuid(302), 'storage_user_uploads_insert', 'data', 'storage', 'insert', '{"bucket_name": "user-uploads", "path_pattern": "users/{{user_id}}/*"}'),
    (cms_tests.test_uuid(303), 'storage_user_uploads_select', 'data', 'storage', 'select', '{"bucket_name": "user-uploads", "path_pattern": "users/{{user_id}}/*"}'),
    (cms_tests.test_uuid(304), 'storage_user_uploads_update', 'data', 'storage', 'update', '{"bucket_name": "user-uploads", "path_pattern": "users/{{user_id}}/*"}'),
    (cms_tests.test_uuid(305), 'storage_user_uploads_delete', 'data', 'storage', 'delete', '{"bucket_name": "user-uploads", "path_pattern": "users/{{user_id}}/*"}'),
    -- Account-specific permissions
    (cms_tests.test_uuid(306), 'storage_account_files_select', 'data', 'storage', 'select', '{"bucket_name": "account-files", "path_pattern": "accounts/{{account_id}}/*"}'),
    -- Bucket-specific permissions
    (cms_tests.test_uuid(307), 'storage_public_bucket_select', 'data', 'storage', 'select', '{"bucket_name": "public-files", "path_pattern": "*"}'),
    (cms_tests.test_uuid(308), 'storage_public_bucket_insert', 'data', 'storage', 'insert', '{"bucket_name": "public-files", "path_pattern": "uploads/*"}'),
    -- Wildcard bucket permissions
    (cms_tests.test_uuid(309), 'storage_all_buckets_select', 'data', 'storage', 'select', '{"bucket_name": "*", "path_pattern": "public/*"}');

-- Assign roles to accounts
INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(201)),  -- Storage Admin
    (cms_tests.test_uuid(102), cms_tests.test_uuid(202)),  -- User Uploader
    (cms_tests.test_uuid(103), cms_tests.test_uuid(203)),  -- No Storage User
    (cms_tests.test_uuid(104), cms_tests.test_uuid(204));  -- Bucket User

-- Grant permissions to roles
INSERT INTO cms.role_permissions (role_id, permission_id) VALUES
    -- Storage Admin gets full permissions
    (cms_tests.test_uuid(201), cms_tests.test_uuid(301)),  -- All buckets, all actions
    -- User Uploader gets user-specific permissions
    (cms_tests.test_uuid(202), cms_tests.test_uuid(302)),  -- user-uploads insert
    (cms_tests.test_uuid(202), cms_tests.test_uuid(303)),  -- user-uploads select
    (cms_tests.test_uuid(202), cms_tests.test_uuid(304)),  -- user-uploads update
    (cms_tests.test_uuid(202), cms_tests.test_uuid(305)),  -- user-uploads delete
    (cms_tests.test_uuid(202), cms_tests.test_uuid(306)),  -- account-files select
    -- Bucket User gets bucket-specific permissions
    (cms_tests.test_uuid(204), cms_tests.test_uuid(307)),  -- public-files select
    (cms_tests.test_uuid(204), cms_tests.test_uuid(308)),  -- public-files insert (uploads/*)
    (cms_tests.test_uuid(204), cms_tests.test_uuid(309));  -- all buckets select (public/*)

-- Test 1: User without admin access cannot use has_storage_permission
SELECT cms_tests.authenticate_as('no_storage_user');
SELECT cms_tests.set_admin_access('nostorage@test.com', 'false');

SELECT is(
    (SELECT cms.has_storage_permission('user-uploads', 'select'::cms.system_action, 'users/123/file.jpg')),
    false,
    'User without admin access cannot use has_storage_permission'
);

-- Restore admin access for remaining tests
SELECT cms_tests.set_admin_access('nostorage@test.com', 'true');

-- Test 2: Storage Admin can access all buckets and paths
SELECT cms_tests.authenticate_as('storage_admin');

SELECT is(
    (SELECT cms.has_storage_permission('user-uploads', 'select'::cms.system_action, 'users/123/file.jpg')),
    true,
    'Storage Admin can select from any bucket and path'
);

SELECT is(
    (SELECT cms.has_storage_permission('user-uploads', 'insert'::cms.system_action, 'users/456/file.pdf')),
    true,
    'Storage Admin can insert to any bucket and path'
);

SELECT is(
    (SELECT cms.has_storage_permission('private-bucket', 'delete'::cms.system_action, 'sensitive/data.txt')),
    true,
    'Storage Admin can delete from any bucket and path'
);

SELECT is(
    (SELECT cms.has_storage_permission('any-bucket', 'update'::cms.system_action, 'any/path/file.doc')),
    true,
    'Storage Admin can update any file in any bucket'
);

-- Test 3: User Uploader can access user-specific paths
SELECT cms_tests.authenticate_as('user_uploader');

-- User can access their own user ID path
SELECT is(
    (SELECT cms.has_storage_permission('user-uploads', 'select'::cms.system_action, 'users/' || cms_tests.test_uuid(2)::text || '/file.jpg')),
    true,
    'User Uploader can select from their own user path'
);

SELECT is(
    (SELECT cms.has_storage_permission('user-uploads', 'insert'::cms.system_action, 'users/' || cms_tests.test_uuid(2)::text || '/document.pdf')),
    true,
    'User Uploader can insert to their own user path'
);

SELECT is(
    (SELECT cms.has_storage_permission('user-uploads', 'update'::cms.system_action, 'users/' || cms_tests.test_uuid(2)::text || '/image.png')),
    true,
    'User Uploader can update files in their own user path'
);

SELECT is(
    (SELECT cms.has_storage_permission('user-uploads', 'delete'::cms.system_action, 'users/' || cms_tests.test_uuid(2)::text || '/old-file.txt')),
    true,
    'User Uploader can delete files from their own user path'
);

-- Test 4: User Uploader can access account-specific paths
SELECT is(
    (SELECT cms.has_storage_permission('account-files', 'select'::cms.system_action, 'accounts/' || cms_tests.test_uuid(102)::text || '/report.pdf')),
    true,
    'User Uploader can select from their own account path'
);

-- Test 5: User Uploader cannot access other users' paths
SELECT is(
    (SELECT cms.has_storage_permission('user-uploads', 'select'::cms.system_action, 'users/' || cms_tests.test_uuid(1)::text || '/file.jpg')),
    false,
    'User Uploader cannot select from other users paths'
);

SELECT is(
    (SELECT cms.has_storage_permission('user-uploads', 'insert'::cms.system_action, 'users/' || cms_tests.test_uuid(3)::text || '/file.jpg')),
    false,
    'User Uploader cannot insert to other users paths'
);

-- Test 6: User Uploader cannot access wrong bucket
SELECT is(
    (SELECT cms.has_storage_permission('wrong-bucket', 'select'::cms.system_action, 'users/' || cms_tests.test_uuid(2)::text || '/file.jpg')),
    false,
    'User Uploader cannot access wrong bucket even with correct path'
);

-- Test 7: User Uploader cannot access account files they don't own
SELECT is(
    (SELECT cms.has_storage_permission('account-files', 'select'::cms.system_action, 'accounts/' || cms_tests.test_uuid(101)::text || '/report.pdf')),
    false,
    'User Uploader cannot access other accounts files'
);

-- Test 8: Bucket User has bucket-specific permissions
SELECT cms_tests.authenticate_as('bucket_user');

SELECT is(
    (SELECT cms.has_storage_permission('public-files', 'select'::cms.system_action, 'any/path/file.jpg')),
    true,
    'Bucket User can select from public-files bucket'
);

SELECT is(
    (SELECT cms.has_storage_permission('public-files', 'insert'::cms.system_action, 'uploads/new-file.pdf')),
    true,
    'Bucket User can insert to uploads path in public-files'
);

-- Test 9: Bucket User cannot insert outside allowed path pattern
SELECT is(
    (SELECT cms.has_storage_permission('public-files', 'insert'::cms.system_action, 'restricted/file.pdf')),
    false,
    'Bucket User cannot insert outside uploads path pattern'
);

-- Test 10: Bucket User can access public paths via wildcard permission
SELECT is(
    (SELECT cms.has_storage_permission('any-bucket', 'select'::cms.system_action, 'public/shared-file.jpg')),
    true,
    'Bucket User can select public paths from any bucket via wildcard'
);

SELECT is(
    (SELECT cms.has_storage_permission('user-uploads', 'select'::cms.system_action, 'public/announcement.pdf')),
    true,
    'Bucket User can select public paths from user-uploads via wildcard'
);

-- Test 11: Bucket User cannot access non-public paths via wildcard
SELECT is(
    (SELECT cms.has_storage_permission('any-bucket', 'select'::cms.system_action, 'private/secret.txt')),
    false,
    'Bucket User cannot access non-public paths via wildcard'
);

-- Test 12: No Storage User has no permissions
SELECT cms_tests.authenticate_as('no_storage_user');

SELECT is(
    (SELECT cms.has_storage_permission('user-uploads', 'select'::cms.system_action, 'users/123/file.jpg')),
    false,
    'No Storage User cannot select from any bucket'
);

SELECT is(
    (SELECT cms.has_storage_permission('public-files', 'select'::cms.system_action, 'public/file.jpg')),
    false,
    'No Storage User cannot select even from public paths'
);

-- Test 13: Invalid parameters return false
SELECT cms_tests.authenticate_as('storage_admin');

SELECT is(
    (SELECT cms.has_storage_permission(NULL, 'select'::cms.system_action, 'users/123/file.jpg')),
    false,
    'Function returns false for NULL bucket name'
);

SELECT is(
    (SELECT cms.has_storage_permission('user-uploads', 'select'::cms.system_action, NULL)),
    false,
    'Function returns false for NULL object path'
);

-- Test 14: Empty string parameters return false
SELECT is(
    (SELECT cms.has_storage_permission('', 'select'::cms.system_action, 'users/123/file.jpg')),
    false,
    'Function returns false for empty bucket name'
);

SELECT is(
    (SELECT cms.has_storage_permission('user-uploads', 'select'::cms.system_action, '')),
    false,
    'Function returns false for empty object path'
);

-- Test 15: Function respects role assignment validity
SET ROLE postgres;

-- Remove constraint to allow invalid role assignment
ALTER TABLE cms.account_roles DROP CONSTRAINT valid_time_range;

UPDATE cms.account_roles 
SET valid_until = now() - interval '1 second'
WHERE account_id = cms_tests.test_uuid(102);

SELECT cms_tests.authenticate_as('user_uploader');

SELECT is(
    (SELECT cms.has_storage_permission('user-uploads', 'select'::cms.system_action, 'users/' || cms_tests.test_uuid(2)::text || '/file.jpg')),
    false,
    'User Uploader loses permissions when role assignment expires'
);

-- Restore role assignment
SET ROLE postgres;

UPDATE cms.account_roles 
SET valid_until = NULL
WHERE account_id = cms_tests.test_uuid(102);

-- Test 16: Function respects permission validity
-- Expire a permission and verify it's no longer accessible
ALTER TABLE cms.role_permissions DROP CONSTRAINT valid_time_range;

UPDATE cms.role_permissions 
SET valid_until = now() - interval '1 second'
WHERE role_id = cms_tests.test_uuid(202) AND permission_id = cms_tests.test_uuid(302);

SELECT cms_tests.authenticate_as('user_uploader');

SELECT is(
    (SELECT cms.has_storage_permission('user-uploads', 'insert'::cms.system_action, 'users/' || cms_tests.test_uuid(2)::text || '/file.jpg')),
    false,
    'User Uploader loses insert permission when it expires'
);

-- But other permissions should still work
SELECT is(
    (SELECT cms.has_storage_permission('user-uploads', 'select'::cms.system_action, 'users/' || cms_tests.test_uuid(2)::text || '/file.jpg')),
    true,
    'User Uploader retains other valid permissions'
);

-- Restore permission
UPDATE cms.role_permissions 
SET valid_until = NULL
WHERE role_id = cms_tests.test_uuid(202) AND permission_id = cms_tests.test_uuid(302);

-- Test 17: Path pattern matching with nested directories
SELECT cms_tests.authenticate_as('user_uploader');

SELECT is(
    (SELECT cms.has_storage_permission('user-uploads', 'select'::cms.system_action, 'users/' || cms_tests.test_uuid(2)::text || '/documents/subfolder/file.pdf')),
    true,
    'User can access nested directories within their path pattern'
);

SELECT is(
    (SELECT cms.has_storage_permission('user-uploads', 'select'::cms.system_action, 'users/' || cms_tests.test_uuid(2)::text || '/images/profile/avatar.jpg')),
    true,
    'User can access deeply nested directories within their path pattern'
);

-- Test 18: Case sensitivity for bucket names and paths
SELECT cms_tests.authenticate_as('bucket_user');

SELECT is(
    (SELECT cms.has_storage_permission('PUBLIC-FILES', 'select'::cms.system_action, 'any/path/file.jpg')),
    false,
    'Function is case sensitive for bucket names'
);

SELECT is(
    (SELECT cms.has_storage_permission('public-files', 'select'::cms.system_action, 'PUBLIC/file.jpg')),
    true,
    'Function is case insensitive for path patterns'
);

-- Test 19: Multiple valid permission paths
SET ROLE postgres;

-- Create an additional permission that would also grant access
INSERT INTO cms.permissions (id, name, permission_type, scope, action, metadata) VALUES
    (cms_tests.test_uuid(310), 'alternate_user_uploads_select', 'data', 'storage', 'select', ('{"bucket_name": "user-uploads", "path_pattern": "users/' || cms_tests.test_uuid(2)::text || '/*"}')::jsonb);

INSERT INTO cms.role_permissions (role_id, permission_id) VALUES
    (cms_tests.test_uuid(202), cms_tests.test_uuid(310));

SELECT cms_tests.authenticate_as('user_uploader');

SELECT is(
    (SELECT cms.has_storage_permission('user-uploads', 'select'::cms.system_action, 'users/' || cms_tests.test_uuid(2)::text || '/file.jpg')),
    true,
    'User has access via multiple permission paths'
);

-- Test 20: Complex path patterns with mixed variables
SET ROLE postgres;

-- Create permission with mixed variable substitution
INSERT INTO cms.permissions (id, name, permission_type, scope, action, metadata) VALUES
    (cms_tests.test_uuid(311), 'mixed_pattern_permission', 'data', 'storage', 'select', '{"bucket_name": "mixed-bucket", "path_pattern": "users/{{user_id}}/accounts/{{account_id}}/files/*"}'::jsonb);

INSERT INTO cms.role_permissions (role_id, permission_id) VALUES
    (cms_tests.test_uuid(202), cms_tests.test_uuid(311));

SELECT cms_tests.authenticate_as('user_uploader');

SELECT is(
    (SELECT cms.has_storage_permission('mixed-bucket', 'select'::cms.system_action, 'users/' || cms_tests.test_uuid(2)::text || '/accounts/' || cms_tests.test_uuid(102)::text || '/files/document.pdf')),
    true,
    'User can access files with mixed variable substitution in path pattern'
);

SELECT is(
    (SELECT cms.has_storage_permission('mixed-bucket', 'select'::cms.system_action, 'users/' || cms_tests.test_uuid(1)::text || '/accounts/' || cms_tests.test_uuid(102)::text || '/files/document.pdf')),
    false,
    'User cannot access files with wrong user_id in mixed pattern'
);

SELECT is(
    (SELECT cms.has_storage_permission('mixed-bucket', 'select'::cms.system_action, 'users/' || cms_tests.test_uuid(2)::text || '/accounts/' || cms_tests.test_uuid(101)::text || '/files/document.pdf')),
    false,
    'User cannot access files with wrong account_id in mixed pattern'
);

SELECT finish();

ROLLBACK;