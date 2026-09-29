-- Test suite for audit logging triggers on permissions, roles, and permission groups

BEGIN;

-- PymeKit exige MFA en el CMS por defecto (ADR-014); esa regla se prueba en
-- cms-super-admin-root.test.sql. Aquí se valida la lógica funcional con
-- sesiones sin segundo factor, así que se desactiva el requisito de forma
-- explícita. El ROLLBACK final deshace el cambio.
update cms.configuration set value = 'false' where key = 'requires_mfa';

-- Setup test data
INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, role)
VALUES 
  ('01234567-89ab-cdef-0123-456789abcdef', 'test@example.com', NOW(), NOW(), NOW(), 
   '{"cms_access": true, "provider": "email", "providers": ["email"]}'::jsonb,
   '{}'::jsonb, false, 'authenticated');

INSERT INTO cms.accounts (id, auth_user_id, created_at, updated_at, is_active, metadata, preferences)
VALUES 
  ('01234567-89ab-cdef-0123-456789abcdef', '01234567-89ab-cdef-0123-456789abcdef', NOW(), NOW(), true, 
   '{"username": "testuser", "picture_url": ""}'::jsonb, 
   '{"timezone": "UTC", "language": "en-US"}'::jsonb);

-- Set up the session to simulate authenticated user
SELECT set_config('request.jwt.claims', '{"sub": "01234567-89ab-cdef-0123-456789abcdef", "aal": "aal1", "app_metadata": {"cms_access": true}}', true);

-- Test 1: Audit logging for roles table
SELECT plan(15);

-- Clear existing audit logs
DELETE FROM cms.audit_logs;

-- Test role INSERT audit logging
INSERT INTO cms.roles (id, name, description, rank) 
VALUES ('11111111-1111-1111-1111-111111111111', 'Test Role', 'A test role', 99);

SELECT ok(
  (SELECT COUNT(*) FROM cms.audit_logs WHERE table_name = 'roles' AND operation = 'INSERT') = 1,
  'Role INSERT operation should create audit log'
);

SELECT ok(
  (SELECT record_id FROM cms.audit_logs WHERE table_name = 'roles' AND operation = 'INSERT') = '11111111-1111-1111-1111-111111111111',
  'Role INSERT audit log should have correct record_id'
);

SELECT ok(
  (SELECT new_data->>'name' FROM cms.audit_logs WHERE table_name = 'roles' AND operation = 'INSERT') = 'Test Role',
  'Role INSERT audit log should contain new_data'
);

-- Test role UPDATE audit logging
UPDATE cms.roles SET description = 'Updated test role' WHERE id = '11111111-1111-1111-1111-111111111111';

SELECT ok(
  (SELECT COUNT(*) FROM cms.audit_logs WHERE table_name = 'roles' AND operation = 'UPDATE') = 1,
  'Role UPDATE operation should create audit log'
);

SELECT ok(
  (SELECT old_data->>'description' FROM cms.audit_logs WHERE table_name = 'roles' AND operation = 'UPDATE') = 'A test role',
  'Role UPDATE audit log should contain old_data'
);

SELECT ok(
  (SELECT new_data->>'description' FROM cms.audit_logs WHERE table_name = 'roles' AND operation = 'UPDATE') = 'Updated test role',
  'Role UPDATE audit log should contain new_data'
);

-- Test role DELETE audit logging
DELETE FROM cms.roles WHERE id = '11111111-1111-1111-1111-111111111111';

SELECT ok(
  (SELECT COUNT(*) FROM cms.audit_logs WHERE table_name = 'roles' AND operation = 'DELETE') = 1,
  'Role DELETE operation should create audit log'
);

SELECT ok(
  (SELECT old_data->>'name' FROM cms.audit_logs WHERE table_name = 'roles' AND operation = 'DELETE') = 'Test Role',
  'Role DELETE audit log should contain old_data'
);

-- Test 2: Audit logging for permissions table
DELETE FROM cms.audit_logs;

INSERT INTO cms.permissions (id, name, description, permission_type, system_resource, action) 
VALUES ('22222222-2222-2222-2222-222222222222', 'test_permission', 'Test permission', 'system', 'account', 'select');

SELECT ok(
  (SELECT COUNT(*) FROM cms.audit_logs WHERE table_name = 'permissions' AND operation = 'INSERT') = 1,
  'Permission INSERT operation should create audit log'
);

SELECT ok(
  (SELECT new_data->>'name' FROM cms.audit_logs WHERE table_name = 'permissions' AND operation = 'INSERT') = 'test_permission',
  'Permission INSERT audit log should contain new_data'
);

-- Test 3: Audit logging for permission_groups table
DELETE FROM cms.audit_logs;

INSERT INTO cms.permission_groups (id, name, description, created_by) 
VALUES ('33333333-3333-3333-3333-333333333333', 'Test Group', 'A test permission group', '01234567-89ab-cdef-0123-456789abcdef');

SELECT ok(
  (SELECT COUNT(*) FROM cms.audit_logs WHERE table_name = 'permission_groups' AND operation = 'INSERT') = 1,
  'Permission group INSERT operation should create audit log'
);

SELECT ok(
  (SELECT new_data->>'name' FROM cms.audit_logs WHERE table_name = 'permission_groups' AND operation = 'INSERT') = 'Test Group',
  'Permission group INSERT audit log should contain new_data'
);

-- Test 4: Audit logging for composite primary key tables (account_roles)
DELETE FROM cms.audit_logs;

-- First create a role for testing
INSERT INTO cms.roles (id, name, description, rank) 
VALUES ('44444444-4444-4444-4444-444444444444', 'Test Role 2', 'Another test role', 98);

-- Clear audit logs again to focus on account_roles
DELETE FROM cms.audit_logs;

INSERT INTO cms.account_roles (account_id, role_id) 
VALUES ('01234567-89ab-cdef-0123-456789abcdef', '44444444-4444-4444-4444-444444444444');

SELECT ok(
  (SELECT COUNT(*) FROM cms.audit_logs WHERE table_name = 'account_roles' AND operation = 'INSERT') = 1,
  'Account role INSERT operation should create audit log'
);

SELECT ok(
  (SELECT record_id FROM cms.audit_logs WHERE table_name = 'account_roles' AND operation = 'INSERT') = '01234567-89ab-cdef-0123-456789abcdef|44444444-4444-4444-4444-444444444444',
  'Account role INSERT audit log should have composite record_id'
);

-- Test 5: Verify metadata is properly logged
SELECT ok(
  (SELECT metadata->>'trigger_name' FROM cms.audit_logs WHERE table_name = 'account_roles' AND operation = 'INSERT') IS NOT NULL,
  'Audit log should contain trigger metadata'
);

-- Cleanup is handled by transaction ROLLBACK

SELECT * FROM finish();

ROLLBACK;