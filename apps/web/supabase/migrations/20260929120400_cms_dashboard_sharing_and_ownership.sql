-- Dashboard sharing rank enforcement and ownership retention.
--
-- 1. The rank ceiling on sharing never ran: the sharing functions are SECURITY
--    DEFINER owned by the table owner, and RLS was enabled but not FORCED, so
--    the manage_shares WITH CHECK was skipped. The one check that did run was
--    fail-open, since get_user_max_role_rank returns NULL for a role-less
--    account and a NULL IF condition takes the ELSE branch.
-- 2. dashboards.created_by cascaded through accounts to auth.users, so deleting
--    a user destroyed every dashboard they had created, including shared ones.

ALTER TABLE cms.dashboard_role_shares FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manage_shares ON cms.dashboard_role_shares;

CREATE POLICY manage_shares ON cms.dashboard_role_shares FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM cms.dashboards d
    WHERE d.id = dashboard_role_shares.dashboard_id
    AND d.created_by = cms.get_current_user_account_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM cms.dashboards d
    WHERE d.id = dashboard_role_shares.dashboard_id
    AND d.created_by = cms.get_current_user_account_id()
  )
  AND COALESCE(
    (
      SELECT r.rank
      FROM cms.roles r
      WHERE r.id = dashboard_role_shares.role_id
    ) < cms.get_user_max_role_rank(cms.get_current_user_account_id()),
    FALSE
  )
);

CREATE OR REPLACE FUNCTION cms.share_dashboard_with_role(
  p_dashboard_id UUID,
  p_role_id UUID,
  p_permission_level cms.dashboard_permission_level DEFAULT 'view'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_user_id UUID;
  v_current_priority INT;
  v_target_priority INT;
  v_result cms.dashboard_role_shares;
BEGIN
  IF NOT cms.verify_admin_access() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_current_user_id := cms.get_current_user_account_id();

  IF NOT EXISTS (
    SELECT 1 FROM cms.dashboards
    WHERE id = p_dashboard_id AND created_by = v_current_user_id
  ) THEN
    RAISE EXCEPTION 'Dashboard not found or you do not own it';
  END IF;

  -- Fails closed: a NULL on either side rejects the share.
  v_current_priority := cms.get_user_max_role_rank(v_current_user_id);
  SELECT rank INTO v_target_priority FROM cms.roles WHERE id = p_role_id;

  IF COALESCE(v_current_priority <= v_target_priority, TRUE) THEN
    RAISE EXCEPTION 'Cannot share with equal or higher priority roles';
  END IF;

  INSERT INTO cms.dashboard_role_shares (
    dashboard_id, role_id, permission_level, granted_by
  )
  VALUES (p_dashboard_id, p_role_id, p_permission_level, v_current_user_id)
  ON CONFLICT (dashboard_id, role_id) DO UPDATE SET
    permission_level = EXCLUDED.permission_level,
    granted_at = NOW()
  RETURNING * INTO v_result;

  RETURN jsonb_build_object(
    'dashboard_id', v_result.dashboard_id,
    'role_id', v_result.role_id,
    'permission_level', v_result.permission_level,
    'granted_at', v_result.granted_at,
    'granted_by', v_result.granted_by
  );
END;
$$;

-- create_dashboard inlined its own share loop with no rank check, a second
-- unguarded path to the same table. Delegate to the gated function instead.
CREATE OR REPLACE FUNCTION cms.create_dashboard(
  p_name TEXT,
  p_role_shares JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_user_id UUID;
  v_result cms.dashboards;
  v_role_share JSONB;
  v_role_id UUID;
  v_permission_level cms.dashboard_permission_level;
BEGIN
  IF NOT cms.verify_admin_access() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_current_user_id := cms.get_current_user_account_id();

  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_name IS NULL OR LENGTH(TRIM(p_name)) < 3 THEN
    RAISE EXCEPTION 'Dashboard name must be at least 3 characters' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO cms.dashboards (name, created_by)
  VALUES (TRIM(p_name), v_current_user_id)
  RETURNING * INTO v_result;

  IF p_role_shares IS NOT NULL AND jsonb_typeof(p_role_shares) = 'array' THEN
    FOR v_role_share IN SELECT * FROM jsonb_array_elements(p_role_shares)
    LOOP
      v_role_id := (v_role_share->>'roleId')::UUID;
      v_permission_level := (v_role_share->>'permissionLevel')::cms.dashboard_permission_level;

      IF v_role_id IS NOT NULL AND v_permission_level IS NOT NULL THEN
        PERFORM cms.share_dashboard_with_role(
          v_result.id,
          v_role_id,
          v_permission_level
        );
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'id', v_result.id,
    'name', v_result.name,
    'created_by', v_result.created_by,
    'created_at', v_result.created_at,
    'updated_at', v_result.updated_at
  );
END;
$$;

ALTER TABLE cms.dashboards
  DROP CONSTRAINT IF EXISTS dashboards_created_by_fkey;

ALTER TABLE cms.dashboards
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE cms.dashboards
  ADD CONSTRAINT dashboards_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES cms.accounts(id) ON DELETE SET NULL;

-- SET NULL alone would strand the dashboard, since delete_dashboards and
-- manage_shares key exclusively on created_by. Fall back to the edit-share
-- population once the creator is gone.
DROP POLICY IF EXISTS delete_dashboards ON cms.dashboards;

CREATE POLICY delete_dashboards ON cms.dashboards FOR DELETE
USING (
  created_by = cms.get_current_user_account_id()
  OR (created_by IS NULL AND cms.can_edit_dashboard(id))
);

DROP POLICY IF EXISTS manage_shares ON cms.dashboard_role_shares;

CREATE POLICY manage_shares ON cms.dashboard_role_shares FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM cms.dashboards d
    WHERE d.id = dashboard_role_shares.dashboard_id
    AND (
      d.created_by = cms.get_current_user_account_id()
      OR (
        d.created_by IS NULL
        AND cms.can_edit_dashboard(d.id)
      )
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM cms.dashboards d
    WHERE d.id = dashboard_role_shares.dashboard_id
    AND (
      d.created_by = cms.get_current_user_account_id()
      OR (
        d.created_by IS NULL
        AND cms.can_edit_dashboard(d.id)
      )
    )
  )
  AND COALESCE(
    (
      SELECT r.rank
      FROM cms.roles r
      WHERE r.id = dashboard_role_shares.role_id
    ) < cms.get_user_max_role_rank(cms.get_current_user_account_id()),
    FALSE
  )
);


-- ---------------------------------------------------------------------------
-- RBAC hardening (bug-hunt 20260801-1731)
-- ---------------------------------------------------------------------------

-- C1: an account that has been deactivated must lose admin access. Nothing read
-- accounts.is_active, so verify_admin_access kept returning true off the JWT claim
-- alone. get_current_user_account_id is INVOKER and reads accounts under a policy
-- gated on verify_admin_access, so the lookup needs its own DEFINER helper.
CREATE OR REPLACE FUNCTION cms.auth_user_has_active_account(p_auth_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
    SELECT EXISTS (SELECT 1
                   FROM cms.accounts
                   WHERE auth_user_id = p_auth_user_id
                     AND is_active = true);
$function$;

GRANT EXECUTE ON FUNCTION cms.auth_user_has_active_account(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION cms.verify_admin_access()
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
    v_auth_user_id   uuid;
    has_admin_access boolean;
    requires_mfa     text;
    has_mfa          boolean;
begin
    select cms.account_has_admin_access() into has_admin_access;

    if not coalesce(has_admin_access, false) then
        return false;
    end if;

    v_auth_user_id := (select auth.uid());

    -- The JWT claim survives deactivation (GoTrue re-mints app_metadata on every
    -- refresh), so the claim alone is not proof of access.
    if v_auth_user_id is null or not cms.auth_user_has_active_account(v_auth_user_id) then
        return false;
    end if;

    select lower(cms.get_configuration_value('requires_mfa')) into requires_mfa;

    -- A missing (NULL) configuration means MFA is optional (the product default);
    -- only an explicit invalid value conservatively defaults to requiring MFA.
    if requires_mfa is not null and requires_mfa not in ('true', 'false') then
        raise warning 'Invalid requires_mfa configuration value: %', requires_mfa;
        requires_mfa := 'true';
    end if;

    if requires_mfa = 'true' then
        select cms.is_aal2() into has_mfa;
    else
        has_mfa := true;
    end if;

    return coalesce(has_mfa, false);
end
$function$;

-- C3: the rank ceiling read only role_permissions, but every shipped seed attaches
-- capabilities exclusively through permission groups, so COALESCE(NULL, 0) made it
-- vacuous. It was also a bare SELECT INTO with no MAX(), so it took an arbitrary row
-- once role_permissions rows did exist. can_delete_permission already enumerates all
-- three holder paths; this brings the UPDATE gate in line.
CREATE OR REPLACE FUNCTION cms.can_modify_permission(p_permission_id uuid, p_action cms.system_action DEFAULT 'update'::cms.system_action)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
DECLARE
    v_user_max_rank                 INTEGER;
    v_highest_role_using_permission INTEGER;
    v_permission_locked             RECORD;
BEGIN
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    SELECT id
    INTO v_permission_locked
    FROM cms.permissions
    WHERE id = p_permission_id
        FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF NOT cms.has_admin_permission('permission'::cms.system_resource, p_action) THEN
        RETURN FALSE;
    END IF;

    v_user_max_rank := cms.get_user_max_role_rank(cms.get_current_user_account_id());

    IF v_user_max_rank IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Highest rank holding this permission by ANY path: role grant, permission group
    -- binding, or a direct account grant.
    SELECT MAX(r.rank)
    INTO v_highest_role_using_permission
    FROM cms.roles r
    WHERE EXISTS (SELECT 1
                  FROM cms.role_permissions rp
                  WHERE rp.role_id = r.id
                    AND rp.permission_id = p_permission_id)
       OR EXISTS (SELECT 1
                  FROM cms.role_permission_groups rpg
                           JOIN cms.permission_group_permissions pgp ON pgp.group_id = rpg.group_id
                  WHERE rpg.role_id = r.id
                    AND pgp.permission_id = p_permission_id)
       OR EXISTS (SELECT 1
                  FROM cms.account_permissions ap
                           JOIN cms.account_roles ar ON ar.account_id = ap.account_id
                  WHERE ar.role_id = r.id
                    AND ap.permission_id = p_permission_id);

    v_highest_role_using_permission := COALESCE(v_highest_role_using_permission, 0);

    -- Equal rank is allowed only when the caller effectively holds the permission.
    -- Counting the group and direct-grant paths makes a strict comparison alone
    -- unsatisfiable for the top-ranked role: every permission it holds becomes
    -- immutable for everyone, its own members included. Holding the permission means
    -- editing it confers nothing new, and enforce_permission_reshape_grantable still
    -- gates the resulting capability. A peer's capability the caller does not hold
    -- stays out of reach.
    RETURN v_user_max_rank > v_highest_role_using_permission
        OR (v_user_max_rank = v_highest_role_using_permission
            AND cms.has_permission(cms.get_current_user_account_id(),
                                        p_permission_id));
END;
$function$;

-- C4: storage capability lives entirely in metadata->>'bucket_name' / 'path_pattern',
-- which the reshape trigger neither compared nor validated. Mirrors the resource/action
-- checks the system and data branches already perform.
CREATE OR REPLACE FUNCTION cms.storage_capability_is_grantable(
  p_action cms.system_action,
  p_bucket_name text,
  p_path_pattern text
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
DECLARE
    v_account_id UUID;
BEGIN
    v_account_id := cms.get_current_user_account_id();

    IF v_account_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- The caller must already hold a storage permission that covers the target
    -- bucket/path/action. Anything other than a full wildcard must match exactly:
    -- pattern containment is not decidable here, so we stay conservative.
    RETURN EXISTS (SELECT 1
                   FROM cms.permissions p
                   WHERE p.permission_type = 'data'
                     AND p.scope = 'storage'
                     AND (p.action = p_action OR p.action = '*')
                     AND (COALESCE(p.metadata ->> 'bucket_name', '*') = '*'
                       OR p.metadata ->> 'bucket_name' IS NOT DISTINCT FROM p_bucket_name)
                     AND (COALESCE(p.metadata ->> 'path_pattern', '*') = '*'
                       OR p.metadata ->> 'path_pattern' IS NOT DISTINCT FROM p_path_pattern)
                     AND cms.has_permission(v_account_id, p.id));
END;
$function$;

GRANT EXECUTE ON FUNCTION cms.storage_capability_is_grantable(cms.system_action, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION cms.enforce_permission_reshape_grantable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
BEGIN
    -- Only re-validate when a capability-defining column changes. metadata is one of
    -- them: for scope='storage' it IS the capability.
    IF NEW.permission_type IS NOT DISTINCT FROM OLD.permission_type
       AND NEW.system_resource IS NOT DISTINCT FROM OLD.system_resource
       AND NEW.action IS NOT DISTINCT FROM OLD.action
       AND NEW.scope IS NOT DISTINCT FROM OLD.scope
       AND NEW.schema_name IS NOT DISTINCT FROM OLD.schema_name
       AND NEW.table_name IS NOT DISTINCT FROM OLD.table_name
       AND NEW.column_name IS NOT DISTINCT FROM OLD.column_name
       AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata THEN
        RETURN NEW;
    END IF;

    -- System / service-role context (no CMS account in the JWT) already bypasses RLS
    -- and is fully trusted (seeds, server-side admin client); do not constrain it. The
    -- attacker-reachable path (updatePermission on the RLS-scoped client) always has an account.
    IF cms.get_current_user_account_id() IS NULL THEN
        RETURN NEW;
    END IF;

    -- The caller may only reshape into a capability they themselves effectively hold,
    -- mirroring cms.can_grant_permission evaluated against the NEW values.
    IF NEW.permission_type = 'system' THEN
        IF NOT cms.has_admin_permission(NEW.system_resource, NEW.action) THEN
            RAISE EXCEPTION 'insufficient_privilege: cannot reshape a permission into a capability you do not hold'
                USING ERRCODE = '42501';
        END IF;
    ELSIF NEW.permission_type = 'data' AND NEW.scope IN ('table', 'column') THEN
        IF NOT cms.has_data_permission(NEW.action, NEW.schema_name, NEW.table_name) THEN
            RAISE EXCEPTION 'insufficient_privilege: cannot reshape a permission into a capability you do not hold'
                USING ERRCODE = '42501';
        END IF;
    ELSIF NEW.scope = 'storage' THEN
        -- Holding the row says nothing about the resulting capability, so check the
        -- target bucket/path/action instead.
        IF NOT cms.storage_capability_is_grantable(
                   NEW.action,
                   NEW.metadata ->> 'bucket_name',
                   NEW.metadata ->> 'path_pattern') THEN
            RAISE EXCEPTION 'insufficient_privilege: cannot reshape a permission into a storage capability you do not hold'
                USING ERRCODE = '42501';
        END IF;
    ELSE
        IF NOT cms.has_permission(cms.get_current_user_account_id(), NEW.id) THEN
            RAISE EXCEPTION 'insufficient_privilege: cannot reshape a permission you do not hold'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- C5: role_permission_groups is the fourth capability-attachment edge. The other three
-- got can_grant_permission in the 2026-05-30 hardening migration; this one could not,
-- because can_modify_role_permission_group takes no group_id and so never inspects what
-- is being attached.
CREATE OR REPLACE FUNCTION cms.can_grant_permission_group(p_group_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
BEGIN
    IF p_group_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Every permission the group confers must itself be grantable by the caller.
    RETURN NOT EXISTS (SELECT 1
                       FROM cms.permission_group_permissions pgp
                       WHERE pgp.group_id = p_group_id
                         AND NOT cms.can_grant_permission(pgp.permission_id));
END;
$function$;

GRANT EXECUTE ON FUNCTION cms.can_grant_permission_group(uuid) TO authenticated;

DROP POLICY IF EXISTS insert_role_permission_groups ON cms.role_permission_groups;

CREATE POLICY insert_role_permission_groups ON cms.role_permission_groups FOR INSERT TO authenticated
WITH CHECK (
  cms.can_modify_role_permission_group(
    cms.get_current_user_account_id(),
    role_id,
    'insert'::cms.system_action
  )
  AND cms.can_grant_permission_group(group_id)
);

DROP POLICY IF EXISTS update_role_permission_groups ON cms.role_permission_groups;

CREATE POLICY update_role_permission_groups ON cms.role_permission_groups FOR UPDATE TO authenticated
USING (
  cms.can_modify_role_permission_group(
    cms.get_current_user_account_id(),
    role_id,
    'update'::cms.system_action
  )
)
WITH CHECK (
  cms.can_modify_role_permission_group(
    cms.get_current_user_account_id(),
    role_id,
    'update'::cms.system_action
  )
  AND cms.can_grant_permission_group(group_id)
);

-- C6: the rank test was a single negative followed by an unconditional `return true`,
-- and both ranks come from SELECT INTO joins that yield NULL when no row matches.
-- NULL > n is NULL, so the IF was skipped and access granted. Reachable through ordinary
-- offboarding: audit_logs.account_id is ON DELETE SET NULL.
CREATE OR REPLACE FUNCTION cms.can_read_audit_log(p_target_account_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
    v_current_account_id        uuid;
    v_current_account_role_rank int;
    v_target_account_role_rank  int;
begin
    if not cms.verify_admin_access() then
        return false;
    end if;

    if not cms.has_admin_permission('log'::cms.system_resource, 'select'::cms.system_action) then
        return false;
    end if;

    v_current_account_id := cms.get_current_user_account_id();

    -- The user is the owner of the audit log
    if p_target_account_id is not null and p_target_account_id = v_current_account_id then
        return true;
    end if;

    select rank
    into v_current_account_role_rank
    from cms.roles
             join cms.account_roles on cms.roles.id = cms.account_roles.role_id
    where cms.account_roles.account_id = v_current_account_id;

    -- Cannot establish the reader's standing: deny.
    if v_current_account_role_rank is null then
        return false;
    end if;

    if p_target_account_id is not null then
        select rank
        into v_target_account_role_rank
        from cms.roles
                 join cms.account_roles on cms.roles.id = cms.account_roles.role_id
        where cms.account_roles.account_id = p_target_account_id;
    end if;

    -- Unknown subject (role-less account, or a row orphaned by ON DELETE SET NULL).
    -- We cannot prove the reader outranks it, so restrict it to the top of the hierarchy
    -- rather than falling through to allow.
    if v_target_account_role_rank is null then
        return v_current_account_role_rank >= (select max(rank) from cms.roles);
    end if;

    return v_current_account_role_rank >= v_target_account_role_rank;
end;
$function$;

-- C8: activate/deactivate wrote through the RLS-bypassing admin pool, where the column
-- grant, update_accounts, restrict_mfa_accounts and prevent_active_status_update_by_user
-- are all inert and the audit row lands with a NULL actor. Routing the write through a
-- DEFINER function keeps the caller's JWT on the connection, so authorization and audit
-- attribution both work.
-- C1 (chain): clearing cms_access makes deactivation an actual revocation, which
-- also unblocks assertUserIsNotAdminAccount so a deactivated admin can still be banned
-- or deleted.
CREATE OR REPLACE FUNCTION cms.set_account_active(p_account_id uuid, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
DECLARE
    v_auth_user_id uuid;
BEGIN
    IF p_account_id IS NULL OR p_is_active IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid arguments');
    END IF;

    IF NOT cms.is_mfa_compliant() THEN
        RETURN jsonb_build_object('success', false, 'error', 'MFA required');
    END IF;

    IF NOT cms.can_action_account(p_account_id, 'update'::cms.system_action) THEN
        RETURN jsonb_build_object('success', false, 'error', 'You are not authorized to update this member');
    END IF;

    SELECT auth_user_id
    INTO v_auth_user_id
    FROM cms.accounts
    WHERE id = p_account_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Account not found');
    END IF;

    UPDATE cms.accounts
    SET is_active = p_is_active,
        updated_at = now()
    WHERE id = p_account_id;

    IF v_auth_user_id IS NOT NULL THEN
        UPDATE auth.users
        SET raw_app_meta_data = CASE
                                    WHEN p_is_active
                                        THEN coalesce(raw_app_meta_data, '{}'::jsonb) ||
                                             jsonb_build_object('cms_access', 'true')
                                    ELSE coalesce(raw_app_meta_data, '{}'::jsonb) ||
                                         jsonb_build_object('cms_access', 'false')
                                END,
            updated_at = now()
        WHERE id = v_auth_user_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION cms.set_account_active(uuid, boolean) TO authenticated;

-- C2: grant_admin_access re-activates an account and restores cms_access gated only
-- on account:insert, while its sibling revoke_admin_access rank-checks with
-- can_action_account. That let a lower-ranked admin reverse a superior's containment
-- decision. The check has to precede the auth.users write, not just the accounts write.
CREATE OR REPLACE FUNCTION cms.grant_admin_access(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO ''
AS $function$
declare
    v_current_user_id uuid;
    v_existing_metadata jsonb;
    v_updated_metadata jsonb;
    v_account_exists boolean;
    v_target_account_id uuid;
begin
    v_current_user_id := auth.uid();

    if v_current_user_id is null then
        return jsonb_build_object('success', false, 'error', 'Not authenticated');
    end if;

    if v_current_user_id = p_user_id then
        return jsonb_build_object('success', false, 'error', 'Cannot grant admin access to yourself');
    end if;

    if not cms.has_admin_permission('account'::cms.system_resource, 'insert') then
        return jsonb_build_object('success', false, 'error', 'Insufficient permissions to grant admin access');
    end if;

    -- An account that already exists carries a rank; reactivating it is an action ON that
    -- account and must respect the hierarchy. A brand-new account has no rank to outrank.
    select id into v_target_account_id
    from cms.accounts
    where auth_user_id = p_user_id;

    if v_target_account_id is not null
        and not cms.can_action_account(v_target_account_id, 'update'::cms.system_action) then
        return jsonb_build_object('success', false, 'error', 'Insufficient permissions to grant admin access to this account');
    end if;

    select raw_app_meta_data into v_existing_metadata
    from auth.users
    where id = p_user_id;

    if v_existing_metadata is null then
        return jsonb_build_object('success', false, 'error', 'User not found');
    end if;

    v_updated_metadata := coalesce(v_existing_metadata, '{}'::jsonb) || jsonb_build_object('cms_access', 'true');

    update auth.users
    set raw_app_meta_data = v_updated_metadata,
        updated_at = now()
    where id = p_user_id;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Failed to update user metadata');
    end if;

    select exists(
        select 1 from cms.accounts
        where auth_user_id = p_user_id
    ) into v_account_exists;

    if not v_account_exists then
        insert into cms.accounts (auth_user_id, is_active)
        values (p_user_id, true)
        on conflict (auth_user_id) do update set
            is_active = true,
            updated_at = now();
    else
        update cms.accounts
        set is_active = true,
            updated_at = now()
        where auth_user_id = p_user_id;
    end if;

    perform cms.create_audit_log(
        'grant_admin_access',
        'cms',
        'accounts',
        p_user_id::text,
        null,
        jsonb_build_object(
            'target_user_id', p_user_id,
            'action', 'grant_admin_access',
            'granted_by', v_current_user_id,
            'admin_access', true
        ),
        'info'::cms.audit_log_severity,
        jsonb_build_object('operation_type', 'admin_access_management')
    );

    return jsonb_build_object('success', true, 'message', 'Admin access granted successfully');

exception when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$function$;
