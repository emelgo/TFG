-- Test file: rbac-hardening.test.sql
-- Regression tests for the RBAC fixes in 20260801154500_dashboard-sharing-and-ownership.sql.
-- Each block names the defect it guards against.

BEGIN;

-- PymeKit exige MFA en el CMS por defecto (ADR-014); esa regla se prueba en
-- cms-super-admin-root.test.sql. Aquí se valida la lógica funcional con
-- sesiones sin segundo factor, así que se desactiva el requisito de forma
-- explícita. El ROLLBACK final deshace el cambio.
update cms.configuration set value = 'false' where key = 'requires_mfa';

SELECT no_plan();

DELETE FROM cms.permission_group_permissions;
DELETE FROM cms.role_permission_groups;
DELETE FROM cms.permission_groups;
DELETE FROM cms.account_roles;
DELETE FROM cms.role_permissions;
DELETE FROM cms.account_permissions;
DELETE FROM cms.dashboard_role_shares;
DELETE FROM cms.dashboard_widgets;
DELETE FROM cms.dashboards;
DELETE FROM cms.audit_logs;
DELETE FROM cms.accounts;
DELETE FROM cms.roles;
DELETE FROM cms.permissions;

SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(1), 'root_user', 'root@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(2), 'mid_admin', 'mid@test.com');
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(3), 'deactivated', 'deactivated@test.com');

INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(1), true),
    (cms_tests.test_uuid(102), cms_tests.test_uuid(2), true),
    (cms_tests.test_uuid(103), cms_tests.test_uuid(3), true);

INSERT INTO cms.roles (id, name, rank, description) VALUES
    (cms_tests.test_uuid(201), 'Root', 100, 'Top of the hierarchy'),
    (cms_tests.test_uuid(202), 'Mid Admin', 50, 'Delegated administrator'),
    (cms_tests.test_uuid(203), 'Low', 10, 'Subordinate role');

INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(101), cms_tests.test_uuid(201)),
    (cms_tests.test_uuid(102), cms_tests.test_uuid(202)),
    (cms_tests.test_uuid(103), cms_tests.test_uuid(203));

INSERT INTO cms.permissions (id, name, permission_type, system_resource, action) VALUES
    (cms_tests.test_uuid(301), 'role_all', 'system', 'role', '*'),
    (cms_tests.test_uuid(302), 'permission_all', 'system', 'permission', '*'),
    (cms_tests.test_uuid(303), 'log_select', 'system', 'log', 'select'),
    (cms_tests.test_uuid(304), 'auth_user_all', 'system', 'auth_user', '*'),
    (cms_tests.test_uuid(305), 'account_all', 'system', 'account', '*');

-- Storage permissions: one narrow, one unbounded.
INSERT INTO cms.permissions (id, name, permission_type, scope, action, metadata) VALUES
    (cms_tests.test_uuid(311), 'storage_narrow', 'data', 'storage', 'select',
     '{"bucket_name": "reports", "path_pattern": "public/*"}'::jsonb),
    (cms_tests.test_uuid(312), 'storage_wildcard', 'data', 'storage', '*',
     '{"bucket_name": "*", "path_pattern": "*"}'::jsonb),
    (cms_tests.test_uuid(313), 'storage_target', 'data', 'storage', 'select',
     '{"bucket_name": "reports", "path_pattern": "public/*"}'::jsonb);

-- The mid admin can manage roles and permissions, and holds only the NARROW storage grant.
INSERT INTO cms.role_permissions (role_id, permission_id) VALUES
    (cms_tests.test_uuid(202), cms_tests.test_uuid(301)),
    (cms_tests.test_uuid(202), cms_tests.test_uuid(302)),
    (cms_tests.test_uuid(202), cms_tests.test_uuid(303)),
    (cms_tests.test_uuid(202), cms_tests.test_uuid(311)),
    (cms_tests.test_uuid(201), cms_tests.test_uuid(303)),
    -- Held only by the subordinate role, so the mid admin out-ranks it and the UPDATE
    -- reaches the reshape trigger rather than being filtered out by the RLS policy.
    (cms_tests.test_uuid(203), cms_tests.test_uuid(313));

-- Root holds the unbounded storage grant, via a permission GROUP rather than a direct
-- role grant -- this is how every shipped seed wires capabilities.
INSERT INTO cms.permission_groups (id, name, description) VALUES
    (cms_tests.test_uuid(401), 'Privileged Group', 'Holds capabilities only Root should have');

INSERT INTO cms.permission_group_permissions (group_id, permission_id) VALUES
    (cms_tests.test_uuid(401), cms_tests.test_uuid(304)),
    (cms_tests.test_uuid(401), cms_tests.test_uuid(312));

INSERT INTO cms.role_permission_groups (role_id, group_id) VALUES
    (cms_tests.test_uuid(201), cms_tests.test_uuid(401));

-- ---------------------------------------------------------------------------
-- C1: deactivation must revoke admin access
-- ---------------------------------------------------------------------------
SELECT cms_tests.authenticate_as('deactivated');

SELECT ok(
    cms.verify_admin_access(),
    'C1: an active admin passes verify_admin_access'
);

-- Deactivate as root, not as the subject: prevent_active_status_update_by_user forbids
-- changing your own active status, and RESET ROLE keeps the JWT claims in place.
SELECT cms_tests.authenticate_as('root_user');
RESET ROLE;
UPDATE cms.accounts SET is_active = false WHERE id = cms_tests.test_uuid(103);
SELECT cms_tests.authenticate_as('deactivated');

SELECT ok(
    NOT cms.verify_admin_access(),
    'C1: a deactivated account fails verify_admin_access even though the JWT claim survives'
);

SELECT cms_tests.authenticate_as('root_user');
RESET ROLE;
UPDATE cms.accounts SET is_active = true WHERE id = cms_tests.test_uuid(103);
SELECT cms_tests.authenticate_as('deactivated');

SELECT ok(
    cms.verify_admin_access(),
    'C1: reactivating restores admin access'
);

-- ---------------------------------------------------------------------------
-- C3: the rank ceiling must see group-held and directly-granted permissions,
--     not just role_permissions
-- ---------------------------------------------------------------------------
SELECT cms_tests.authenticate_as('mid_admin');

SELECT ok(
    NOT cms.can_modify_permission(cms_tests.test_uuid(304), 'update'),
    'C3: a permission held only through a Root-bound permission group is not modifiable by a lower rank'
);

SELECT ok(
    NOT cms.can_modify_permission(cms_tests.test_uuid(312), 'update'),
    'C3: the group-held wildcard storage permission is likewise protected'
);

SELECT ok(
    cms.can_modify_permission(cms_tests.test_uuid(311), 'update'),
    'C3: a permission held by the caller''s own role is modifiable, since they hold it'
);

SELECT ok(
    cms.can_modify_permission(cms_tests.test_uuid(313), 'update'),
    'C3: a permission held only by a strictly lower role is modifiable'
);

-- Equal rank alone is not enough. Ranks are unique per role, so the only way to
-- reach the ceiling without holding the permission is a direct grant to another
-- account carrying the same role.
RESET ROLE;
SELECT cms_tests.create_supabase_user(cms_tests.test_uuid(4), 'peer_admin', 'peer@test.com');

INSERT INTO cms.accounts (id, auth_user_id, is_active) VALUES
    (cms_tests.test_uuid(104), cms_tests.test_uuid(4), true);

INSERT INTO cms.account_roles (account_id, role_id) VALUES
    (cms_tests.test_uuid(104), cms_tests.test_uuid(202));

INSERT INTO cms.permissions (id, name, permission_type, system_resource, action) VALUES
    (cms_tests.test_uuid(314), 'peer_only', 'system', 'account', 'update');

INSERT INTO cms.account_permissions (account_id, permission_id, is_grant) VALUES
    (cms_tests.test_uuid(104), cms_tests.test_uuid(314), true);
SELECT cms_tests.authenticate_as('mid_admin');

SELECT ok(
    NOT cms.can_modify_permission(cms_tests.test_uuid(314), 'update'),
    'C3: a peer-ranked capability the caller does not hold stays out of reach'
);

-- Direct account grants also raise the ceiling.
RESET ROLE;
INSERT INTO cms.account_permissions (account_id, permission_id, is_grant)
VALUES (cms_tests.test_uuid(101), cms_tests.test_uuid(305), true);
SELECT cms_tests.authenticate_as('mid_admin');

SELECT ok(
    NOT cms.can_modify_permission(cms_tests.test_uuid(305), 'update'),
    'C3: a permission granted directly to a higher-ranked account is not modifiable'
);

-- ---------------------------------------------------------------------------
-- C4: a storage permission may not be reshaped into a capability the caller lacks
-- ---------------------------------------------------------------------------
SELECT ok(
    NOT cms.storage_capability_is_grantable('select', '*', '*'),
    'C4: holding a narrow storage grant does not make the wildcard capability grantable'
);

SELECT ok(
    NOT cms.storage_capability_is_grantable('select', 'secrets', 'public/*'),
    'C4: a different bucket is not grantable'
);

SELECT ok(
    cms.storage_capability_is_grantable('select', 'reports', 'public/*'),
    'C4: the exact capability the caller holds is grantable'
);

-- The trigger must fire on a metadata-only edit: for storage, metadata IS the capability.
SELECT throws_ok(
    $$ UPDATE cms.permissions
       SET metadata = '{"bucket_name": "*", "path_pattern": "*"}'::jsonb
       WHERE id = '00000000-0000-0000-0000-000000000313' $$,
    '42501',
    NULL,
    'C4: widening a storage permission to bucket * / path * is rejected'
);

-- ---------------------------------------------------------------------------
-- C5: binding a permission group to a role must check the group's contents
-- ---------------------------------------------------------------------------
SELECT ok(
    NOT cms.can_grant_permission_group(cms_tests.test_uuid(401)),
    'C5: a group containing capabilities the caller lacks is not grantable'
);

SELECT throws_ok(
    $$ INSERT INTO cms.role_permission_groups (role_id, group_id)
       VALUES ('00000000-0000-0000-0000-000000000203',
               '00000000-0000-0000-0000-000000000401') $$,
    '42501',
    NULL,
    'C5: binding a privileged group to a subordinate role is rejected'
);

-- A group holding only capabilities the caller already has is fine.
RESET ROLE;
INSERT INTO cms.permission_groups (id, name, description) VALUES
    (cms_tests.test_uuid(402), 'Benign Group', 'Only capabilities the mid admin holds');

INSERT INTO cms.permission_group_permissions (group_id, permission_id) VALUES
    (cms_tests.test_uuid(402), cms_tests.test_uuid(303));
SELECT cms_tests.authenticate_as('mid_admin');

SELECT ok(
    cms.can_grant_permission_group(cms_tests.test_uuid(402)),
    'C5: a group whose contents the caller already holds is grantable'
);

-- ---------------------------------------------------------------------------
-- C6: can_read_audit_log must not fall through to `return true` on a NULL rank
-- ---------------------------------------------------------------------------
SELECT ok(
    NOT cms.can_read_audit_log(NULL),
    'C6: an orphaned audit row (NULL account_id) is not readable below the top rank'
);

SELECT ok(
    cms.can_read_audit_log(cms_tests.test_uuid(103)),
    'C6: a lower-ranked subject remains readable'
);

SELECT ok(
    NOT cms.can_read_audit_log(cms_tests.test_uuid(101)),
    'C6: a higher-ranked subject is not readable'
);

SELECT cms_tests.authenticate_as('root_user');

SELECT ok(
    cms.can_read_audit_log(NULL),
    'C6: the top of the hierarchy can still read orphaned audit rows'
);

-- ---------------------------------------------------------------------------
-- C2: grant_admin_access must rank-check an existing account
-- ---------------------------------------------------------------------------
SELECT cms_tests.authenticate_as('mid_admin');

RESET ROLE;
INSERT INTO cms.role_permissions (role_id, permission_id) VALUES
    (cms_tests.test_uuid(202), cms_tests.test_uuid(305));

UPDATE cms.accounts SET is_active = false WHERE id = cms_tests.test_uuid(101);
SELECT cms_tests.authenticate_as('mid_admin');

SELECT is(
    (cms.grant_admin_access(cms_tests.test_uuid(1)))->>'success',
    'false',
    'C2: a lower-ranked admin cannot reactivate a higher-ranked account'
);

SELECT is(
    (SELECT is_active::text FROM cms.accounts WHERE id = cms_tests.test_uuid(101)),
    'false',
    'C2: the higher-ranked account stays deactivated'
);

SELECT is(
    (cms.grant_admin_access(cms_tests.test_uuid(3)))->>'success',
    'true',
    'C2: a lower-ranked account can still be granted admin access'
);

SELECT finish();

ROLLBACK;
