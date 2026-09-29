
-- Admin Access Management Functions
-- This migration adds functions to properly manage admin access by handling both JWT metadata and account creation

-- Function to grant admin access to a user
-- This function performs two operations in a transaction:
-- 1. Updates the user's app_metadata in auth.users to set cms_access = 'true'
-- 2. Creates or activates an account in cms.accounts if it doesn't exist
-- Alineada con la versión que dejan las migraciones (el esquema declarativo
-- heredado estaba desfasado respecto a ellas). Ver ADR-015.
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

-- Function to revoke admin access from a user
-- This function performs two operations in a transaction:
-- 1. Updates the user's app_metadata in auth.users to set admin_access = 'false'
-- 2. Optionally deactivates the account in cms.accounts (but preserves the record)
create or replace function cms.revoke_admin_access (
    p_user_id uuid,
    p_deactivate_account boolean default false
) returns jsonb
set search_path = ''
set row_security = off
language plpgsql
security definer
as $$
declare
    v_current_user_id uuid;
    v_result jsonb;
    v_existing_metadata jsonb;
    v_updated_metadata jsonb;
    v_can_action_account boolean;
    v_target_account_id uuid;
begin
    -- Get the current user's ID from JWT
    v_current_user_id := auth.uid();
    
    if v_current_user_id is null then
        return jsonb_build_object('success', false, 'error', 'Not authenticated');
    end if;
    
    -- Prevent users from revoking admin access from themselves
    if v_current_user_id = p_user_id then
        return jsonb_build_object('success', false, 'error', 'Cannot revoke admin access from yourself');
    end if;
    
    -- Check if current user has permission to delete accounts
    if not cms.has_admin_permission('account'::cms.system_resource, 'delete') then
        return jsonb_build_object('success', false, 'error', 'Insufficient permissions to revoke admin access');
    end if;
    
    -- Check if current user can action the target account (role hierarchy check)
    -- First get the target account ID
    select id into v_target_account_id
    from cms.accounts
    where auth_user_id = p_user_id;
    
    if v_target_account_id is not null then
        select cms.can_action_account(v_target_account_id, 'update') into v_can_action_account;
        
        if not v_can_action_account then
            return jsonb_build_object('success', false, 'error', 'Cannot revoke admin access from users with equal or higher role rank');
        end if;
    end if;
    -- If no account exists, we can proceed (they don't have admin access anyway)
    
    -- Get current app_metadata from auth.users
    select raw_app_meta_data into v_existing_metadata
    from auth.users
    where id = p_user_id;
    
    if v_existing_metadata is null then
        return jsonb_build_object('success', false, 'error', 'User not found');
    end if;
    
    -- Update app_metadata to set cms_access = 'false'
    v_updated_metadata := coalesce(v_existing_metadata, '{}'::jsonb) || jsonb_build_object('cms_access', 'false');
    
    -- Update the user's app_metadata
    update auth.users 
    set raw_app_meta_data = v_updated_metadata,
        updated_at = now()
    where id = p_user_id;
    
    if not found then
        return jsonb_build_object('success', false, 'error', 'Failed to update user metadata');
    end if;
    
    -- Optionally deactivate the account (but preserve the record and roles)
    if p_deactivate_account then
        update cms.accounts 
        set is_active = false,
            updated_at = now()
        where auth_user_id = p_user_id;
    end if;
    
    -- Create audit log
    perform cms.create_audit_log(
        'revoke_admin_access',
        'cms', 
        'accounts',
        p_user_id::text,
        null, -- old_data
        jsonb_build_object(
            'target_user_id', p_user_id,
            'action', 'revoke_admin_access',
            'revoked_by', v_current_user_id,
            'deactivated_account', p_deactivate_account,
            'admin_access', false
        ),
        'info'::cms.audit_log_severity,
        jsonb_build_object('operation_type', 'admin_access_management')
    );
    
    return jsonb_build_object('success', true, 'message', 'Admin access revoked successfully');
    
exception when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;

-- Grant execute permissions to authenticated users
grant execute on function cms.grant_admin_access(uuid) to authenticated;

grant execute on function cms.revoke_admin_access(uuid, boolean) to authenticated;
-- Function to activate or deactivate a CMS account
-- The activate/deactivate routes used to write is_active through the RLS-bypassing admin
-- pool, where the service_role-only column grant, update_accounts, restrict_mfa_accounts
-- and prevent_active_status_update_by_user are all inert and the audit row lands with a
-- NULL actor. Routing the write through this function keeps the caller's JWT on the
-- connection, so authorization and audit attribution both work.
-- Clearing cms_access is what makes deactivation an actual revocation: the claim
-- otherwise survives (GoTrue re-mints app_metadata on refresh), which both preserved the
-- account's read access and made assertUserIsNotAdminAccount block every harder response.
create or replace function cms.set_account_active (
    p_account_id uuid,
    p_is_active boolean
) returns jsonb
set search_path = ''
set row_security = off
language plpgsql
security definer
as $$
declare
    v_auth_user_id uuid;
begin
    if p_account_id is null or p_is_active is null then
        return jsonb_build_object('success', false, 'error', 'Invalid arguments');
    end if;

    if not cms.is_mfa_compliant() then
        return jsonb_build_object('success', false, 'error', 'MFA required');
    end if;

    if not cms.can_action_account(p_account_id, 'update'::cms.system_action) then
        return jsonb_build_object('success', false, 'error', 'You are not authorized to update this member');
    end if;

    select auth_user_id
    into v_auth_user_id
    from cms.accounts
    where id = p_account_id;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Account not found');
    end if;

    update cms.accounts
    set is_active = p_is_active,
        updated_at = now()
    where id = p_account_id;

    if v_auth_user_id is not null then
        update auth.users
        set raw_app_meta_data = case
                                    when p_is_active
                                        then coalesce(raw_app_meta_data, '{}'::jsonb) ||
                                             jsonb_build_object('cms_access', 'true')
                                    else coalesce(raw_app_meta_data, '{}'::jsonb) ||
                                         jsonb_build_object('cms_access', 'false')
                                end,
            updated_at = now()
        where id = v_auth_user_id;
    end if;

    return jsonb_build_object('success', true);
end;
$$;

grant execute on function cms.set_account_active(uuid, boolean) to authenticated;
