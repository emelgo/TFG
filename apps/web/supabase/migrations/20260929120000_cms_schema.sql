-- Initialize schema and extensions
create schema if not exists cms;

-- Grant usage on the cms schema to the authenticated role
grant usage on schema cms to authenticated;

-- We remove all default privileges from public schema on functions to
--   prevent public access to them by default
alter default privileges in schema cms
revoke
execute on functions
from
  anon,
  authenticated;

-- revoke ALL on future tables/sequences too
alter default privileges in SCHEMA cms
revoke all on TABLES
from
  anon,
  authenticated,
  public;

alter default privileges in SCHEMA cms
revoke all on SEQUENCES
from
  anon,
  authenticated,
  public;

-- SECTION: AUDIT LOG SEVERITY
-- In this section, we define the audit log severity. Audit log severity is the severity of the audit log.
create type cms.audit_log_severity as ENUM('info', 'warning', 'error');

-- SECTION: SYSTEM RESOURCES
-- In this section, we define the system resources. System resources are resources that belong to CMS itself, not the end application being managed.
create type cms.system_resource as ENUM(
  'account',
  'role',
  'permission',
  'log',
  'table',
  'auth_user',
  'system_setting'
);

-- SECTION: PERMISSION TYPE
-- In this section, we define the permission type. Permission type is the type of the permission.
create type cms.permission_type as ENUM('system', 'data');

-- SECTION: PERMISSION SCOPES
-- In this section, we define the permission scopes. Permission scopes are the scopes of the permissions.
create type cms.permission_scope as ENUM('table', 'column', 'storage');

-- SECTION: SYSTEM ACTIONS
-- In this section, we define the system actions. System actions are the actions that can be performed on the system resources.
create type cms.system_action as ENUM('insert', 'update', 'delete', 'select', '*');

/**
 * SECTION: CONFIGURATION
 */
create table if not exists cms.configuration (
  key VARCHAR(100) primary key,
  value TEXT not null,
  created_at TIMESTAMPTZ not null default NOW(),
  updated_at TIMESTAMPTZ not null default NOW()
);

alter table cms.configuration enable row level security;

-- Grant access to the configuration table
grant
select
,
  insert,
update,
delete on cms.configuration to authenticated,
service_role;

-- SECTION: GET CONFIGURATION VALUE
-- This function retrieves a configuration value by its key.
create or replace function cms.get_configuration_value (p_key VARCHAR(100)) returns TEXT
set
  search_path = '' as $$
declare
    v_value TEXT;
begin
    -- Validate key format to prevent injection
    if p_key !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' then
        raise exception 'Invalid configuration key format';
    end if;

    select value
    into v_value
    from cms.configuration
    where key = p_key;

    return v_value;
end;
$$ language plpgsql;

grant
execute on function cms.get_configuration_value (VARCHAR(100)) to authenticated,
service_role;

/*
 * cms.is_aal2
 * Check if the user has aal2 access
 */
create or replace function cms.is_aal2 () returns boolean
set
  search_path = '' as $$
declare
    is_aal2 boolean;
begin
    select auth.jwt() ->> 'aal' = 'aal2' into is_aal2;

    return coalesce(is_aal2, false);
end
$$ language plpgsql;

-- Grant access to the function to authenticated users
grant
execute on function cms.is_aal2 () to authenticated;

/*
 * cms.is_mfa_compliant
 * Check if the user meets MFA requirements if they have MFA enabled.
 * If the user has MFA enabled, then the user must have aal2 enabled. Otherwise, the user must have aal1 enabled (default behavior).
 */
create or replace function cms.is_mfa_compliant () returns boolean
set
  row_security = off
set
  search_path = '' as $$
begin
    return array [(select auth.jwt() ->> 'aal')] <@ (select case
                                                                when count(id) > 0 then array ['aal2']
                                                                else array ['aal1', 'aal2']
                                                                end as aal
                                                     from auth.mfa_factors
                                                     where ((select auth.uid()) = auth.mfa_factors.user_id)
                                                       and auth.mfa_factors.status = 'verified');
end
$$ language plpgsql security definer;

-- Grant access to the function to authenticated users
grant
execute on function cms.is_mfa_compliant () to authenticated;

-- Lightweight function that checks if user has admin_access flag in JWT
create or replace function cms.account_has_admin_access () returns boolean
set
  search_path = '' as $$
begin
    return (auth.jwt() ->> 'app_metadata')::jsonb ->> 'cms_access' = 'true';
end
$$ language plpgsql;

grant
execute on function cms.account_has_admin_access () to authenticated;

-- SECTION: CHECK ADMIN ACCESS
-- In this section, we define the check admin access function. This function is used to check if the user has admin access by checking the app_metadata of the JWT. This is a preliminary, cheap way to check if the user has admin access. Remaining checks are that using cms.has_data_permission and cms.has_admin_permission.
-- In addition, it checks if the user has MFA enabled and if MFA is required for admin access.
create or replace function cms.verify_admin_access () RETURNS boolean
set
  search_path = '' as $$
declare
    has_admin_access boolean;
    requires_mfa     text;
    has_mfa          boolean;
begin
    -- Check if user has admin access flag in JWT
    select cms.account_has_admin_access() into has_admin_access;

    -- Early return if user doesn't have admin access
    if not coalesce(has_admin_access, false) then
        return false;
    end if;

    -- Get MFA requirement from configuration
    select lower(cms.get_configuration_value('requires_mfa')) into requires_mfa;

    -- Validate requires_mfa value to ensure it's either 'true' or 'false'
    if requires_mfa is not null and requires_mfa not in ('true', 'false') then
        -- Log suspicious configuration value
        raise warning 'Invalid requires_mfa configuration value: %', requires_mfa;
        -- Default to requiring MFA for security
        requires_mfa := 'true';
    end if;

    -- Handle MFA check based on configuration
    if requires_mfa = 'true' then
        -- MFA is required, check if user has aal2 access
        select cms.is_aal2() into has_mfa;
    else
        -- MFA is not required or not configured, allow access
        has_mfa := true;
    end if;

    -- Return true only if user has admin access AND meets MFA requirements
    return coalesce(has_admin_access, false) and coalesce(has_mfa, false);
end
$$ language plpgsql;

grant
execute on function cms.verify_admin_access () to authenticated;

-- SECTION: UPDATE UPDATED AT COLUMN
-- In this section, we define the update updated at column function. This function is used to update the updated at column of the table.
create or replace function cms.update_updated_at_column () RETURNS TRIGGER
set
  search_path = '' as $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- SECTION: SANITIZE IDENTIFIER
-- In this section, we define the sanitize identifier function to prevent SQL injection attacks. This is normally not required when using an ORM however it is useful should the user ever be using raw SQL.
-- ---------------------------------------------------------------------------
-- cms.sanitize_identifier()
--   • Normalises to lowercase
--   • Enforces PostgreSQL identifier rules
--   • Rejects *any* reserved / type / column keyword returned by pg_get_keywords()
-- ---------------------------------------------------------------------------
create or replace function cms.sanitize_identifier (identifier TEXT) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE STRICT
set
  search_path = ''
 as $$
DECLARE
    v_norm TEXT := lower(identifier);      -- identifiers are case-insensitive
BEGIN
    --------------------------------------------------------------------------
    -- 1. Non-empty
    --------------------------------------------------------------------------
    IF v_norm IS NULL OR length(trim(v_norm)) = 0 THEN
        RAISE EXCEPTION
            'Identifier cannot be null or empty';
    END IF;

    --------------------------------------------------------------------------
    -- 2. Allowed characters & length
    --    • Must start with a letter or underscore
    --    • Subsequent chars: letters, digits, underscores
    --    • 63-byte limit (PostgreSQL internal limit for unquoted identifiers)
    --------------------------------------------------------------------------
    IF v_norm !~ '^[a-z_][a-z0-9_]{0,62}$' THEN
        RAISE EXCEPTION
            'Invalid identifier "%": must match ^[a-z_][a-z0-9_]{0,62}$',
            identifier;
    END IF;

    --------------------------------------------------------------------------
    -- 3. Reserved keyword check
    --    pg_get_keywords() categorises keywords with catcode:
    --      R = reserved, T = type keyword, C = colname keyword
    --    Any of those would behave unpredictably if used as an identifier.
    --------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1
        FROM   pg_get_keywords()
        WHERE  word = v_norm
        AND    catcode IN ('R', 'T', 'C')
    ) THEN
        RAISE EXCEPTION
            'Identifier "%": reserved SQL/type/column keyword', identifier;
    END IF;

    --------------------------------------------------------------------------
    -- 4. All good – return the safe, normalised identifier
    --------------------------------------------------------------------------
    RETURN v_norm;
END;
$$;

grant
execute on function cms.sanitize_identifier (text) to authenticated,
service_role;

-- SECTION: VALIDATE COLUMN NAME
-- In this section, we define the validate column name function. This function is used to validate the column name. It checks if the column name exists in the table.
create or replace function cms.validate_column_name (p_schema text, p_table text, p_column text) RETURNS boolean
set
  search_path = '' as $$
DECLARE
    v_exists boolean;
BEGIN
    SELECT EXISTS (SELECT 1
                   FROM information_schema.columns
                   WHERE table_schema = p_schema
                     AND table_name = p_table
                     AND column_name = p_column)
    INTO v_exists;

    RETURN v_exists;
END;
$$ LANGUAGE plpgsql STABLE;

-- SECTION: VALIDATE SCHEMA ACCESS
-- In this section, we define the validate schema access function. This function prevents write operations on private Supabase schemas.
create or replace function cms.validate_schema_access (p_schema text) RETURNS boolean
set
  search_path = '' as $$
DECLARE
    v_protected_schemas text[] := ARRAY [
        'auth',
        'cron',
        'extensions',
        'information_schema',
        'net',
        'pgsodium',
        'pgsodium_masks',
        'pgbouncer',
        'pgtle',
        'realtime',
        'storage',
        'supabase_functions',
        'supabase_migrations',
        'vault',
        'graphql',
        'graphql_public',
        'pgmq_public',
        'cms'
        ];
BEGIN
    -- Check if the schema is in the protected list
    IF p_schema = ANY (v_protected_schemas) THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

grant
execute on function cms.validate_schema_access (text) to authenticated,
service_role;

-- SECTION: ACCOUNTS
-- In this section, we define the accounts table. The accounts table links a Supabase Auth user to an account in CMS.
create table if not exists cms.accounts (
  id UUID primary key default gen_random_uuid (),
  auth_user_id UUID not null unique references auth.users (id) on delete CASCADE,
  created_at TIMESTAMPTZ not null default NOW(),
  updated_at TIMESTAMPTZ not null default NOW(),
  is_active BOOLEAN not null default true,
  -- metadata is used to store the metadata of the account
  metadata JSONB not null default '{
      "username": "",
      "picture_url": ""
    }'::jsonb check (jsonb_typeof(metadata) = 'object'),
  -- preferences is used to store the preferences of the account
  preferences JSONB not null default '{
      "timezone": "",
      "language": "en-US"
    }'::jsonb check (jsonb_typeof(preferences) = 'object')
);

comment on table cms.accounts is 'Table to store the accounts';

comment on column cms.accounts.id is 'The ID of the account';

comment on column cms.accounts.auth_user_id is 'The ID of the auth user';

comment on column cms.accounts.created_at is 'The creation time of the account';

comment on column cms.accounts.updated_at is 'The last update time of the account';

comment on column cms.accounts.is_active is 'Whether the account is active';

comment on column cms.accounts.metadata is 'The metadata of the account';

comment on column cms.accounts.preferences is 'The preferences of the account';

-- Permissions --
grant
select
,
  insert,
update,
delete on table cms.accounts to authenticated,
service_role;

-- RLS
alter table cms.accounts ENABLE row LEVEL SECURITY;

-- Triggers
-- Function to prevent active status update by user
create or replace function cms.prevent_active_status_update_by_user () RETURNS TRIGGER
set
  search_path = '' as $$
BEGIN
    if (select auth.uid()) = NEW.auth_user_id then
        RAISE EXCEPTION 'User cannot update their own active status';
    end if;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to prevent active status update by user when updating the account
create trigger prevent_active_status_update_by_user before
update of is_active on cms.accounts for each row
execute function cms.prevent_active_status_update_by_user ();

-- Functions
-- Update user preferences
create or replace function cms.update_user_preferences (p_preferences JSONB) RETURNS jsonb
set
  search_path = '' as $$
DECLARE
    v_old_preferences jsonb;
BEGIN
    -- Get old preferences
    SELECT preferences
    INTO v_old_preferences
    FROM cms.accounts
    WHERE auth_user_id = (select auth.uid());

    -- Update
    UPDATE cms.accounts
    SET preferences = p_preferences
    WHERE auth_user_id = (select auth.uid());

    RETURN jsonb_build_object(
            'success', true,
            'action', 'update',
            'data', jsonb_build_object(
                    'old_preferences', v_old_preferences,
                    'new_preferences', p_preferences
                    )
           );
END;
$$ LANGUAGE plpgsql;

grant
execute on function cms.update_user_preferences (JSONB) to authenticated;

-- Function to get the current user's account ID
create or replace function cms.get_current_user_account_id () RETURNS uuid LANGUAGE plpgsql
set
  search_path = '' as $$
BEGIN
    RETURN (SELECT id from cms.accounts where (select auth.uid()) = auth_user_id and is_active = true);
END;
$$;

grant
execute on function cms.get_current_user_account_id () to authenticated;

-- SECTION: ROLES
-- In this section, we define the roles table. The roles table links a Supabase Auth user to a role in CMS.
create table if not exists cms.roles (
  id UUID primary key default gen_random_uuid (),
  name VARCHAR(50) not null unique,
  description VARCHAR(500),
  created_at TIMESTAMPTZ not null default NOW(),
  updated_at TIMESTAMPTZ not null default NOW(),
  metadata JSONB default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  rank INTEGER default 0 not null check (rank >= 0) check (rank <= 100),
  valid_from TIMESTAMPTZ default NOW(),
  valid_until TIMESTAMPTZ,
  -- Ensure valid_from is before valid_until
  constraint valid_time_range check (
    valid_from is null
    or valid_until is null
    or valid_from < valid_until
  ),
  -- Ensure rank is unique
  constraint roles_rank_unique unique (rank)
);

comment on table cms.roles is 'Table to store the roles';

comment on column cms.roles.id is 'The ID of the role';

comment on column cms.roles.name is 'The name of the role';

comment on column cms.roles.description is 'The description of the role';

comment on column cms.roles.created_at is 'The creation time of the role';

comment on column cms.roles.updated_at is 'The last update time of the role';

comment on column cms.roles.metadata is 'The metadata of the role';

comment on column cms.roles.rank is 'The rank of the role';

comment on column cms.roles.valid_from is 'The time the role is valid from';

comment on column cms.roles.valid_until is 'The time the role is valid until';

-- Grant access
grant
select
,
  insert,
update,
delete on table cms.roles to authenticated,
service_role;

-- RLS
alter table cms.roles ENABLE row LEVEL SECURITY;

-- Account-role assignments
create table if not exists cms.account_roles (
  account_id UUID not null references cms.accounts (id) on delete CASCADE,
  role_id UUID not null references cms.roles (id) on delete CASCADE,
  assigned_at TIMESTAMPTZ not null default NOW(),
  assigned_by UUID references cms.accounts (id),
  valid_from TIMESTAMPTZ default NOW(),
  valid_until TIMESTAMPTZ,
  metadata JSONB default '{}'::jsonb,
  -- Primary key is account_id and role_id
  primary key (account_id, role_id),
  -- Ensure account_id is unique. We allow only one role per account.
  unique (account_id),
  -- Ensure valid_from is before valid_until
  constraint valid_time_range check (
    valid_from is null
    or valid_until is null
    or valid_from < valid_until
  )
);

comment on table cms.account_roles is 'Table to store the account roles';

comment on column cms.account_roles.account_id is 'The ID of the account';

comment on column cms.account_roles.role_id is 'The ID of the role';

comment on column cms.account_roles.assigned_at is 'The time the role was assigned';

comment on column cms.account_roles.assigned_by is 'The user who assigned the role';

comment on column cms.account_roles.valid_from is 'The time the role is valid from';

comment on column cms.account_roles.valid_until is 'The time the role is valid until';

comment on column cms.account_roles.metadata is 'The metadata of the role';

-- Grants
grant
select
,
  insert,
update,
delete on table cms.account_roles to authenticated,
service_role;

-- RLS
alter table cms.account_roles ENABLE row LEVEL SECURITY;

-- SECTION: VALIDATE ACCOUNT ROLE BUSINESS RULES
-- In this section, we define the validate account role business rules function. This function is used to validate the account role business rules.
create or replace function cms.validate_account_role_business_rules () RETURNS TRIGGER
set
  search_path = '' as $$
DECLARE
    v_account_active BOOLEAN;
    v_role_active    BOOLEAN;
    v_existing_count INTEGER;
BEGIN
    -- Check account is active (complex query, can't be in CHECK constraint)
    SELECT is_active
    INTO v_account_active
    FROM cms.accounts
    WHERE id = NEW.account_id;

    -- Check if account is active otherwise raise an exception
    IF NOT v_account_active THEN
        RAISE EXCEPTION 'Cannot assign role to inactive account'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Check role is currently valid (involves NOW())
    SELECT (valid_until IS NULL OR valid_until > NOW())
    INTO v_role_active
    FROM cms.roles
    WHERE id = NEW.role_id;

    -- Check if role is currently valid otherwise raise an exception
    IF NOT v_role_active THEN
        RAISE EXCEPTION 'Cannot assign expired role'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Check for duplicate active assignments (complex query)
    IF TG_OP = 'INSERT' THEN
        SELECT COUNT(*)
        INTO v_existing_count
        FROM cms.account_roles
        WHERE account_id = NEW.account_id
          AND role_id = NEW.role_id
          AND (valid_until IS NULL OR valid_until > NOW());

        IF v_existing_count > 0 THEN
            RAISE EXCEPTION 'Account already has this role assigned'
                USING ERRCODE = 'unique_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

create trigger account_role_business_rules_check BEFORE INSERT
or
update on cms.account_roles for EACH row
execute FUNCTION cms.validate_account_role_business_rules ();

-- SECTION: CAN ACTION ROLE
-- In this section, we define the can action role function. This function is used to check if a user can modify a role. Uses SECURITY DEFINER to avoid infinite loops when the function is used within RLS policies.
create or replace function cms.can_action_role (p_role_id UUID, p_action cms.system_action) RETURNS BOOLEAN VOLATILE SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_current_user_max_rank INTEGER;
    v_target_role_rank      INTEGER;
    v_current_account_id        UUID;
BEGIN
    -- Basic validations
    IF p_role_id IS NULL OR p_action IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check if user has admin access
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    -- Check basic admin permission
    IF NOT cms.has_admin_permission('role'::cms.system_resource, p_action) THEN
        RETURN FALSE;
    END IF;

    v_current_account_id := cms.get_current_user_account_id();
    IF v_current_account_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Get target role rank (simple read)
    SELECT rank
    INTO v_target_role_rank
    FROM cms.roles
    WHERE id = p_role_id;

    IF v_target_role_rank IS NULL THEN
        RETURN FALSE; -- Role doesn't exist
    END IF;

    -- Get user's max rank
    v_current_user_max_rank := cms.get_user_max_role_rank(v_current_account_id);

    -- Simple comparison - user must have STRICTLY higher rank
    RETURN COALESCE(v_current_user_max_rank > v_target_role_rank, FALSE);
END;
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.can_action_role to authenticated;

-- SECTION: CAN MODIFY ACCOUNT ROLE
-- This function checks if a user can modify the role of a specific account with proper privilege escalation prevention. Uses SECURITY DEFINER to avoid infinite loops when the function is used within RLS policies.
create or replace function cms.can_modify_account_role (
  p_account_id UUID,
  p_target_account_id UUID,
  p_role_id UUID,
  p_action cms.system_action
) RETURNS BOOLEAN SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_user_max_rank    INTEGER;
    v_role_rank        INTEGER;
    v_target_max_rank  INTEGER;
    v_is_self_modification BOOLEAN;
BEGIN
    -- Input validation
    IF p_account_id IS NULL OR p_target_account_id IS NULL OR p_role_id IS NULL OR p_action IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check if user has admin access (JWT validation)
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    -- First check: Does user have admin permission to modify roles at all?
    IF NOT cms.has_admin_permission('role'::cms.system_resource, p_action) THEN
        RETURN FALSE;
    END IF;

    -- Determine if this is self-modification
    v_is_self_modification := (p_account_id = p_target_account_id);

    -- CANONICAL LOCKING: Lock all resources in consistent order
    -- This prevents deadlocks regardless of caller order
    PERFORM cms.lock_resources_ordered(
            p_accounts := ARRAY [p_account_id, p_target_account_id]::UUID[],
            p_roles := ARRAY [p_role_id]::UUID[]
            );

    -- Get role rank (simple read)
    SELECT rank
    INTO v_role_rank
    FROM cms.roles
    WHERE id = p_role_id;

    IF v_role_rank IS NULL THEN
        RETURN FALSE; -- Role doesn't exist
    END IF;

    v_user_max_rank := coalesce(cms.get_user_max_role_rank(p_account_id), null);

    v_target_max_rank := coalesce(cms.get_user_max_role_rank(p_target_account_id), 0);

    -- If the user has no roles, return false
    IF v_user_max_rank IS NULL THEN
        RETURN FALSE;
    END IF;

    -- RULE 1: User must have HIGHER OR EQUAL rank than the role being assigned/modified
    IF v_user_max_rank < v_role_rank THEN
        RETURN FALSE;
    END IF;

    -- RULE 2: Self-modification restrictions
    IF v_is_self_modification THEN
        CASE p_action
            WHEN 'delete' THEN -- Users cannot remove their own highest rank role (prevents lockout)
            IF v_role_rank = v_user_max_rank THEN
                RETURN FALSE;
            END IF;

            WHEN 'insert', 'update' THEN -- Users cannot assign themselves equal/higher roles (prevents escalation)
            IF v_role_rank >= v_user_max_rank THEN
                RETURN FALSE;
            END IF;

            ELSE -- Other actions allowed if user has higher rank
            NULL;
            END CASE;

        RETURN TRUE; -- Self-modification allowed for lower rank roles
    END IF;

    RETURN v_user_max_rank > v_target_max_rank;
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error in can_modify_account_role: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
grant
execute on FUNCTION cms.can_modify_account_role to authenticated;

-- Indexes
create index idx_account_roles_account_id on cms.account_roles (account_id);

create index idx_account_roles_role_id on cms.account_roles (role_id);

-- Add a helper function to check if an account has a specific role
create or replace function cms.account_has_role (p_account_id UUID, p_role_id UUID) RETURNS BOOLEAN SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
BEGIN
    RETURN EXISTS (SELECT 1
                   FROM cms.account_roles
                   WHERE account_id = p_account_id
                     AND role_id = p_role_id
                     AND (valid_until IS NULL OR valid_until > NOW()));
END;
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.account_has_role to authenticated,
service_role;

-- SECTION: GET CURRENT USER ROLE
-- In this section, we define the function to get the current user's role.
--
create or replace function cms.get_current_user_role () RETURNS cms.roles LANGUAGE plpgsql
set
  search_path = '' as $$
DECLARE
    v_role cms.roles;
BEGIN
    SELECT r.*
    INTO v_role
    FROM cms.roles r
             JOIN cms.account_roles ar ON r.id = ar.role_id
    WHERE ar.account_id = cms.get_current_user_account_id()
    LIMIT 1;

    RETURN v_role;
END;
$$;

grant execute on FUNCTION cms.get_current_user_role to authenticated;

-- SECTION: PERMISSION GROUPS
-- In this section, we define the permission groups table and the functions to check if a user can modify a permission group.
--
create table if not exists cms.permission_groups (
  id UUID primary key default gen_random_uuid (),
  name VARCHAR(100) not null unique,
  description TEXT,
  metadata JSONB default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ not null default NOW(),
  updated_at TIMESTAMPTZ not null default NOW(),
  created_by UUID references cms.accounts (id) default cms.get_current_user_account_id (),
  valid_from TIMESTAMPTZ default NOW(),
  valid_until TIMESTAMPTZ,
  -- Ensure valid_from is before valid_until
  constraint valid_time_range check (
    valid_from is null
    or valid_until is null
    or valid_from < valid_until
  )
);

comment on table cms.permission_groups is 'Table to store the permission groups';

comment on column cms.permission_groups.id is 'The ID of the permission group';

comment on column cms.permission_groups.name is 'The name of the permission group';

comment on column cms.permission_groups.description is 'The description of the permission group';

comment on column cms.permission_groups.metadata is 'The metadata of the permission group';

comment on column cms.permission_groups.created_at is 'The creation time of the permission group';

comment on column cms.permission_groups.updated_at is 'The last update time of the permission group';

comment on column cms.permission_groups.created_by is 'The user who created the permission group';

comment on column cms.permission_groups.valid_from is 'The time the permission group is valid from';

comment on column cms.permission_groups.valid_until is 'The time the permission group is valid until';

-- RLS
alter table cms.permission_groups ENABLE row LEVEL SECURITY;

-- Grant access to the permission_groups table
grant
select
,
  insert,
update,
delete on cms.permission_groups to authenticated,
service_role;

-- SECTION: PERMISSIONS
-- In this section, we define the permissions table and the functions to check if a user has permission for a specific resource.
--
create table if not exists cms.permissions (
  id UUID primary key default gen_random_uuid (),
  name VARCHAR(100) not null unique,
  description varchar(500),
  permission_type cms.permission_type not null, -- 'system' or 'data'
  -- For system permissions
  system_resource cms.system_resource,
  -- For data permissions
  scope cms.permission_scope,
  schema_name VARCHAR(64),
  table_name VARCHAR(64),
  column_name VARCHAR(64),
  action cms.system_action not null,
  constraints JSONB default null,
  conditions JSONB default null,
  metadata JSONB default '{}'::jsonb,
  created_at TIMESTAMPTZ not null default NOW(),
  updated_at TIMESTAMPTZ not null default NOW(),
  -- Ensure appropriate fields are filled based on type
  constraint valid_permission_type check (
    (
      permission_type = 'system'
      and system_resource is not null
      and scope is null -- system permissions should not have a scope
      and schema_name is null -- system permissions should not have a schema_name
      and table_name is null -- system permissions should not have a table_name
      and column_name is null -- system permissions should not have a column_name
    )
    or (
      permission_type = 'data'
      and scope is not null
      and (
        (
          scope = 'table'
          and schema_name is not null
          and table_name is not null
          and column_name is null
        )
        or (
          scope = 'column'
          and schema_name is not null
          and table_name is not null
          and column_name is not null
        )
      )
    )
    or (
      scope = 'storage'
      and metadata ->> 'bucket_name' is not null
      and metadata ->> 'path_pattern' is not null
    )
  ),
  -- Ensure name is unique
  constraint permissions_name_unique unique (name),
  -- Ensure schema_name is valid when scope is table or column
  constraint permissions_schema_name_check check (
    scope = 'storage'
    or schema_name ~ '^[a-zA-Z_][a-zA-Z0-9_]*$'
    or schema_name = '*'
  ),
  -- Ensure column_name is valid when scope is table or column
  constraint permissions_column_name_check check (
    scope = 'storage'
    or column_name ~ '^[a-zA-Z_][a-zA-Z0-9_]*$'
    or column_name = '*'
  )
);

comment on table cms.permissions is 'Table to store the permissions';

comment on column cms.permissions.id is 'The ID of the permission';

comment on column cms.permissions.name is 'The name of the permission';

comment on column cms.permissions.description is 'The description of the permission';

comment on column cms.permissions.permission_type is 'The type of the permission';

comment on column cms.permissions.system_resource is 'The system resource of the permission';

comment on column cms.permissions.scope is 'The scope of the permission';

comment on column cms.permissions.schema_name is 'The schema name of the permission';

comment on column cms.permissions.table_name is 'The table name of the permission';

comment on column cms.permissions.column_name is 'The column name of the permission';

comment on column cms.permissions.action is 'The action of the permission';

comment on column cms.permissions.constraints is 'The constraints of the permission';

comment on column cms.permissions.conditions is 'The conditions of the permission';

comment on column cms.permissions.metadata is 'The metadata of the permission';

comment on column cms.permissions.created_at is 'The creation time of the permission';

comment on column cms.permissions.updated_at is 'The last update time of the permission';

-- Grant access to the permissions table
grant
select
,
  insert,
update,
delete on table cms.permissions to authenticated,
service_role;

-- Indexes
create index idx_permissions_type_resource on cms.permissions (permission_type, system_resource);

create index idx_permissions_scope_schema_table on cms.permissions (scope, schema_name, table_name);

-- RLS
alter table cms.permissions ENABLE row LEVEL SECURITY;

-- SECTION: ACCOUNT PERMISSIONS
-- In this section, we define the account permissions table and the functions to check if a user has permission for a specific resource.
--
-- This function is used to check if a user has permission for a specific permission. It can be reused for both system and data permissions.
create table cms.account_permissions (
  account_id UUID not null references cms.accounts (id) on delete CASCADE,
  permission_id UUID not null references cms.permissions (id) on delete CASCADE,
  is_grant BOOLEAN not null, -- TRUE = explicitly grant, FALSE = explicitly deny
  granted_at TIMESTAMPTZ not null default NOW(),
  granted_by UUID references cms.accounts (id),
  valid_from TIMESTAMPTZ default NOW(),
  valid_until TIMESTAMPTZ,
  metadata JSONB default '{}'::jsonb,
  primary key (account_id, permission_id),
  -- Ensure valid_from is before valid_until
  constraint valid_time_range check (
    valid_from is null
    or valid_until is null
    or valid_from < valid_until
  )
);

comment on table cms.account_permissions is 'Table to store the account permissions';

comment on column cms.account_permissions.account_id is 'The ID of the account';

comment on column cms.account_permissions.permission_id is 'The ID of the permission';

comment on column cms.account_permissions.is_grant is 'Whether the permission is granted';

comment on column cms.account_permissions.granted_at is 'The time the permission was granted';

comment on column cms.account_permissions.granted_by is 'The user who granted the permission';

comment on column cms.account_permissions.valid_from is 'The time the permission is valid from';

comment on column cms.account_permissions.valid_until is 'The time the permission is valid until';

comment on column cms.account_permissions.metadata is 'The metadata of the permission';

-- Grant access to the account_permissions table
grant
select
,
  insert,
update,
delete on table cms.account_permissions to authenticated,
service_role;

-- RLS
alter table cms.account_permissions ENABLE row LEVEL SECURITY;

-- Role-permission assignments
create table if not exists cms.role_permissions (
  role_id UUID not null references cms.roles (id) on delete CASCADE,
  permission_id UUID not null references cms.permissions (id) on delete CASCADE,
  granted_at TIMESTAMPTZ not null default NOW(),
  granted_by UUID references cms.accounts (id),
  valid_from TIMESTAMPTZ default NOW(),
  valid_until TIMESTAMPTZ,
  conditions JSONB default null,
  metadata JSONB default '{}'::jsonb,
  primary key (role_id, permission_id),
  -- Ensure valid_from is before valid_until
  constraint valid_time_range check (
    valid_from is null
    or valid_until is null
    or valid_from < valid_until
  )
);

comment on table cms.role_permissions is 'Table to store the role permissions';

comment on column cms.role_permissions.role_id is 'The ID of the role';

comment on column cms.role_permissions.permission_id is 'The ID of the permission';

comment on column cms.role_permissions.granted_at is 'The time the permission was granted';

comment on column cms.role_permissions.granted_by is 'The user who granted the permission';

comment on column cms.role_permissions.valid_from is 'The time the permission is valid from';

comment on column cms.role_permissions.valid_until is 'The time the permission is valid until';

comment on column cms.role_permissions.conditions is 'The conditions of the permission';

comment on column cms.role_permissions.metadata is 'The metadata of the permission';

-- Grant access to the role_permissions table
grant
select
,
  insert,
update,
delete on table cms.role_permissions to authenticated,
service_role;

-- RLS
alter table cms.role_permissions ENABLE row LEVEL SECURITY;

-- Indexes
create index idx_role_permissions_role_id on cms.role_permissions (role_id);

create index idx_role_permissions_permission_id on cms.role_permissions (permission_id);

-- SECTION: PERMISSION GROUPS PERMISSIONS
-- In this section, we define the permission groups permissions table and the functions to check if a user can modify a permission group.
--
create table if not exists cms.permission_group_permissions (
  group_id UUID not null references cms.permission_groups (id) on delete CASCADE,
  permission_id UUID not null references cms.permissions (id) on delete CASCADE,
  added_at TIMESTAMPTZ not null default NOW(),
  added_by UUID references cms.accounts (id),
  conditions JSONB default null,
  metadata JSONB default '{}'::jsonb,
  primary key (group_id, permission_id)
);

comment on table cms.permission_group_permissions is 'Table to store the permission group permissions';

comment on column cms.permission_group_permissions.group_id is 'The ID of the permission group';

comment on column cms.permission_group_permissions.permission_id is 'The ID of the permission';

comment on column cms.permission_group_permissions.added_at is 'The time the permission was added';

comment on column cms.permission_group_permissions.added_by is 'The user who added the permission';

comment on column cms.permission_group_permissions.conditions is 'The conditions of the permission';

comment on column cms.permission_group_permissions.metadata is 'The metadata of the permission';

grant
select
,
  insert,
update,
delete on table cms.permission_group_permissions to authenticated,
service_role;

-- RLS
alter table cms.permission_group_permissions ENABLE row LEVEL SECURITY;

-- Indexes
create index idx_permission_group_permissions_group on cms.permission_group_permissions (group_id);

-- SECTION: PERMISSIONS
-- This function is used to check if a user has permission for a specific permission. It can be reused for both system and data permissions. Uses SECURITY DEFINER to avoid infinite loops when the function is used within RLS policies.
create or replace function cms.has_permission (p_account_id UUID, p_permission_id UUID) RETURNS BOOLEAN security definer
set
  row_security = off
set
  statement_timeout = '5s'
set
  lock_timeout = '3s'
set
  SEARCH_PATH to '' as $$
BEGIN
    -- First check for explicit denials (which take precedence)
    IF EXISTS (SELECT 1
               FROM cms.account_permissions ap
               WHERE ap.account_id = p_account_id
                 AND ap.permission_id = p_permission_id
                 AND ap.is_grant = FALSE
                 AND (ap.valid_until IS NULL OR ap.valid_until > NOW())) THEN
        RETURN FALSE; -- Explicit denial takes precedence
    END IF;

    -- Check for any valid permission grant path
    RETURN EXISTS (
        -- Direct permission grants
        SELECT 1
        FROM cms.account_permissions ap
        WHERE ap.account_id = p_account_id
          AND ap.permission_id = p_permission_id
          AND ap.is_grant = TRUE
          AND (ap.valid_until IS NULL OR ap.valid_until > NOW())

        UNION

        -- Role-based permissions (direct path)
        SELECT 1
        FROM cms.account_roles ar
                 JOIN cms.role_permissions rp ON ar.role_id = rp.role_id
        WHERE ar.account_id = p_account_id
          AND rp.permission_id = p_permission_id
          AND (ar.valid_until IS NULL OR ar.valid_until > NOW())
          AND (rp.valid_until IS NULL OR rp.valid_until > NOW())

        UNION

        -- Permission group path
        SELECT 1
        FROM cms.account_roles ar
                 JOIN cms.role_permission_groups rpg ON ar.role_id = rpg.role_id
                 JOIN cms.permission_group_permissions pgp ON rpg.group_id = pgp.group_id
        WHERE ar.account_id = p_account_id
          AND pgp.permission_id = p_permission_id
          AND (ar.valid_until IS NULL OR ar.valid_until > NOW())
          AND (rpg.valid_until IS NULL OR rpg.valid_until > NOW()));
END;
$$ LANGUAGE plpgsql;

grant
execute on function cms.has_permission to authenticated,
service_role;

-- SECTION: SYSTEM PERMISSIONS
-- This function is used to check if a user has system permission for a specific system resource. System resources are resources that belong to CMS itself, not the end application being managed. For example: table, role, permission, etc. Uses SECURITY DEFINER to avoid infinite loops when the function is used within RLS policies.
create or replace function cms.has_admin_permission (
  p_resource cms.system_resource,
  p_action cms.system_action
) RETURNS BOOLEAN security definer
set
  row_security = off
set
  SEARCH_PATH to '' as $$
DECLARE
    v_permission_id UUID;
BEGIN
    -- Check if user has admin access
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    -- Find the permission key for the resource and action
    RETURN EXISTS (SELECT 1
                   FROM cms.permissions p
                   WHERE permission_type = 'system'
                     AND system_resource = p_resource
                     AND (action = p_action OR action = '*')
                     AND cms.has_permission(cms.get_current_user_account_id(), p.id));
END;
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.has_admin_permission to authenticated,
service_role;

-- Check storage access using path patterns in DATA permissions
create or replace function cms.has_storage_permission (
  p_bucket_name TEXT,
  p_action cms.system_action,
  p_object_path TEXT
) RETURNS BOOLEAN SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_account_id       UUID;
    v_user_id          TEXT;
    v_permission       RECORD;
    v_allowed_bucket   TEXT;
    v_path_pattern     TEXT;
    v_resolved_pattern TEXT;
BEGIN
    -- Basic validation
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    IF p_object_path IS NULL or p_object_path = '' THEN
        RETURN FALSE;
    END IF;

    if p_bucket_name is null or p_bucket_name = '' then
        return false;
    end if;

    v_account_id := cms.get_current_user_account_id();
    IF v_account_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Get user ID for path variable substitution
    v_user_id := (SELECT auth.uid()::TEXT);

    -- Check storage permissions (DATA permissions with storage scope)
    FOR v_permission IN
        SELECT p.metadata
        FROM cms.permissions p
        WHERE p.permission_type = 'data'
          AND p.scope = 'storage'
          AND (p.action = p_action OR p.action = '*')
          AND cms.has_permission(v_account_id, p.id)
        LOOP
            -- Extract bucket and path constraints from metadata
            v_allowed_bucket := v_permission.metadata ->> 'bucket_name';
            v_path_pattern := v_permission.metadata ->> 'path_pattern';

            -- Check bucket constraint
            IF v_allowed_bucket IS NOT NULL
                AND v_allowed_bucket != '*'
                AND v_allowed_bucket != p_bucket_name THEN
                CONTINUE;
            END IF;

            -- Check path pattern constraint
            IF v_path_pattern IS NOT NULL THEN
                -- Substitute variables in pattern
                v_resolved_pattern := v_path_pattern;
                v_resolved_pattern := replace(v_resolved_pattern, '{{user_id}}', v_user_id);
                v_resolved_pattern := replace(v_resolved_pattern, '{{account_id}}', v_account_id::TEXT);

                -- Convert wildcards to SQL LIKE patterns
                v_resolved_pattern := replace(v_resolved_pattern, '*', '%');

                -- Check if path matches pattern
                IF NOT (p_object_path LIKE v_resolved_pattern) THEN
                    CONTINUE;
                END IF;
            END IF;

            -- All constraints passed - user has access
            RETURN TRUE;
        END LOOP;

    -- No matching permission found
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.has_storage_permission to authenticated;

-- SECTION: CONFIGURATION RLS POLICIES
-- READ(cms.configuration)
create policy read_configuration_value on cms.configuration for
select
  to authenticated using (cms.account_has_admin_access ());

-- UPDATE(cms.configuration)
create policy update_configuration_value on cms.configuration
for update
  to authenticated using (
    cms.has_admin_permission (
      'system_setting'::cms.system_resource,
      'update'::cms.system_action
    )
  )
with
  check (
    cms.has_admin_permission (
      'system_setting'::cms.system_resource,
      'update'::cms.system_action
    )
  );

-- DELETE(cms.configuration)
create policy delete_configuration_value on cms.configuration for delete to authenticated using (
  cms.has_admin_permission (
    'system_setting'::cms.system_resource,
    'delete'::cms.system_action
  )
);

-- INSERT(cms.configuration)
create policy insert_configuration_value on cms.configuration for insert to authenticated
with
  check (
    cms.has_admin_permission (
      'system_setting'::cms.system_resource,
      'insert'::cms.system_action
    )
  );

-- SECTION: SUPABASE STORAGE RLS POLICIES
-- Simple policies using the single permission function
create policy "cms_storage_upload" on storage.objects for INSERT to authenticated
with
  check (
    cms.has_storage_permission (bucket_id, 'insert'::cms.system_action, name)
  );

create policy "cms_storage_select" on storage.objects for
select
  to authenticated using (
    cms.has_storage_permission (bucket_id, 'select'::cms.system_action, name)
  );

create policy "cms_storage_update" on storage.objects
for update
  to authenticated using (
    cms.has_storage_permission (bucket_id, 'update'::cms.system_action, name)
  );

create policy "cms_storage_delete" on storage.objects for DELETE to authenticated using (
  cms.has_storage_permission (bucket_id, 'delete'::cms.system_action, name)
);

-- SECTION: DATA PERMISSIONS
-- This function is used to check if a user has data permission for a specific data resource. Data resources are data that belongs to the end application being managed, not CMS itself. Uses SECURITY DEFINER to avoid infinite loops when the function is used within RLS policies.
create or replace function cms.has_data_permission (
  p_action cms.system_action,
  p_schema_name VARCHAR,
  p_table_name VARCHAR default null
) RETURNS BOOLEAN security definer
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_permission_id UUID;
BEGIN
    -- Check if user has admin access
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    -- Table-level permission
    IF p_schema_name IS NOT NULL AND p_table_name IS NOT NULL THEN
        IF exists(SELECT 1
                  FROM cms.permissions p
                  WHERE permission_type = 'data'
                    AND (action = p_action OR action = '*')
                    AND scope = 'table'
                    AND (schema_name = p_schema_name OR schema_name = '*')
                    AND (table_name = p_table_name OR table_name = '*')
                    AND cms.has_permission(cms.get_current_user_account_id(), p.id))
        THEN
            RETURN TRUE;
        END IF;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.has_data_permission to authenticated,
service_role;

-- SECTION: TABLE METADATA
-- In this section, we define the table metadata table. The table metadata table is used to store the metadata for the tables in the database.
create table if not exists cms.table_metadata (
  schema_name VARCHAR(64) not null,
  table_name VARCHAR(64) not null,
  display_name VARCHAR(255),
  description TEXT,
  display_format TEXT,
  is_visible BOOLEAN default true,
  ordering INTEGER,
  -- Keys config
  keys_config JSONB default '{}'::jsonb,
  -- Columns config - JSONB structure keyed by column name
  columns_config JSONB default '{}'::jsonb,
  -- Relations config - Array of relation objects
  relations_config JSONB default '[]'::jsonb,
  -- UI customization
  ui_config JSONB default '{}'::jsonb,
  -- Can it be searched?
  is_searchable BOOLEAN default true,
  created_at TIMESTAMPTZ not null default NOW(),
  updated_at TIMESTAMPTZ not null default NOW(),
  primary key (schema_name, table_name)
);

comment on table cms.table_metadata is 'Table metadata for the database. This is used to store the metadata for the tables in the database.';

comment on column cms.table_metadata.schema_name is 'The schema of the table';

comment on column cms.table_metadata.table_name is 'The name of the table';

comment on column cms.table_metadata.display_name is 'The display name of the table';

comment on column cms.table_metadata.description is 'The description of the table';

comment on column cms.table_metadata.display_format is 'The display format of the table';

comment on column cms.table_metadata.is_visible is 'Whether the table is visible';

comment on column cms.table_metadata.ordering is 'The ordering of the table';

comment on column cms.table_metadata.keys_config is 'The keys config of the table';

comment on column cms.table_metadata.columns_config is 'The columns config of the table';

comment on column cms.table_metadata.relations_config is 'The relations config of the table';

comment on column cms.table_metadata.ui_config is 'The UI config of the table';

comment on column cms.table_metadata.is_searchable is 'Whether the table is searchable';

comment on column cms.table_metadata.created_at is 'The creation time of the table';

comment on column cms.table_metadata.updated_at is 'The last update time of the table';

-- Grants
grant
select
,
update on table cms.table_metadata to authenticated,
service_role;

-- RLS
alter table cms.table_metadata ENABLE row LEVEL SECURITY;

-- RLS Policies
-- SELECT(table_metadata)
-- We allow authenticated users to view table metadata if they have the select permission for the table.
create policy view_table_metadata on cms.table_metadata for
select
  to AUTHENTICATED using (
    cms.has_data_permission (
      'select'::cms.system_action,
      schema_name,
      table_name
    )
  );

-- UPDATE(table_metadata)
-- We allow authenticated users to update table metadata if they have the update permission for the table.
create policy update_table_metadata on cms.table_metadata
for update
  to AUTHENTICATED using (
    cms.has_admin_permission (
      'table'::cms.system_resource,
      'update'::cms.system_action
    )
  );

--
-- SECTION: ROLE PERMISSION GROUPS
-- In this section, we define the role permission groups table and the functions to check if a user can modify a permission group.
--
create table if not exists cms.role_permission_groups (
  role_id UUID not null references cms.roles (id) on delete CASCADE,
  group_id UUID not null references cms.permission_groups (id) on delete CASCADE,
  assigned_at TIMESTAMPTZ not null default NOW(),
  assigned_by UUID references cms.accounts (id),
  valid_from TIMESTAMPTZ default NOW(),
  valid_until TIMESTAMPTZ,
  metadata JSONB default '{}'::jsonb,
  primary key (role_id, group_id),
  -- Ensure valid_from is before valid_until
  constraint valid_time_range check (
    valid_from is null
    or valid_until is null
    or valid_from < valid_until
  )
);

comment on table cms.role_permission_groups is 'Table to store the role permission groups';

comment on column cms.role_permission_groups.role_id is 'The ID of the role';

comment on column cms.role_permission_groups.group_id is 'The ID of the permission group';

comment on column cms.role_permission_groups.assigned_at is 'The time the role permission group was assigned';

comment on column cms.role_permission_groups.assigned_by is 'The user who assigned the role permission group';

comment on column cms.role_permission_groups.valid_from is 'The time the role permission group is valid from';

comment on column cms.role_permission_groups.valid_until is 'The time the role permission group is valid until';

comment on column cms.role_permission_groups.metadata is 'The metadata of the role permission group';

-- Grants
grant
select
,
  insert,
update,
delete on table cms.role_permission_groups to authenticated,
service_role;

-- RLS
alter table cms.role_permission_groups ENABLE row LEVEL SECURITY;

-- Indexes
create index idx_role_permission_groups_valid on cms.role_permission_groups (valid_until)
where
  valid_until is not null;

-- SECTION: GET USER MAX ROLE rank
-- In this section, we define the get user max role rank function. This function is used to get the maximum role rank for a specific account.
create or replace function cms.get_user_max_role_rank (p_account_id UUID) RETURNS INTEGER
set
  search_path = '' as $$
DECLARE
    v_max_rank INTEGER;
BEGIN
    -- Input validation
    IF p_account_id IS NULL THEN
        RETURN null;
    END IF;

    -- Simple query, no locks - MVCC handles consistency
    SELECT MAX(r.rank)
    INTO v_max_rank
    FROM cms.account_roles ar
             JOIN cms.roles r ON ar.role_id = r.id
    WHERE ar.account_id = p_account_id
      AND (ar.valid_until IS NULL OR ar.valid_until > NOW())
      AND (r.valid_until IS NULL OR r.valid_until > NOW());

    RETURN COALESCE(v_max_rank, null);
END;
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.get_user_max_role_rank to authenticated,
service_role;

-- SECTION: CAN VIEW PERMISSION GROUP
-- In this section, we define the can view permission group function. This function is used to check if a user can view a specific permission group.
create or replace function cms.can_view_permission_group (p_account_id UUID, p_group_id UUID) RETURNS BOOLEAN security definer
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_user_max_rank INTEGER;
BEGIN
    -- Check if user has admin access
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    -- Get the user's maximum role rank
    v_user_max_rank := cms.get_user_max_role_rank(p_account_id);

    RETURN EXISTS (
        -- Access through roles
        SELECT 1
        FROM cms.account_roles ar
                 JOIN cms.role_permission_groups rpg ON ar.role_id = rpg.role_id
        WHERE ar.account_id = p_account_id
          AND rpg.group_id = p_group_id)
        -- Access as creator
        OR EXISTS (SELECT 1
                   FROM cms.permission_groups pg
                   WHERE pg.id = p_group_id
                     AND pg.created_by = p_account_id)
        -- Access based on role rank (including equal rank)
        OR EXISTS (SELECT 1
                   FROM cms.role_permission_groups rpg
                            JOIN cms.roles r ON rpg.role_id = r.id
                   WHERE rpg.group_id = p_group_id
                     AND r.rank <= v_user_max_rank);
END;
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.can_view_permission_group to authenticated,
service_role;

-- SECTION: LOCK ORDERING UTILITIES
-- Create a function to lock multiple resources in a consistent order
create or replace function cms.lock_resources_ordered (
  p_accounts UUID[] default '{}'::UUID[],
  p_roles UUID[] default '{}'::UUID[],
  p_permission_groups UUID[] default '{}'::UUID[],
  p_permissions UUID[] default '{}'::UUID[]
) RETURNS VOID SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
BEGIN
    -- Order and lock accounts
    IF array_length(p_accounts, 1) IS NOT NULL THEN
        PERFORM id
        FROM cms.accounts
        WHERE id = ANY (p_accounts)
        ORDER BY id
        FOR UPDATE;
    END IF;

    -- Order and lock roles
    IF array_length(p_roles, 1) IS NOT NULL THEN
        PERFORM id
        FROM cms.roles
        WHERE id = ANY (p_roles)
        ORDER BY id
        FOR UPDATE;
    END IF;

    -- Order and lock permission groups
    IF array_length(p_permission_groups, 1) IS NOT NULL THEN
        PERFORM id
        FROM cms.permission_groups
        WHERE id = ANY (p_permission_groups)
        ORDER BY id
        FOR UPDATE;
    END IF;

    -- Order and lock permissions
    IF array_length(p_permissions, 1) IS NOT NULL THEN
        PERFORM id
        FROM cms.permissions
        WHERE id = ANY (p_permissions)
        ORDER BY id
        FOR UPDATE;
    END IF;
END;
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.lock_resources_ordered to authenticated;

-- SECTION: CAN ACTION ACCOUNT
-- In this section, we define the can action account function. This function is used to check if a user can action a specific account. Uses SECURITY DEFINER to avoid infinite loops when the function is used within RLS policies.
create or replace function cms.can_action_account (
  p_target_account_id uuid,
  p_action cms.system_action
) RETURNS boolean SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_account_id            UUID;
    v_account_role_rank int;
    v_target_role_rank  int;
BEGIN
    -- Basic validation
    IF p_target_account_id IS NULL OR p_action IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Verify admin access and permissions
    IF NOT cms.has_admin_permission('account'::cms.system_resource, p_action) THEN
        RETURN FALSE;
    END IF;

    v_account_id := cms.get_current_user_account_id();
    IF v_account_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Self-modification rules
    IF v_account_id = p_target_account_id THEN
        -- Cannot delete own account
        IF p_action = 'delete' THEN
            RETURN FALSE;
        END IF;
        RETURN TRUE; -- Other self-modifications allowed
    END IF;

    -- Get priorities (simple reads)
    v_account_role_rank := cms.get_user_max_role_rank(v_account_id);
    v_target_role_rank := coalesce(cms.get_user_max_role_rank(p_target_account_id), 0);

    -- Higher role rank can action lower rank accounts
    RETURN v_account_role_rank > v_target_role_rank;
END;
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.can_action_account to authenticated,
service_role;

-- SECTION: CAN MODIFY PERMISSION
-- In this section, we define the can modify permission function. This function is used to check if a user can modify a specific permission. Uses SECURITY DEFINER to avoid infinite loops when the function is used within RLS policies.
create or replace function cms.can_modify_permission (
  p_permission_id UUID,
  p_action cms.system_action default 'update'
) RETURNS BOOLEAN security definer
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_user_max_rank             INTEGER;
    v_highest_role_using_permission INTEGER;
    v_permission_locked             RECORD;
BEGIN
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    -- Lock the permission
    SELECT id
    INTO v_permission_locked
    FROM cms.permissions
    WHERE id = p_permission_id
        FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- First check: Does user have admin permission to manage permissions?
    IF NOT cms.has_admin_permission('permission'::cms.system_resource, p_action) THEN
        RETURN FALSE;
    END IF;

    -- Get user's max rank
    v_user_max_rank := cms.get_user_max_role_rank(cms.get_current_user_account_id());

    -- Find the highest rank role that uses this permission (with locking)
    SELECT r.rank
    INTO v_highest_role_using_permission
    FROM cms.role_permissions rp
             JOIN cms.roles r ON rp.role_id = r.id
    WHERE rp.permission_id = p_permission_id
        FOR SHARE;
    -- Just reading, so SHARE is enough

    -- If no roles use this permission, default to 0
    v_highest_role_using_permission := COALESCE(v_highest_role_using_permission, 0);

    -- User must have higher rank than any role using this permission
    RETURN v_user_max_rank > v_highest_role_using_permission;
END;
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.can_modify_permission to authenticated;

-- SECTION: CAN DELETE PERMISSION
-- In this section, we define the can delete permission function. This function is used to check if a user can delete a specific permission.
create or replace function cms.can_delete_permission (p_permission_id UUID) RETURNS BOOLEAN VOLATILE
set
  search_path = '' as $$
DECLARE
    v_user_max_rank             INTEGER;
    v_highest_role_using_permission INTEGER;
    v_is_in_use                     BOOLEAN;
BEGIN
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    -- Basic modification check first
    IF NOT cms.can_modify_permission(p_permission_id, 'delete') THEN
        RETURN FALSE;
    END IF;

    -- Additional checks for deletion:

    -- Check if permission is in use by permission groups
    SELECT EXISTS (SELECT 1
                   FROM cms.permission_group_permissions
                   WHERE permission_id = p_permission_id)
    INTO v_is_in_use;

    IF v_is_in_use THEN
        -- Permission is in use by permission groups - require escalation instead of direct deletion
        RETURN FALSE;
    END IF;

    -- Check if permission is in use by roles
    SELECT EXISTS (SELECT 1
                   FROM cms.role_permissions
                   WHERE permission_id = p_permission_id)
    INTO v_is_in_use;

    IF v_is_in_use THEN
        -- Permission is in use by roles - require escalation or disallow
        RETURN FALSE;
    END IF;

    -- Check if permission is directly assigned to accounts
    SELECT EXISTS (SELECT 1
                   FROM cms.account_permissions
                   WHERE permission_id = p_permission_id)
    INTO v_is_in_use;

    IF v_is_in_use THEN
        -- Permission is directly assigned to accounts - require escalation instead of direct deletion
        RETURN FALSE;
    END IF;

    -- If we get here, permission can be safely deleted
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
grant
execute on FUNCTION cms.can_delete_permission to authenticated;

-- SECTION: CAN MODIFY PERMISSION GROUP PERMISSIONS
-- In this section, we define the can modify permission group permissions function. This function is used to check if a user can modify the permissions of a specific permission group. Uses SECURITY DEFINER to avoid infinite loops when the function is used within RLS policies.
create or replace function cms.can_modify_permission_group_permissions (p_group_id UUID, p_action cms.system_action) RETURNS BOOLEAN security definer
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_user_max_rank             INTEGER;
    v_role_using_group_max_rank INTEGER;
BEGIN
    -- First check: Does user have admin permission to manage permission groups?
    IF NOT cms.has_admin_permission('permission'::cms.system_resource, p_action) THEN
        raise exception 'You do not have permission to manage permission groups';
    END IF;

    -- Check user rank
    v_user_max_rank := cms.get_user_max_role_rank(cms.get_current_user_account_id());

    if v_user_max_rank is null then
        raise exception 'This user does not have any roles';
    end if;

    -- get the highest rank role that uses this group
    select max(r.rank)
    into v_role_using_group_max_rank
    from cms.role_permission_groups rpg
             join cms.roles r on rpg.role_id = r.id
    where rpg.group_id = p_group_id;

    if coalesce(v_role_using_group_max_rank, 0) > v_user_max_rank then
        raise exception 'This user cannot modify this permission group because it is used by a role with a higher rank than their own.';
    end if;

    return true;
END;
$$ LANGUAGE plpgsql;

grant
execute on function cms.can_modify_permission_group_permissions to authenticated;

-- SECTION: CAN MODIFY PERMISSION GROUP
-- In this section, we define the can modify permission group function. This function is used to check if a user can modify a specific permission group. Uses SECURITY DEFINER to avoid infinite loops when the function is used within RLS policies.
create or replace function cms.can_modify_permission_group (p_group_id UUID, p_action cms.system_action) RETURNS BOOLEAN SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_user_max_rank     INTEGER;
    v_current_account_id    UUID;
    v_user_has_this_group   BOOLEAN;
    v_group_locked          RECORD;
    v_highest_role_rank INTEGER;
BEGIN
    -- First check: Does user have admin permission to manage permission groups?
    IF NOT cms.has_admin_permission('permission'::cms.system_resource, p_action) THEN
        RETURN FALSE;
    END IF;

    -- Lock the permission group
    SELECT id, created_by
    INTO v_group_locked
    FROM cms.permission_groups
    WHERE id = p_group_id
        FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Get the current account ID
    v_current_account_id := cms.get_current_user_account_id();

    -- Get the user's maximum role rank
    v_user_max_rank := cms.get_user_max_role_rank(v_current_account_id);

    IF v_user_max_rank IS NULL THEN
        RAISE EXCEPTION 'This user does not have any roles';
    END IF;

    -- For DELETE operations, check if user has this permission group through any of their roles
    IF p_action = 'delete' THEN
        SELECT EXISTS (SELECT 1
                       FROM cms.account_roles ar
                                JOIN cms.role_permission_groups rpg ON ar.role_id = rpg.role_id
                       WHERE ar.account_id = v_current_account_id
                         AND rpg.group_id = p_group_id
                           FOR SHARE -- Just checking
        )
        INTO v_user_has_this_group;

        -- User should not be able to delete groups they are part of
        IF v_user_has_this_group THEN
            RETURN FALSE;
        END IF;
    END IF;

    -- 🔒 SECURITY FIX: Find the HIGHEST rank role that uses this group
    -- First lock the role-group relationships to prevent concurrent changes
    PERFORM 1
    FROM cms.role_permission_groups rpg
    WHERE rpg.group_id = p_group_id
        FOR SHARE;

    -- Then get the highest rank (without locking since we already locked above)
    SELECT MAX(r.rank)
    INTO v_highest_role_rank
    FROM cms.role_permission_groups rpg
             JOIN cms.roles r ON rpg.role_id = r.id
    WHERE rpg.group_id = p_group_id;

    -- If no roles use this group, check if user created it
    IF v_highest_role_rank IS NULL THEN
        RETURN v_group_locked.created_by = v_current_account_id;
    END IF;

    IF p_action = 'delete' THEN
        -- For DELETE: User must have STRICTLY HIGHER rank than ALL roles using the group
        -- This prevents users from deleting groups used by equal or higher rank roles
        RETURN v_user_max_rank > v_highest_role_rank;
    ELSE
        -- For UPDATE/INSERT: User must have HIGHER OR EQUAL rank
        -- This allows users to modify groups assigned to their own role level
        RETURN v_user_max_rank >= v_highest_role_rank;
    END IF;
END;
$$ LANGUAGE plpgsql;

grant execute on function cms.can_modify_permission_group to authenticated;

-- SECTION: CAN VIEW ROLE PERMISSION GROUP
-- In this section, we define the can view role permission group function. This function is used to check if a user can view a specific role permission group.
create or replace function cms.can_view_role_permission_group (p_account_id UUID, p_role_id UUID) RETURNS BOOLEAN
set
  search_path = '' as $$
DECLARE
    v_user_max_rank INTEGER;
BEGIN
    -- Get the user's maximum role rank
    v_user_max_rank := cms.get_user_max_role_rank(p_account_id);

    RETURN EXISTS (
        -- Access through roles
        SELECT 1
        FROM cms.account_roles ar
        WHERE ar.account_id = p_account_id
          AND ar.role_id = p_role_id)
        -- Access based on role rank (including equal rank)
        OR EXISTS (SELECT 1
                   FROM cms.roles r
                   WHERE r.id = p_role_id
                     AND r.rank <= v_user_max_rank);
END;
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.can_view_role_permission_group to authenticated;

-- SECTION: CAN MODIFY ROLE PERMISSION GROUP
-- In this section, we define the can modify role permission group function. This function is used to check if a user can modify a specific role permission group.
create or replace function cms.can_modify_role_permission_group (
  p_account_id UUID,
  p_role_id UUID,
  p_action cms.system_action
) RETURNS BOOLEAN VOLATILE
set
  search_path = '' as $$
DECLARE
    v_user_max_rank INTEGER;
BEGIN
    -- First check: Does user have admin permission to modify roles at all?
    IF NOT cms.has_admin_permission('role'::cms.system_resource, p_action) THEN
        RETURN FALSE;
    END IF;

    -- Get the user's maximum role rank
    v_user_max_rank := cms.get_user_max_role_rank(p_account_id);

    RETURN EXISTS (
        -- Access based on role rank (strictly higher rank only)
        SELECT 1
        FROM cms.roles r
        WHERE r.id = p_role_id
          AND r.rank < v_user_max_rank);
END;
$$ LANGUAGE plpgsql;

grant
execute on FUNCTION cms.can_modify_role_permission_group to authenticated;

-- SECTION: CAN DELETE ROLE
-- In this section, we define the can delete role function. This function is used to check if a user can delete a specific role.
create or replace function cms.can_delete_role (p_role_id UUID) RETURNS BOOLEAN
set
  search_path = '' as $$
DECLARE
    v_user_max_rank  INTEGER;
    v_role_rank      INTEGER;
    v_user_has_role      BOOLEAN;
    v_current_account_id UUID;
BEGIN
    -- Basic checks
    IF p_role_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check admin access
    IF NOT cms.verify_admin_access() THEN
        RETURN FALSE;
    END IF;

    -- Check basic admin permission
    IF NOT cms.has_admin_permission('role'::cms.system_resource, 'delete'::cms.system_action) THEN
        RETURN FALSE;
    END IF;

    v_current_account_id := cms.get_current_user_account_id();
    IF v_current_account_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Get role rank (simple read)
    SELECT rank
    INTO v_role_rank
    FROM cms.roles
    WHERE id = p_role_id;

    IF v_role_rank IS NULL THEN
        RETURN FALSE; -- Role doesn't exist
    END IF;

    -- Check if user has this role (simple read)
    SELECT EXISTS (SELECT 1
                   FROM cms.account_roles
                   WHERE account_id = v_current_account_id
                     AND role_id = p_role_id
                     AND (valid_until IS NULL OR valid_until > NOW()))
    INTO v_user_has_role;

    IF v_user_has_role THEN
        RETURN FALSE; -- Can't delete own role
    END IF;

    -- Get user's max rank
    v_user_max_rank := cms.get_user_max_role_rank(v_current_account_id);

    -- Simple comparison - user must have higher rank
    RETURN v_user_max_rank > v_role_rank;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permissions
grant
execute on FUNCTION cms.can_delete_role to authenticated;

-- SECTION: ACCOUNT POLICIES
-- In this section, we define the account policies. The account policies are used to control the access to the accounts table.
-- SELECT(cms.accounts)
-- Can the current user view an account?
create policy select_accounts on cms.accounts for
select
  to AUTHENTICATED using (
    -- Any authenticated user with admin access can view the accounts table
    cms.verify_admin_access ()
  );

-- UPDATE(cms.accounts)
-- Can the current user update an account?
create policy update_accounts on cms.accounts
for update
  to AUTHENTICATED using (
    -- Users can update their own account if they have the update account permission
    cms.can_action_account (id, 'update')
  );

-- DELETE(cms.accounts)
-- Can the current user delete an account?
create policy delete_accounts on cms.accounts for DELETE to AUTHENTICATED using (
  -- Users can delete their own account
  cms.can_action_account (id, 'delete')
);

-- SECTION: PREVENT UPDATE AUTH USER ID
-- In this section, we define the prevent update auth user id function. This function is used to prevent updating the auth_user_id of an account.
create or replace function cms.prevent_update_auth_user_id () RETURNS TRIGGER SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
BEGIN
    -- Prevent updating auth_user_id for updates
    IF NEW.auth_user_id <> OLD.auth_user_id THEN
        RAISE EXCEPTION 'Cannot update auth_user_id';
    END IF;

    IF NEW.id <> OLD.id THEN
        RAISE EXCEPTION 'Cannot update id';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Prevent updating auth_user_id
create trigger prevent_update_auth_user_id BEFORE
update on cms.accounts for EACH row
execute FUNCTION cms.prevent_update_auth_user_id ();

-- SECTION: ACCOUNT PERMISSIONS POLICIES
-- In this section, we define the account permissions policies. The account permissions policies are used to control the access to the account permissions table.
-- SELECT(cms.account_permissions)
-- Can the current user view an account permission?
create policy view_account_permissions on cms.account_permissions for
select
  to authenticated using (
    -- Users can see their own permissions
    account_id = cms.get_current_user_account_id ()
    -- Users with permission management rights can see permissions of users with lower rank
    or (
      cms.has_admin_permission (
        'permission'::cms.system_resource,
        'select'::cms.system_action
      )
      and cms.get_user_max_role_rank (cms.get_current_user_account_id ()) > cms.get_user_max_role_rank (account_id)
    )
  );

-- SELECT(cms.role_permissions)
-- Can the current user view a role permission?
create policy view_role_permissions on cms.role_permissions for
select
  to AUTHENTICATED using (
    -- Users can view role permissions if they have the role assigned to them
    exists (
      select
        1
      from
        cms.account_roles ar
      where
        ar.account_id = cms.get_current_user_account_id ()
        and ar.role_id = role_id
    )
  );

-- INSERT(cms.role_permissions)
-- Can the current user insert a role permission?
create policy insert_role_permissions on cms.role_permissions for INSERT to authenticated
with
  check (
    cms.can_action_role (role_id, 'insert'::cms.system_action)
    and cms.has_admin_permission (
      'permission'::cms.system_resource,
      'insert'::cms.system_action
    )
  );

-- UPDATE(cms.role_permissions)
-- Can the current user update a role permission?
create policy update_role_permissions on cms.role_permissions
for update
  to authenticated using (
    cms.can_action_role (role_id, 'update')
    and cms.has_admin_permission ('permission'::cms.system_resource, 'update')
  );

-- DELETE(cms.role_permissions)
-- Can the current user delete a role permission?
create policy delete_role_permissions on cms.role_permissions for DELETE to authenticated using (
  cms.can_action_role (role_id, 'delete')
  and cms.has_admin_permission ('permission'::cms.system_resource, 'delete')
);

-- SELECT(cms.permissions)
-- Can the current user view a permission?
create policy view_permissions on cms.permissions for
select
  to authenticated using (
    -- Any authenticated user with admin access can view the permissions table
    cms.verify_admin_access ()
  );

-- INSERT(cms.permissions)
-- Can the current user insert a permission?
create policy insert_permissions on cms.permissions for insert to authenticated
with
  check (
    cms.has_admin_permission (
      'permission'::cms.system_resource,
      'insert'::cms.system_action
    )
  );

-- UPDATE(cms.permissions)
-- Can the current user update a permission?
create policy update_permissions on cms.permissions
for update
  to authenticated using (
    cms.has_admin_permission (
      'permission'::cms.system_resource,
      'update'::cms.system_action
    )
  )
with
  check (
    cms.has_admin_permission (
      'permission'::cms.system_resource,
      'update'::cms.system_action
    )
  );

-- DELETE(cms.permissions)
-- Can the current user delete a permission?
create policy delete_permissions on cms.permissions for DELETE to authenticated using (
  cms.has_admin_permission (
    'permission'::cms.system_resource,
    'delete'::cms.system_action
  )
);

-- INSERT(cms.account_permissions)
-- Can the current user insert an account permission?
create policy insert_account_permissions on cms.account_permissions for INSERT to authenticated
with
  check (
    cms.has_admin_permission (
      'permission'::cms.system_resource,
      'insert'::cms.system_action
    )
    and cms.get_user_max_role_rank (cms.get_current_user_account_id ()) > cms.get_user_max_role_rank (account_id)
  );

-- UPDATE(cms.account_permissions)
-- Can the current user update an account permission?
create policy update_account_permissions on cms.account_permissions
for update
  to authenticated using (
    cms.has_admin_permission (
      'permission'::cms.system_resource,
      'update'::cms.system_action
    )
    and cms.get_user_max_role_rank (cms.get_current_user_account_id ()) > cms.get_user_max_role_rank (account_id)
  );

-- DELETE(cms.account_permissions)
-- Can the current user delete an account permission?
create policy delete_account_permissions on cms.account_permissions for DELETE to authenticated using (
  cms.has_admin_permission (
    'permission'::cms.system_resource,
    'delete'::cms.system_action
  )
  and cms.get_user_max_role_rank (cms.get_current_user_account_id ()) > cms.get_user_max_role_rank (account_id)
);

-- SECTION: PERMISSION GROUP PERMISSIONS POLICIES
-- In this section, we define the permission group permissions policies. The permission group permissions policies are used to control the access to the permission group permissions table.
-- SELECT(cms.permission_group_permissions)
-- Can the current user view a permission group permission?
create policy view_permission_group_permissions on cms.permission_group_permissions for
select
  to authenticated using (
    cms.can_view_permission_group (cms.get_current_user_account_id (), group_id)
  );

-- INSERT(cms.permission_group_permissions)
-- Can the current user insert a permission group permission?
create policy insert_permission_group_permissions on cms.permission_group_permissions for INSERT to authenticated
with
  check (
    cms.can_modify_permission_group_permissions (group_id, 'insert'::cms.system_action)
  );

-- UPDATE(cms.permission_group_permissions)
-- Can the current user update a permission group permission?
create policy update_permission_group_permissions on cms.permission_group_permissions
for update
  to authenticated using (
    cms.can_modify_permission_group_permissions (group_id, 'update'::cms.system_action)
  );

-- DELETE(cms.permission_group_permissions)
-- Can the current user delete a permission group permission?
create policy delete_permission_group_permissions on cms.permission_group_permissions for DELETE to authenticated using (
  cms.can_modify_permission_group_permissions (group_id, 'delete'::cms.system_action)
);

-- SELECT(cms.roles)
-- Can the current user view a role?
create policy view_roles on cms.roles for
select
  to authenticated using (
    -- Any authenticated user with admin access can view the roles table
    cms.verify_admin_access ()
  );

-- UPDATE(cms.roles)
-- Can the current user update a role?
create policy update_roles on cms.roles
for update
  to authenticated using (cms.can_action_role (id, 'update'))
with
  check (cms.can_action_role (id, 'update'));

-- DELETE(cms.roles)
-- Can the current user delete a role?
create policy delete_roles on cms.roles for DELETE to authenticated using (cms.can_delete_role (id));

-- INSERT(cms.roles)
-- Can the current user insert a role?
create policy insert_roles on cms.roles for INSERT to authenticated
with
  check (
    -- The user must have the insert role permission AND
    cms.has_admin_permission (
      'role'::cms.system_resource,
      'insert'::cms.system_action
    )
    and
    -- The role rank must be less than the user's maximum role rank
    rank < cms.get_user_max_role_rank (cms.get_current_user_account_id ())
  );

-- SECTION: UPDATE ACCOUNT ROLES rank CHECK
-- In this section, we define the update account roles rank check function. This function is used to check if the user can update the rank of a role.
create or replace function cms.update_account_roles_rank_check () RETURNS trigger SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_user_max_rank  integer;
    v_current_account_id UUID;
BEGIN
    v_current_account_id := cms.get_current_user_account_id();
    IF v_current_account_id IS NULL THEN
        RAISE EXCEPTION 'No current user account found';
    END IF;

    -- Get the user's maximum role rank
    v_user_max_rank := cms.get_user_max_role_rank(v_current_account_id);

    -- Check if the new rank is higher than or equal to the user's maximum role rank
    IF NEW.rank >= v_user_max_rank THEN
        RAISE EXCEPTION 'Cannot modify a role with a rank higher than or equal to your maximum role rank (%). Your max rank: %, Role rank: %',
            v_user_max_rank, v_user_max_rank, NEW.rank;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add a trigger to check if the user can update the rank of a role
create trigger update_account_roles_rank_check before
update on cms.roles for each row
execute function cms.update_account_roles_rank_check ();

-- SELECT(cms.account_roles)
-- Can the current user view an account role?
create policy view_account_roles on cms.account_roles for
select
  to authenticated using
  -- Any authenticated user with admin access can view the role assigned to a user
  (cms.verify_admin_access ());

-- INSERT(cms.account_roles)
-- Can the current user insert an account role?
create policy insert_account_roles on cms.account_roles for INSERT to authenticated
with
  check (
    -- We verify if the user can modify the account role
    cms.can_modify_account_role (
      cms.get_current_user_account_id (),
      account_id,
      role_id,
      'insert'::cms.system_action
    )
  );

-- UPDATE(cms.account_roles)
-- Can the current user update an account role?
create policy update_account_roles on cms.account_roles
for update
  to authenticated using (
    cms.can_modify_account_role (
      cms.get_current_user_account_id (),
      account_id,
      role_id,
      'update'::cms.system_action
    )
  )
with
  check (
    cms.can_modify_account_role (
      cms.get_current_user_account_id (),
      account_id,
      role_id,
      'update'::cms.system_action
    )
  );

-- DELETE(cms.account_roles)
-- Can the current user delete an account role?
create policy delete_account_roles on cms.account_roles for DELETE to authenticated using (
  cms.can_modify_account_role (
    cms.get_current_user_account_id (),
    account_id,
    role_id,
    'delete'::cms.system_action
  )
);

-- SELECT(cms.permission_groups)
-- Can the current user view a permission group?
create policy view_permissions_groups on cms.permission_groups for
select
  using (
    cms.can_view_permission_group (cms.get_current_user_account_id (), id)
  );

-- UPDATE(cms.permission_groups)
-- Can the current user update a permission group?
create policy update_permissions_groups on cms.permission_groups
for update
  to authenticated using (
    cms.can_modify_permission_group (id, 'update'::cms.system_action)
  );

-- DELETE(cms.permission_groups)
-- Can the current user delete a permission group?
create policy delete_permissions_groups on cms.permission_groups for DELETE to authenticated using (
  cms.can_modify_permission_group (id, 'delete'::cms.system_action)
);

-- INSERT(cms.permission_groups)
-- Can the current user insert a permission group?
create policy insert_permission_groups on cms.permission_groups for insert to authenticated
with
  check (
    cms.has_admin_permission (
      'permission'::cms.system_resource,
      'insert'::cms.system_action
    )
  );

-- SELECT(cms.role_permission_groups)
-- Can the current user view a role permission group?
create policy view_role_permission_groups on cms.role_permission_groups for
select
  to authenticated using (
    cms.can_view_role_permission_group (cms.get_current_user_account_id (), role_id)
  );

-- INSERT(cms.role_permission_groups)
-- Can the current user insert a role permission group?
create policy insert_role_permission_groups on cms.role_permission_groups for insert to authenticated
with
  check (
    cms.can_modify_role_permission_group (
      cms.get_current_user_account_id (),
      role_id,
      'insert'::cms.system_action
    )
  );

-- UPDATE(cms.role_permission_groups)
-- Can the current user update a role permission group?
create policy update_role_permission_groups on cms.role_permission_groups
for update
  to authenticated using (
    cms.can_modify_role_permission_group (
      cms.get_current_user_account_id (),
      role_id,
      'update'::cms.system_action
    )
  );

-- DELETE(cms.role_permission_groups)
-- Can the current user delete a role permission group?
create policy delete_role_permission_groups on cms.role_permission_groups for DELETE to authenticated using (
  cms.can_modify_role_permission_group (
    cms.get_current_user_account_id (),
    role_id,
    'delete'::cms.system_action
  )
);

-- SECTION: SAVED VIEWS
-- In this section, we define the saved views table and the functions to check if a user can modify a saved view.
create table if not exists cms.saved_views (
  id UUID primary key default gen_random_uuid (),
  name VARCHAR(255) not null,
  description VARCHAR(500),
  view_type VARCHAR(50) not null, -- 'filter', 'dashboard', 'custom'
  config JSONB not null,
  created_by UUID references cms.accounts (id) on delete cascade default cms.get_current_user_account_id (),
  schema_name VARCHAR(64) not null,
  table_name VARCHAR(64) not null,
  foreign KEY (schema_name, table_name) references cms.table_metadata (schema_name, table_name) on delete CASCADE,
  -- Ensure schema_name is valid
  constraint saved_views_schema_name_check check (schema_name ~ '^[a-zA-Z_][a-zA-Z0-9_]*$'),
  -- Ensure table_name is valid
  constraint saved_views_table_name_check check (table_name ~ '^[a-zA-Z_][a-zA-Z0-9_]*$')
);

comment on table cms.saved_views is 'Table to store the saved views';

comment on column cms.saved_views.id is 'The ID of the saved view';

comment on column cms.saved_views.name is 'The name of the saved view';

comment on column cms.saved_views.description is 'The description of the saved view';

comment on column cms.saved_views.view_type is 'The type of the saved view';

comment on column cms.saved_views.config is 'The configuration of the saved view';

comment on column cms.saved_views.created_by is 'The user who created the saved view';

comment on column cms.saved_views.schema_name is 'The schema of the saved view';

comment on column cms.saved_views.table_name is 'The table of the saved view';

-- Grants
grant
select
,
  insert,
update,
delete on table cms.saved_views to authenticated,
service_role;

-- RLS
alter table cms.saved_views ENABLE row LEVEL SECURITY;

-- SECTION: SAVED VIEW ROLES
-- In this section, we define the saved view roles table and the functions to check if a user can modify a saved view role.
create table if not exists cms.saved_view_roles (
  view_id UUID references cms.saved_views (id) on delete CASCADE,
  role_id UUID references cms.roles (id) on delete CASCADE,
  primary key (view_id, role_id)
);

comment on table cms.saved_view_roles is 'Table to store the saved view roles';

comment on column cms.saved_view_roles.view_id is 'The ID of the saved view';

comment on column cms.saved_view_roles.role_id is 'The ID of the role';

-- Grants
grant
select
,
  insert,
  delete on table cms.saved_view_roles to authenticated,
  service_role;

-- RLS
alter table cms.saved_view_roles ENABLE row LEVEL SECURITY;

-- Index for performance
create index idx_saved_view_roles_role_id on cms.saved_view_roles (role_id);

-- SECTION: INSERT SAVED VIEWS
-- In this section, we define the insert saved views policy. This policy is used to control the access to the saved views table.
-- INSERT(cms.saved_views)
-- Can the current user insert a saved view?
create policy insert_saved_views on cms.saved_views for INSERT to authenticated
with
  check (
    created_by = cms.get_current_user_account_id ()
  );

-- UPDATE(cms.saved_views)
-- Can the current user update a saved view?
create policy update_saved_views on cms.saved_views
for update
  to authenticated using (
    created_by = cms.get_current_user_account_id ()
  )
with
  check (
    created_by = cms.get_current_user_account_id ()
  );

-- DELETE(cms.saved_views)
-- Can the current user delete a saved view?
create policy delete_saved_views on cms.saved_views for DELETE to authenticated using (
  created_by = cms.get_current_user_account_id ()
);

-- SELECT(cms.saved_views)
-- Can the current user view a saved view they have created?
create policy view_personal_saved_views on cms.saved_views for
select
  to authenticated using (
    created_by = cms.get_current_user_account_id ()
  );

-- SELECT(cms.saved_views)
-- Can the current user view a saved view shared with them using the saved view roles table?
create policy view_shared_saved_views on cms.saved_views for
select
  to authenticated using (
    exists (
      select
        1
      from
        cms.saved_view_roles
      where
        view_id = cms.saved_views.id
        and cms.account_has_role (cms.get_current_user_account_id (), role_id)
    )
  );

-- SELECT(cms.saved_view_roles)
-- Can the current user view a saved view they have created?
create policy view_personal_saved_view_roles on cms.saved_view_roles for
select
  to authenticated using (
    cms.account_has_role (cms.get_current_user_account_id (), role_id)
  );

-- INSERT(cms.saved_view_roles)
-- Can the current user insert a shared view if their role rank is higher than the view's role rank
create policy insert_shared_saved_views on cms.saved_view_roles for INSERT to authenticated
with
  check (
    cms.get_user_max_role_rank (cms.get_current_user_account_id ()) > (
      select
        rank
      from
        cms.roles
      where
        id = role_id
    )
  );

-- SECTION: INSERT SAVED VIEW
-- In this section, we define the insert saved view function. This function is used to insert a saved view and the roles that have access to it.
create or replace function cms.insert_saved_view (
  name varchar(255),
  description text,
  view_type varchar(50),
  config jsonb,
  schema_name varchar(64),
  table_name varchar(64),
  role_ids uuid[] default null
) RETURNS uuid
set
  search_path = '' as $$
DECLARE
    v_view_id    uuid;
    v_account_id uuid; -- Added declaration
    v_role_id    uuid;
BEGIN
    IF NOT cms.verify_admin_access() THEN
        RAISE EXCEPTION 'You do not have permission to insert views';
    END IF;

    -- Get current user's account ID
    v_account_id := cms.get_current_user_account_id();

    -- Insert the view
    INSERT INTO cms.saved_views (name, description, view_type, config, created_by, schema_name, table_name)
    VALUES (name, description, view_type, config, v_account_id, schema_name, table_name)
    RETURNING id INTO v_view_id;

    -- Insert the view role if provided
    IF role_ids IS NOT NULL THEN
        FOREACH v_role_id IN ARRAY role_ids
            LOOP
                INSERT INTO cms.saved_view_roles (view_id, role_id)
                VALUES (v_view_id, v_role_id);
            END LOOP;
    END IF;

    RETURN v_view_id; -- Return the created view ID
END;
$$ LANGUAGE plpgsql;

grant
execute on function cms.insert_saved_view to authenticated;

-- SECTION: GET USER VIEWS
-- In this section, we define the get user views function. This function is used to get the views that a user has access to.
create or replace function cms.get_user_views (
  p_schema_name text default null,
  p_table_name text default null
) RETURNS jsonb
set
  search_path = '' as $$
DECLARE
    v_account_id     UUID;
    v_result         jsonb;
    v_personal_views jsonb;
    v_team_views     jsonb;
    v_conditions     TEXT := 'TRUE';
BEGIN
    if not cms.verify_admin_access() then
        raise exception 'You do not have permission to view views';
    end if;

    -- Get current user's account ID
    v_account_id := cms.get_current_user_account_id();

    -- Build conditions
    IF p_schema_name IS NOT NULL THEN
        v_conditions := v_conditions || ' AND schema_name = ' || quote_literal(p_schema_name);
    END IF;

    IF p_table_name IS NOT NULL THEN
        v_conditions := v_conditions || ' AND table_name = ' || quote_literal(p_table_name);
    END IF;

    -- Get personal views (created by the user)
    EXECUTE format('
        SELECT COALESCE(jsonb_agg(to_jsonb(sv.*)), ''[]''::jsonb)
        FROM cms.saved_views sv
        WHERE sv.created_by = %L
        AND %s
    ', v_account_id, v_conditions) INTO v_personal_views;

    -- Get team views (shared with the user's roles)
    EXECUTE format('
        SELECT COALESCE(
            jsonb_agg(DISTINCT to_jsonb(sv.*)),
            ''[]''::jsonb
        )
        FROM cms.saved_views sv
        JOIN cms.saved_view_roles svr ON sv.id = svr.view_id
        JOIN cms.account_roles ar ON svr.role_id = ar.role_id
        WHERE ar.account_id = %L
        AND sv.created_by != %L
        AND %s
    ', v_account_id, v_account_id, v_conditions) INTO v_team_views;

    -- Combine into the requested format
    v_result := jsonb_build_object(
            'personal', COALESCE(v_personal_views, '[]'::jsonb),
            'team', COALESCE(v_team_views, '[]'::jsonb)
                );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

grant
execute on function cms.get_user_views to authenticated;

-- SECTION: GET ENUM VALUES
-- In this section, we define the get enum values function. This function is used to get the values of an enum for display purposes. We require SECURITY DEFINER because we need to access the pg_type and pg_enum tables.
create or replace function cms.get_enum_values (p_enum_name text) RETURNS JSONB SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_result JSONB;
BEGIN
    if not cms.verify_admin_access() then
        raise exception 'You do not have permission to view enum values';
    end if;

    -- Validate input
    p_enum_name := cms.sanitize_identifier(p_enum_name);

    -- Query PostgreSQL system catalogs for enum values
    SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
    INTO v_result
    FROM pg_type t
             JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = p_enum_name;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Grant execution rights
grant
execute on FUNCTION cms.get_enum_values to authenticated,
service_role;

-- SECTION: GENERATE DISPLAY NAME
-- In this section, we define the generate display name function. This function is used to generate a display name for a column.
create or replace function cms.generate_display_name (name text) RETURNS text LANGUAGE plpgsql
set
  search_path = '' as $$
DECLARE
    display_name text;
BEGIN
    display_name := name;

    -- Remove common abbreviations. Ex "account_id" becomes "account".
    display_name := replace(display_name, '_id', ' ');

    -- Replace underscores with spaces
    display_name := replace(display_name, '_', ' ');

    -- Capitalize first letter of each word
    display_name := initcap(display_name);

    RETURN display_name;
END;
$$;

-- SECTION: ENHANCED TYPE-AWARE VALUE FORMATTING
-- Helper function to format values based on PostgreSQL data types
create or replace function cms.format_typed_value (
  p_value jsonb,
  p_data_type text,
  p_udt_name text default null,
  p_udt_schema text default null
) RETURNS text
set
  search_path = '' as $$
DECLARE
    v_text_value    text;
    v_numeric_value text;
BEGIN
    -- Handle NULL values
    IF p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN
        RETURN 'NULL';
    END IF;

    -- Extract text representation
    v_text_value := p_value #>> '{}';

    -- Handle empty strings for non-text types
    IF v_text_value = '' AND p_data_type NOT IN ('text', 'varchar', 'char', 'character varying', 'character') THEN
        RETURN 'NULL';
    END IF;

    -- Format based on data type
    CASE p_data_type
        -- UUID type
        WHEN 'uuid' THEN -- Validate UUID format
        IF NOT v_text_value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            RAISE EXCEPTION 'Invalid UUID format: %. Expected format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', v_text_value
                USING ERRCODE = 'invalid_text_representation';
        END IF;
        RETURN format('%L::uuid', v_text_value);

        -- Integer types
        WHEN 'integer', 'int4' THEN v_numeric_value := trim(v_text_value);
                                    IF NOT v_numeric_value ~ '^-?[0-9]+$' THEN
                                        RAISE EXCEPTION 'Invalid integer value: %. Must be a whole number between -2147483648 and 2147483647', v_text_value
                                            USING ERRCODE = 'invalid_text_representation';
                                    END IF;
        -- Check bounds for 32-bit integer
                                    IF v_numeric_value::numeric NOT BETWEEN -2147483648 AND 2147483647 THEN
                                        RAISE EXCEPTION 'Integer value out of range: %. Must be between -2147483648 and 2147483647', v_text_value
                                            USING ERRCODE = '22003';
                                    END IF;
                                    RETURN v_numeric_value;

        WHEN 'bigint', 'int8' THEN v_numeric_value := trim(v_text_value);
                                   IF NOT v_numeric_value ~ '^-?[0-9]+$' THEN
                                       RAISE EXCEPTION 'Invalid bigint value: %. Must be a whole number', v_text_value
                                           USING ERRCODE = 'invalid_text_representation';
                                   END IF;
                                   RETURN v_numeric_value;

        WHEN 'smallint', 'int2' THEN v_numeric_value := trim(v_text_value);
                                     IF NOT v_numeric_value ~ '^-?[0-9]+$' THEN
                                         RAISE EXCEPTION 'Invalid smallint value: %. Must be a whole number between -32768 and 32767', v_text_value
                                             USING ERRCODE = 'invalid_text_representation';
                                     END IF;
                                     IF v_numeric_value::numeric NOT BETWEEN -32768 AND 32767 THEN
                                         RAISE EXCEPTION 'Smallint value out of range: %. Must be between -32768 and 32767', v_text_value
                                             USING ERRCODE = 'numeric_value_out_of_range';
                                     END IF;
                                     RETURN v_numeric_value;

        -- Decimal/Numeric types
        WHEN 'numeric', 'decimal' THEN v_numeric_value := trim(v_text_value);
                                       IF NOT v_numeric_value ~ '^-?[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?$' THEN
                                           RAISE EXCEPTION 'Invalid numeric value: %. Must be a valid decimal number', v_text_value
                                               USING ERRCODE = 'invalid_text_representation';
                                       END IF;
                                       RETURN v_numeric_value;

        -- Floating point types
        WHEN 'real', 'float4', 'double precision', 'float8' THEN v_numeric_value := trim(v_text_value);
        -- Allow special values for floating point
                                                                 IF v_numeric_value IN ('Infinity', '-Infinity', 'NaN') THEN
                                                                     RETURN format('%L::%s', v_numeric_value, p_data_type);
                                                                 END IF;
                                                                 IF NOT v_numeric_value ~ '^-?[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?$' THEN
                                                                     RAISE EXCEPTION 'Invalid floating point value: %. Must be a valid decimal number', v_text_value
                                                                         USING ERRCODE = 'invalid_text_representation';
                                                                 END IF;
                                                                 RETURN format('%s::%s', v_numeric_value, p_data_type);

        -- Boolean type
        WHEN 'boolean', 'bool' THEN CASE lower(trim(v_text_value))
            WHEN 'true', 't', '1', 'yes', 'y', 'on' THEN RETURN 'true';
            WHEN 'false', 'f', '0', 'no', 'n', 'off' THEN RETURN 'false';
            ELSE RAISE EXCEPTION 'Invalid boolean value: %. Must be true/false, t/f, 1/0, yes/no, y/n, or on/off', v_text_value
                USING ERRCODE = '22P02';
            END CASE;

        -- Date and time types
        WHEN 'date' THEN -- Validate date format
        BEGIN
            PERFORM v_text_value::date;
            RETURN format('%L::date', v_text_value);
        EXCEPTION
            WHEN OTHERS THEN
                RAISE EXCEPTION 'Invalid date value: %. Expected format: YYYY-MM-DD', v_text_value
                    USING ERRCODE = 'invalid_datetime_format';
        END;

        WHEN 'time', 'time without time zone' THEN BEGIN
            PERFORM v_text_value::time;
            RETURN format('%L::time', v_text_value);
        EXCEPTION
            WHEN OTHERS THEN
                RAISE EXCEPTION 'Invalid time value: %. Expected format: HH:MM:SS or HH:MM:SS.ffffff', v_text_value
                    USING ERRCODE = 'invalid_datetime_format';
        END;

        WHEN 'timestamp', 'timestamp without time zone' THEN BEGIN
            PERFORM v_text_value::timestamp;
            RETURN format('%L::timestamp', v_text_value);
        EXCEPTION
            WHEN OTHERS THEN
                RAISE EXCEPTION 'Invalid timestamp value: %. Expected format: YYYY-MM-DD HH:MM:SS', v_text_value
                    USING ERRCODE = 'invalid_datetime_format';
        END;

        WHEN 'timestamptz', 'timestamp with time zone' THEN BEGIN
            PERFORM v_text_value::timestamptz;
            RETURN format('%L::timestamptz', v_text_value);
        EXCEPTION
            WHEN OTHERS THEN
                RAISE EXCEPTION 'Invalid timestamptz value: %. Expected format: YYYY-MM-DD HH:MM:SS+TZ', v_text_value
                    USING ERRCODE = 'invalid_datetime_format';
        END;

        -- JSON types
        WHEN 'json' THEN BEGIN
            -- Validate JSON
            PERFORM p_value::json;
            RETURN format('%L::json', p_value::text);
        EXCEPTION
            WHEN OTHERS THEN
                RAISE EXCEPTION 'Invalid JSON value: %', p_value::text
                    USING ERRCODE = 'invalid_json';
        END;

        WHEN 'jsonb' THEN BEGIN
            -- Validate JSONB
            PERFORM p_value::jsonb;
            RETURN format('%L::jsonb', p_value::text);
        EXCEPTION
            WHEN OTHERS THEN
                RAISE EXCEPTION 'Invalid JSONB value: %', p_value::text
                    USING ERRCODE = 'invalid_json';
        END;

        -- Array types
        WHEN 'ARRAY' THEN IF jsonb_typeof(p_value) != 'array' THEN
            RAISE EXCEPTION 'Expected array value for array column, got: %', jsonb_typeof(p_value)
                USING ERRCODE = 'invalid_parameter_value';
                          END IF;
                          RETURN format('%L::%s', p_value::text, p_udt_name);

        -- User-defined types (enums, etc.)
        WHEN 'USER-DEFINED' THEN DECLARE
            v_qualified_type_name text;
            v_schema_condition    text;
        BEGIN
            -- Build qualified type name for casting
            IF p_udt_schema IS NOT NULL THEN
                v_qualified_type_name := format('%I.%I', p_udt_schema, p_udt_name);
                v_schema_condition := 'AND n.nspname = ' || quote_literal(p_udt_schema);
            ELSE
                v_qualified_type_name := quote_ident(p_udt_name);
                v_schema_condition := 'AND n.nspname = ''public''';
            END IF;

            -- First validate schema exists if specified
            IF p_udt_schema IS NOT NULL AND NOT EXISTS (SELECT 1
                                                        FROM pg_namespace
                                                        WHERE nspname = p_udt_schema) THEN
                RAISE EXCEPTION 'Schema does not exist: %', p_udt_schema
                    USING ERRCODE = 'invalid_schema_name';
            END IF;

            -- Check if it's an enum with schema awareness
            IF EXISTS (SELECT 1
                       FROM pg_type t
                                JOIN pg_namespace n ON t.typnamespace = n.oid
                                JOIN pg_enum e ON t.oid = e.enumtypid
                       WHERE t.typname = p_udt_name
                         AND (p_udt_schema IS NULL OR n.nspname = p_udt_schema)
                       LIMIT 1) THEN
                -- Validate enum value with schema awareness
                IF NOT EXISTS (SELECT 1
                               FROM pg_enum e
                                        JOIN pg_type t ON e.enumtypid = t.oid
                                        JOIN pg_namespace n ON t.typnamespace = n.oid
                               WHERE t.typname = p_udt_name
                                 AND (p_udt_schema IS NULL OR n.nspname = p_udt_schema)
                                 AND e.enumlabel = v_text_value) THEN
                    RAISE EXCEPTION 'Invalid enum value: % for type %. Valid values are: %',
                        v_text_value,
                        COALESCE(v_qualified_type_name, p_udt_name),
                        (SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
                         FROM pg_enum e
                                  JOIN pg_type t ON e.enumtypid = t.oid
                                  JOIN pg_namespace n ON t.typnamespace = n.oid
                         WHERE t.typname = p_udt_name
                           AND (p_udt_schema IS NULL OR n.nspname = p_udt_schema))
                        USING ERRCODE = 'invalid_parameter_value';
                END IF;
                RETURN format('%L::%s', v_text_value, v_qualified_type_name);
            ELSE
                -- For other user-defined types, cast with qualified type name
                RETURN format('%L::%s', v_text_value, v_qualified_type_name);
            END IF;
        END;

        -- Text types (default case)
        ELSE RETURN quote_literal(v_text_value);
        END CASE;

EXCEPTION
    WHEN OTHERS THEN
        -- Re-raise with additional context
        RAISE EXCEPTION 'Failed to format value "%" for data type "%": %',
            COALESCE(v_text_value, 'NULL'),
            COALESCE(p_data_type, 'unknown'),
            SQLERRM
            USING ERRCODE = SQLSTATE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- SECTION: IS TEXTUAL DATA TYPE
-- In this section, we define the is textual data type function. This function is used to check if a data type is textual.
create or replace function cms.is_textual_data_type (
  p_data_type text,
  p_udt_name text default null,
  p_udt_schema text default null
) RETURNS boolean
set
  search_path = '' as $$
BEGIN
    -- Primary textual types
    IF p_data_type IN (
                       'text',
                       'uuid',
                       'varchar',
                       'character varying',
                       'char',
                       'character'
        ) THEN
        RETURN true;
    END IF;

    -- Check for user-defined types that might be textual (like enums)
    IF p_data_type = 'USER-DEFINED' AND p_udt_name IS NOT NULL THEN
        -- Check if it's an enum (enums are searchable as text) with schema awareness
        IF EXISTS (SELECT 1
                   FROM pg_type t
                            JOIN pg_namespace n ON t.typnamespace = n.oid
                            JOIN pg_enum e ON t.oid = e.enumtypid
                   WHERE t.typname = p_udt_name
                     AND (p_udt_schema IS NULL OR n.nspname = p_udt_schema)
                   LIMIT 1) THEN
            RETURN true;
        END IF;

        -- You could add other user-defined textual types here
        -- For now, assume non-enum user-defined types are not searchable
        RETURN false;
    END IF;

    -- All other types (numeric, date, boolean, json, uuid, etc.) are not textual
    RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- SECTION: SYNC MANAGED TABLES
-- In this section, we define the sync managed tables function. This function is used to sync the managed tables. By default, it will sync all tables in the public schema.
-- If a table name is provided, it will sync only that table. If a schema name is provided, it will sync all tables in that schema.
create or replace function cms.sync_managed_tables (
  p_schema_name TEXT default 'public',
  p_table_name TEXT default null
) RETURNS void
set
  SEARCH_PATH to '' as $$
DECLARE
    v_table_record       RECORD;
    v_col_record         RECORD;
    v_rel_record         RECORD;
    v_key_record         RECORD; -- For primary key detection
    v_uniq_record        RECORD; -- For unique constraint detection
    v_columns            JSONB;
    v_is_primary_key     BOOLEAN;
    v_relations          JSONB;
    v_existing           JSONB;
    v_col_config         JSONB;
    v_relation           JSONB;
    v_existing_rel       JSONB;
    v_is_enum            BOOLEAN;
    v_enum_type          TEXT;
    v_enum_values        JSONB;
    v_primary_keys       JSONB; -- To store primary key info
    v_unique_constraints JSONB; -- To store unique constraints
    v_table_config       JSONB; -- To store table-level metadata
    i                    INTEGER;
    v_relation_idx       TEXT;
    v_inverse_relations  JSONB;
BEGIN
    -- Sanitize inputs for security
    p_schema_name := cms.sanitize_identifier(p_schema_name);

    IF p_table_name IS NOT NULL THEN
        p_table_name := cms.sanitize_identifier(p_table_name);
    END IF;

    -- Note: We don't delete existing metadata here because we want to preserve
    -- custom values like display_name, description, etc. The INSERT ... ON CONFLICT
    -- logic below will handle merging new schema data with existing custom values.

    -- Build the query to get tables based on parameters
    FOR v_table_record IN
        EXECUTE format(
                'SELECT table_schema, table_name
             FROM information_schema.tables
             WHERE table_schema = %L
               AND table_type = ''BASE TABLE''
               %s
             ORDER BY table_name',
                p_schema_name,
                CASE
                    WHEN p_table_name IS NOT NULL
                        THEN format('AND table_name = %L', p_table_name)
                    ELSE ''
                    END
                )
        LOOP
            -- Build columns config JSONB
            v_columns := '{}'::jsonb;
            v_primary_keys := '[]'::jsonb;
            v_unique_constraints := '[]'::jsonb;
            v_table_config := '{}'::jsonb;
            v_relations := '[]'::jsonb;
            -- Initialize v_relations

            -- Get existing columns_config if any
            SELECT columns_config, ui_config, relations_config
            INTO v_existing, v_table_config, v_relations
            FROM cms.table_metadata
            WHERE schema_name = v_table_record.table_schema
              AND table_name = v_table_record.table_name;

            -- Initialize configs if null
            IF v_table_config IS NULL THEN
                v_table_config := '{}'::jsonb;
            END IF;

            IF v_relations IS NULL THEN
                v_relations := '[]'::jsonb;
            END IF;

            -- 1. IDENTIFY PRIMARY KEYS
            -- Query to find primary key columns
            FOR v_key_record IN
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                         JOIN information_schema.key_column_usage kcu
                              ON tc.constraint_name = kcu.constraint_name
                WHERE tc.table_schema = v_table_record.table_schema
                  AND tc.table_name = v_table_record.table_name
                  AND tc.constraint_type = 'PRIMARY KEY'
                ORDER BY kcu.ordinal_position
                LOOP
                    -- Add to primary keys array
                    v_primary_keys := v_primary_keys || jsonb_build_object(
                            'column_name', v_key_record.column_name
                                                        );
                END LOOP;

            -- 2. IDENTIFY UNIQUE CONSTRAINTS
            FOR v_uniq_record IN
                SELECT tc.constraint_name,
                       jsonb_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS columns
                FROM information_schema.table_constraints tc
                         JOIN information_schema.key_column_usage kcu
                              ON tc.constraint_name = kcu.constraint_name
                WHERE tc.table_schema = v_table_record.table_schema
                  AND tc.table_name = v_table_record.table_name
                  AND tc.constraint_type = 'UNIQUE'
                GROUP BY tc.constraint_name
                LOOP
                    -- Add to unique constraints array
                    v_unique_constraints := v_unique_constraints || jsonb_build_object(
                            'constraint_name', v_uniq_record.constraint_name,
                            'columns', v_uniq_record.columns
                                                                    );
                END LOOP;

            -- Update table_config with primary key and unique constraint information
            v_table_config := jsonb_set(
                    v_table_config,
                    ARRAY ['primary_keys'],
                    v_primary_keys
                              );

            v_table_config := jsonb_set(
                    v_table_config,
                    ARRAY ['unique_constraints'],
                    v_unique_constraints
                              );

            -- Process columns
            FOR v_col_record IN
                SELECT column_name,
                       data_type,
                       character_maximum_length,
                       column_default,
                       is_nullable,
                       ordinal_position,
                       udt_name,
                       udt_schema
                FROM information_schema.columns
                WHERE table_schema = v_table_record.table_schema
                  AND table_name = v_table_record.table_name
                ORDER BY ordinal_position
                LOOP
                    -- Check if this column is a primary key
                    v_is_primary_key := (SELECT EXISTS (SELECT 1
                                                        FROM jsonb_array_elements(v_primary_keys)
                                                        WHERE value ->> 'column_name' = v_col_record.column_name));

                    -- Check if column type is an enum
                    v_is_enum := FALSE;
                    IF v_col_record.data_type = 'USER-DEFINED' THEN
                        -- Check if the UDT is an enum
                        SELECT EXISTS (SELECT 1
                                       FROM pg_type t
                                                JOIN pg_enum e ON t.oid = e.enumtypid
                                       WHERE t.typname = v_col_record.udt_name)
                        INTO v_is_enum;

                        IF v_is_enum THEN
                            v_enum_type := v_col_record.udt_name;

                            -- Get enum values
                            SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
                            FROM pg_enum e
                                     JOIN pg_type t ON e.enumtypid = t.oid
                            WHERE t.typname = v_enum_type
                            INTO v_enum_values;
                        END IF;
                    END IF;

                    v_col_config := jsonb_build_object(
                            'name', v_col_record.column_name,
                            'display_name', cms.generate_display_name(v_col_record.column_name),
                            'description', '',
                            'ordering', v_col_record.ordinal_position,
                            'is_required', v_col_record.is_nullable = 'NO',
                            'is_visible_in_table', true,
                            'is_visible_in_detail', true,
                            'is_filterable', true,
                            'is_searchable',
                            cms.is_textual_data_type(v_col_record.data_type, v_col_record.udt_name,
                                                          v_col_record.udt_schema),
                            'is_sortable', true,
                            'is_editable', NOT (v_is_primary_key OR v_col_record.column_name = 'id' OR
                                                v_col_record.column_name LIKE '%\_at'),
                            'is_primary_key', v_is_primary_key,
                            'default_value', v_col_record.column_default,
                            'ui_config', jsonb_build_object(
                                    'data_type', v_col_record.data_type,
                                    'max_length', v_col_record.character_maximum_length,
                                    'is_enum', v_is_enum,
                                    'enum_type', CASE WHEN v_is_enum THEN v_enum_type ELSE NULL END,
                                    'enum_values', CASE WHEN v_is_enum THEN v_enum_values ELSE NULL END
                                         )
                                    );

                    -- Preserve existing custom settings if any
                    IF v_existing IS NOT NULL AND v_existing ? v_col_record.column_name THEN
                        v_col_config := v_col_config || v_existing -> v_col_record.column_name;
                    END IF;

                    -- Add to columns collection
                    v_columns := v_columns || jsonb_build_object(v_col_record.column_name, v_col_config);
                END LOOP;

            -- 3. PROCESS FOREIGN KEY RELATIONSHIPS
            FOR v_rel_record IN
                SELECT kcu.column_name  as source_column,
                       ccu.table_schema as target_schema,
                       ccu.table_name   as target_table,
                       ccu.column_name  as target_column
                FROM information_schema.table_constraints tc
                         JOIN information_schema.key_column_usage kcu
                              ON tc.constraint_name = kcu.constraint_name
                         JOIN information_schema.constraint_column_usage ccu
                              ON tc.constraint_name = ccu.constraint_name
                WHERE tc.table_schema = v_table_record.table_schema
                  AND tc.table_name = v_table_record.table_name
                  AND tc.constraint_type = 'FOREIGN KEY'
                LOOP
                    -- Create relation object
                    v_relation := jsonb_build_object(
                            'source_column', v_rel_record.source_column,
                            'target_schema', v_rel_record.target_schema,
                            'target_table', v_rel_record.target_table,
                            'target_column', v_rel_record.target_column,
                            'relation_type', 'many_to_one',
                            'display_fields', '[]'::jsonb
                                  );

                    -- Check if relation already exists and preserve custom settings
                    v_existing_rel := NULL;
                    IF jsonb_typeof(v_relations) = 'array' THEN
                        FOR i IN 0..jsonb_array_length(v_relations) - 1
                            LOOP
                                IF (v_relations -> i ->> 'source_column' = v_rel_record.source_column AND
                                    v_relations -> i ->> 'target_table' = v_rel_record.target_table) THEN
                                    v_existing_rel := v_relations -> i;
                                    EXIT;
                                END IF;
                            END LOOP;
                    END IF;

                    -- Merge with existing relation config if found
                    IF v_existing_rel IS NOT NULL THEN
                        v_relation := v_relation || v_existing_rel;
                    END IF;

                    -- Convert array index to text for use in jsonb_set
                    v_relation_idx := jsonb_array_length(v_relations)::text;

                    -- Add to relations array (FIXED)
                    v_relations := jsonb_set(
                            v_relations,
                            ARRAY [v_relation_idx],
                            v_relation
                                   );
                END LOOP;

            -- Insert or update table_metadata
            INSERT INTO cms.table_metadata (schema_name,
                                                 table_name,
                                                 display_name,
                                                 columns_config,
                                                 relations_config,
                                                 ui_config)
            VALUES (v_table_record.table_schema,
                    v_table_record.table_name,
                    cms.generate_display_name(v_table_record.table_name),
                    v_columns,
                    v_relations,
                    v_table_config)
            ON CONFLICT (schema_name, table_name) DO UPDATE
                SET
                    -- Preserve existing custom values, fall back to new generated values
                    display_name     = COALESCE(table_metadata.display_name, EXCLUDED.display_name),
                    description      = COALESCE(table_metadata.description, EXCLUDED.description),
                    is_visible       = COALESCE(table_metadata.is_visible, EXCLUDED.is_visible),
                    ordering         = COALESCE(table_metadata.ordering, EXCLUDED.ordering),
                    is_searchable    = COALESCE(table_metadata.is_searchable, EXCLUDED.is_searchable),

                    -- Always update schema-derived configs with new scan data
                    keys_config      = EXCLUDED.keys_config,
                    relations_config = EXCLUDED.relations_config,
                    ui_config        = (
                        -- Merge ui_config: preserve existing custom fields while updating schema-derived fields
                        -- Use EXCLUDED || existing to let existing custom fields override schema defaults
                        CASE
                            WHEN table_metadata.ui_config IS NULL THEN EXCLUDED.ui_config
                            ELSE EXCLUDED.ui_config || table_metadata.ui_config
                            END
                        ),
                    columns_config   = (SELECT jsonb_object_agg(
                                                       column_key,
                                                       CASE
                                                           -- If column exists in both old and new config, merge them
                                                           WHEN table_metadata.columns_config ? column_key THEN
                                                               -- Start with new schema-derived data
                                                               EXCLUDED.columns_config -> column_key ||
                                                                   -- Overlay preserved custom fields from existing config
                                                               jsonb_build_object(
                                                                       'display_name', COALESCE(
                                                                       (table_metadata.columns_config -> column_key ->> 'display_name'),
                                                                       (EXCLUDED.columns_config -> column_key ->> 'display_name')
                                                                                       ),
                                                                       'description', COALESCE(
                                                                               (table_metadata.columns_config -> column_key ->> 'description'),
                                                                               (EXCLUDED.columns_config -> column_key ->> 'description')
                                                                                      ),
                                                                       'is_visible_in_table', COALESCE(
                                                                               (table_metadata.columns_config -> column_key ->> 'is_visible_in_table')::boolean,
                                                                               (EXCLUDED.columns_config -> column_key ->> 'is_visible_in_table')::boolean
                                                                                              ),
                                                                       'is_visible_in_detail', COALESCE(
                                                                               (table_metadata.columns_config -> column_key ->> 'is_visible_in_detail')::boolean,
                                                                               (EXCLUDED.columns_config -> column_key ->> 'is_visible_in_detail')::boolean
                                                                                               ),
                                                                       'is_filterable', COALESCE(
                                                                               (table_metadata.columns_config -> column_key ->> 'is_filterable')::boolean,
                                                                               (EXCLUDED.columns_config -> column_key ->> 'is_filterable')::boolean
                                                                                        ),
                                                                       'is_sortable', COALESCE(
                                                                               (table_metadata.columns_config -> column_key ->> 'is_sortable')::boolean,
                                                                               (EXCLUDED.columns_config -> column_key ->> 'is_sortable')::boolean
                                                                                      ),
                                                                       'is_editable', COALESCE(
                                                                               (table_metadata.columns_config -> column_key ->> 'is_editable')::boolean,
                                                                               (EXCLUDED.columns_config -> column_key ->> 'is_editable')::boolean
                                                                                      )
                                                               )
                                                           -- If column only exists in new config, use it as-is
                                                           ELSE EXCLUDED.columns_config -> column_key
                                                           END
                                               )
                                        FROM jsonb_object_keys(EXCLUDED.columns_config) AS column_key),

                    -- Always update timestamp
                    updated_at       = NOW();
        END LOOP;
END;
$$ LANGUAGE plpgsql;

revoke all on function cms.sync_managed_tables
from
  public;

grant execute on function cms.sync_managed_tables to service_role;

-- SECTION: GET RECORD BY KEYS
-- In this section, we define the get record by keys function. This function is used to get a record by its keys. We require SECURITY DEFINER because we need to access to the end application's tables. Access is verified by the has_data_permission function.
create or replace function cms.get_record_by_keys (p_schema text, p_table text, p_key_values jsonb) RETURNS jsonb SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_sql               text;
    v_result            jsonb;
    v_where_clauses     text[] := '{}';
    v_key               text;
    v_value             jsonb;
    v_column_info       RECORD;
    v_formatted_value   text;
    v_key_count         int    := 0;
    v_max_keys CONSTANT int    := 10; -- Security limit
BEGIN
    -- Security: Validate schema and table names
    p_schema := cms.sanitize_identifier(p_schema);
    p_table := cms.sanitize_identifier(p_table);

    -- Security: Verify JWT claim
    IF NOT cms.verify_admin_access() THEN
        RAISE EXCEPTION 'Invalid admin access'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Security: Check permissions
    IF NOT cms.has_data_permission('select'::cms.system_action, p_schema, p_table) THEN
        RAISE EXCEPTION 'Permission denied for reading table %.%', p_schema, p_table
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Input validation
    IF p_key_values IS NULL OR jsonb_typeof(p_key_values) != 'object' THEN
        RAISE EXCEPTION 'Key values must be a valid JSON object'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Check for empty keys
    IF NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_key_values)) THEN
        RAISE EXCEPTION 'At least one key-value pair is required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Security: Count keys to prevent overly complex queries
    SELECT COUNT(*) INTO v_key_count FROM jsonb_object_keys(p_key_values);

    IF v_key_count > v_max_keys THEN
        RAISE EXCEPTION 'Too many key conditions: %. Maximum allowed: %',
            v_key_count, v_max_keys
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Build WHERE clause for each key-value pair with type safety
    FOR v_key, v_value IN
        SELECT key, value FROM jsonb_each(p_key_values)
        LOOP
            -- Security: Validate key name
            IF v_key IS NULL OR length(v_key) = 0 OR length(v_key) > 63 THEN
                RAISE EXCEPTION 'Invalid key name: %', COALESCE(v_key, 'NULL')
                    USING ERRCODE = 'invalid_parameter_value';
            END IF;

            v_key := cms.sanitize_identifier(v_key);

            -- Security: Verify column exists
            IF NOT cms.validate_column_name(p_schema, p_table, v_key) THEN
                RAISE EXCEPTION 'Column does not exist in table %.%: %', p_schema, p_table, v_key
                    USING ERRCODE = 'undefined_column';
            END IF;

            -- Get column metadata for type-safe formatting
            SELECT data_type,
                   udt_name,
                   udt_schema,
                   is_nullable
            INTO v_column_info
            FROM information_schema.columns
            WHERE table_schema = p_schema
              AND table_name = p_table
              AND column_name = v_key;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Column metadata not found for: %.%.%', p_schema, p_table, v_key
                    USING ERRCODE = 'undefined_column';
            END IF;

            -- Handle NULL values appropriately
            IF v_value IS NULL OR jsonb_typeof(v_value) = 'null' THEN
                v_where_clauses := array_append(
                        v_where_clauses,
                        format('%I IS NULL', v_key)
                                   );
            ELSE
                -- Type-safe value formatting
                BEGIN
                    v_formatted_value := cms.format_typed_value(
                            v_value,
                            v_column_info.data_type,
                            v_column_info.udt_name,
                            v_column_info.udt_schema
                                         );

                    v_where_clauses := array_append(
                            v_where_clauses,
                            format('%I = %s', v_key, v_formatted_value)
                                       );

                EXCEPTION
                    WHEN OTHERS THEN
                        RAISE EXCEPTION 'Failed to format key "%" with value "%" for type %: %',
                            v_key,
                            COALESCE(v_value::text, 'NULL'),
                            v_column_info.data_type,
                            SQLERRM
                            USING ERRCODE = SQLSTATE;
                END;
            END IF;
        END LOOP;

    -- Build and execute query with WHERE clauses
    v_sql := format(
            'SELECT to_jsonb(%I.*) FROM %I.%I WHERE %s LIMIT 1',
            p_table,
            p_schema,
            p_table,
            array_to_string(v_where_clauses, ' AND ')
             );

    BEGIN
        EXECUTE v_sql INTO v_result;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Query execution failed for table %.%: %', p_schema, p_table, SQLERRM
                USING ERRCODE = SQLSTATE,
                    HINT = 'Check table structure and key values';
    END;

    -- Return result or raise not found error
    IF v_result IS NULL THEN
        RAISE EXCEPTION 'Record not found in %.% with conditions: %',
            p_schema, p_table, p_key_values::text
            USING ERRCODE = 'no_data_found';
    END IF;

    RETURN v_result;

EXCEPTION
    WHEN OTHERS THEN
        -- Enhanced error logging
        RAISE LOG 'get_record_by_keys failed - Schema: %, Table: %, Keys: %, Error: %',
            p_schema, p_table, p_key_values::text, SQLERRM;

        -- Re-raise with preserved context
        RAISE;
END;
$$ LANGUAGE plpgsql;

grant
execute on function cms.get_record_by_keys to authenticated,
service_role;

-- SECTION: BUILD CRUD RESPONSE
-- In this section, we define the build crud response function. This function is used to build a response for the crud operations.
create or replace function cms.build_crud_response (
  p_success boolean,
  p_action cms.system_action,
  p_data jsonb default null,
  p_error text default null,
  p_meta jsonb default '{}'::jsonb
) RETURNS jsonb IMMUTABLE
set
  search_path = '' as $$
BEGIN
    RETURN jsonb_build_object(
            'success', p_success,
            'action', p_action,
            'data', p_data,
            'error', p_error,
            'meta', p_meta,
            'timestamp', extract(epoch from now())
           );
END;
$$ LANGUAGE plpgsql;

-- Mutation Functions
-- SECTION: INSERT RECORD
-- In this section, we define the insert record function. This function is used to insert a record into a table. We require SECURITY DEFINER because we need to access to the end application's tables. Access is verified by the has_data_permission function.
create or replace function cms.insert_record (p_schema text, p_table text, p_data jsonb) RETURNS jsonb SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_sql                  text;
    v_result               jsonb;
    v_columns              text[] := '{}';
    v_values               text[] := '{}';
    v_column               text;
    v_value                jsonb;
    v_column_info          RECORD;
    v_audit_log_id         uuid;
    v_columns_config       jsonb;
    v_is_editable          boolean;
    v_non_editable_columns text[] := '{}';
    v_formatted_value      text;
    v_column_count         int    := 0;
    v_max_columns CONSTANT int    := 100; -- Security limit
BEGIN
    -- Security: Validate schema and table names
    p_schema := cms.sanitize_identifier(p_schema);
    p_table := cms.sanitize_identifier(p_table);

    -- Security: Check if schema is protected from write operations
    IF NOT cms.validate_schema_access(p_schema) THEN
        RAISE EXCEPTION 'Write operations are not allowed on protected schema: %. This schema is managed by Supabase and is critical to the functionality of your project.', p_schema
            USING ERRCODE = 'insufficient_privilege',
                HINT = 'You can only perform write operations on user-defined schemas';
    END IF;

    -- Security: Verify JWT claim
    IF NOT cms.verify_admin_access() THEN
        RAISE EXCEPTION 'Invalid admin access'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Security: Permission check
    IF NOT cms.has_data_permission('insert'::cms.system_action, p_schema, p_table) THEN
        RAISE EXCEPTION 'Permission denied for insert operation on %.%', p_schema, p_table
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Input validation
    IF p_data IS NULL OR jsonb_typeof(p_data) != 'object' THEN
        RAISE EXCEPTION 'Data must be a valid JSON object'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Check for empty data
    IF NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_data)) THEN
        RAISE EXCEPTION 'At least one column-value pair is required for insertion'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Security: Count columns
    SELECT COUNT(*) INTO v_column_count FROM jsonb_object_keys(p_data);

    IF v_column_count > v_max_columns THEN
        RAISE EXCEPTION 'Too many columns provided: %. Maximum allowed: %',
            v_column_count, v_max_columns
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Get columns configuration to check editability
    SELECT columns_config
    INTO v_columns_config
    FROM cms.table_metadata
    WHERE schema_name = p_schema
      AND table_name = p_table;

    -- Process each column with type safety and editability checks
    FOR v_column, v_value IN
        SELECT key, value FROM jsonb_each(p_data)
        LOOP
            -- Security: Validate column name
            IF v_column IS NULL OR length(v_column) = 0 OR length(v_column) > 63 THEN
                RAISE EXCEPTION 'Invalid column name: %', COALESCE(v_column, 'NULL')
                    USING ERRCODE = 'invalid_parameter_value';
            END IF;

            -- Security: Verify column exists
            IF NOT cms.validate_column_name(p_schema, p_table, v_column) THEN
                RAISE EXCEPTION 'Column does not exist in table %.%: %', p_schema, p_table, v_column
                    USING ERRCODE = 'undefined_column';
            END IF;

            -- Check if the column is editable
            v_is_editable := true;
            IF v_columns_config IS NOT NULL AND v_columns_config ? v_column THEN
                v_is_editable := COALESCE((v_columns_config -> v_column ->> 'is_editable')::boolean, true);
            END IF;

            IF NOT v_is_editable THEN
                v_non_editable_columns := array_append(v_non_editable_columns, v_column);
                CONTINUE;
            END IF;

            -- Get column metadata for type-safe formatting
            SELECT data_type,
                   udt_name,
                   udt_schema,
                   is_nullable
            INTO v_column_info
            FROM information_schema.columns
            WHERE table_schema = p_schema
              AND table_name = p_table
              AND column_name = v_column;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Column metadata not found for: %.%.%', p_schema, p_table, v_column
                    USING ERRCODE = 'undefined_column';
            END IF;

            -- Add column name to arrays
            v_columns := array_append(v_columns, quote_ident(v_column));

            -- Type-safe value formatting using our robust function
            BEGIN
                v_formatted_value := cms.format_typed_value(
                        v_value,
                        v_column_info.data_type,
                        v_column_info.udt_name,
                        v_column_info.udt_schema
                                     );

                v_values := array_append(v_values, v_formatted_value);

            EXCEPTION
                WHEN OTHERS THEN
                    RAISE EXCEPTION 'Failed to format value for column "%" of type %: %',
                        v_column, v_column_info.data_type, SQLERRM
                        USING ERRCODE = SQLSTATE,
                            HINT = format('Provided value: %s', COALESCE(v_value::text, 'NULL'));
            END;
        END LOOP;

    -- Warn if non-editable columns were skipped
    IF cardinality(v_non_editable_columns) > 0 THEN
        RAISE WARNING 'Skipped non-editable columns: %', array_to_string(v_non_editable_columns, ', ');
    END IF;

    -- If no editable columns were found, raise an exception
    IF cardinality(v_columns) = 0 THEN
        RAISE EXCEPTION 'No editable columns were provided for insertion'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Build and execute query safely
    v_sql := format(
            'INSERT INTO %I.%I (%s) VALUES (%s) RETURNING to_jsonb(%I.*)',
            p_schema,
            p_table,
            array_to_string(v_columns, ', '),
            array_to_string(v_values, ', '),
            p_table
             );

    BEGIN
        EXECUTE v_sql INTO v_result;
    EXCEPTION
        WHEN OTHERS THEN
            -- Enhanced error handling with context
            IF SQLSTATE = '23505' THEN
                RAISE EXCEPTION 'Unique constraint violation: A record with these values already exists in %.%',
                    p_schema, p_table
                    USING ERRCODE = 'unique_violation';
            ELSIF SQLSTATE = '23503' THEN
                RAISE EXCEPTION 'Foreign key constraint violation: Referenced record does not exist in %.%',
                    p_schema, p_table
                    USING ERRCODE = 'foreign_key_violation';
            ELSIF SQLSTATE = '23502' THEN
                RAISE EXCEPTION 'Not null constraint violation: Required field is missing in %.%',
                    p_schema, p_table
                    USING ERRCODE = 'not_nullviolation';
            ELSE
                RAISE EXCEPTION 'Insert failed for table %.%: % (SQLSTATE: %)',
                    p_schema, p_table, SQLERRM, SQLSTATE
                    USING ERRCODE = SQLSTATE;
            END IF;
    END;

    -- Create audit log entry
    BEGIN
        v_audit_log_id := cms.create_audit_log(
                'INSERT',
                p_schema,
                p_table,
                v_result ->> 'id',
                NULL,
                v_result
                          );
    EXCEPTION
        WHEN OTHERS THEN
            -- Don't fail the operation if audit logging fails
            RAISE WARNING 'Failed to log insert operation: %', SQLERRM;
    END;

    RETURN cms.build_crud_response(
            true,
            'insert'::cms.system_action,
            v_result,
            NULL,
            jsonb_build_object('audit_log_id', v_audit_log_id)
           );

EXCEPTION
    WHEN OTHERS THEN
        -- Enhanced error logging
        RAISE LOG 'insert_record failed - Schema: %, Table: %, Data: %, Error: %',
            p_schema, p_table, p_data::text, SQLERRM;

        RETURN cms.build_crud_response(
                false,
                'insert'::cms.system_action,
                NULL,
                SQLERRM,
                jsonb_build_object(
                        'sqlstate', SQLSTATE,
                        'schema', p_schema,
                        'table', p_table
                )
               );
END;
$$ LANGUAGE plpgsql;

grant
execute on function cms.insert_record to authenticated;

-- SECTION: UPDATE RECORD
-- In this section, we define the update record function. This function is used to update a record in a table. We require SECURITY DEFINER because we need to access to the end application's tables. Access is verified by the has_data_permission function.
create or replace function cms._update_record_impl (
  p_schema text,
  p_table text,
  p_where_clauses text[],
  p_data jsonb
) RETURNS jsonb SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_sql                  text;
    v_result               jsonb;
    v_old_data             jsonb;
    v_sets                 text[] := '{}';
    v_column               text;
    v_value                jsonb;
    v_column_info          RECORD;
    v_audit_log_id         uuid;
    v_columns_config       jsonb;
    v_is_editable          boolean;
    v_non_editable_columns text[] := '{}';
BEGIN
    IF NOT cms.verify_admin_access() THEN
        RAISE EXCEPTION 'Invalid admin access';
    END IF;

    -- Validate schema and table names
    p_schema := cms.sanitize_identifier(p_schema);
    p_table := cms.sanitize_identifier(p_table);

    -- Check if schema is protected
    IF NOT cms.validate_schema_access(p_schema) THEN
        RAISE EXCEPTION 'Write operations are not allowed on protected schema: %. This schema is managed by Supabase and is critical to the functionality of your project.', p_schema
            USING ERRCODE = 'insufficient_privilege',
                HINT = 'You can only perform write operations on user-defined schemas';
    END IF;

    -- Permission check
    IF NOT cms.has_data_permission('update'::cms.system_action, p_schema, p_table) THEN
        RAISE EXCEPTION 'Permission denied';
    END IF;

    -- First fetch AND LOCK the current data for audit logging
    EXECUTE format(
            'SELECT to_jsonb(%I.*) FROM %I.%I WHERE %s FOR UPDATE', -- Added FOR UPDATE
            p_table, p_schema, p_table, array_to_string(p_where_clauses, ' AND ')
            ) INTO v_old_data;

    IF v_old_data IS NULL THEN
        RAISE EXCEPTION 'No record found matching the specified conditions in %.%', p_schema, p_table;
    END IF;

    -- Get columns configuration to check editability
    SELECT columns_config
    INTO v_columns_config
    FROM cms.table_metadata
    WHERE schema_name = p_schema
      AND table_name = p_table;

    -- Build SET clauses for update
    FOR v_column, v_value IN
        SELECT key, value FROM jsonb_each(p_data)
        LOOP
            -- Validate column name
            IF NOT cms.validate_column_name(p_schema, p_table, v_column) THEN
                RAISE EXCEPTION 'Invalid column: %', v_column;
            END IF;

            -- Check if the column is editable
            v_is_editable := true; -- Default to true if no metadata exists

            IF v_columns_config IS NOT NULL AND v_columns_config ? v_column THEN
                v_is_editable := coalesce((v_columns_config -> v_column ->> 'is_editable')::boolean, true);
            END IF;

            -- Skip non-editable columns
            IF NOT v_is_editable THEN
                v_non_editable_columns := array_append(v_non_editable_columns, v_column);
                CONTINUE;
            END IF;

            -- Get column metadata for type-safe formatting
            SELECT data_type,
                   udt_name,
                   udt_schema
            INTO v_column_info
            FROM information_schema.columns
            WHERE table_schema = p_schema
              AND table_name = p_table
              AND column_name = v_column;

            -- Handle NULL values
            IF v_value IS NULL OR jsonb_typeof(v_value) = 'null' THEN
                v_sets := array_append(v_sets, quote_ident(v_column) || ' = NULL');
            ELSE
                -- Use the enhanced format_typed_value function for type safety
                BEGIN
                    DECLARE
                        v_formatted_value text;
                    BEGIN
                        v_formatted_value := cms.format_typed_value(
                                v_value,
                                v_column_info.data_type,
                                v_column_info.udt_name,
                                v_column_info.udt_schema
                                             );

                        v_sets := array_append(
                                v_sets,
                                format('%I = %s', v_column, v_formatted_value)
                                  );
                    END;

                EXCEPTION
                    WHEN OTHERS THEN
                        RAISE EXCEPTION 'Failed to format value for column "%" of type %: %',
                            v_column, v_column_info.data_type, SQLERRM
                            USING ERRCODE = SQLSTATE,
                                HINT = format('Provided value: %s', COALESCE(v_value::text, 'NULL'));
                END;
            END IF;
        END LOOP;

    -- Warn if non-editable columns were skipped
    IF cardinality(v_non_editable_columns) > 0 THEN
        RAISE WARNING 'Skipped non-editable columns: %', array_to_string(v_non_editable_columns, ', ');
    END IF;

    -- If no editable columns were found, return the original data
    IF cardinality(v_sets) = 0 THEN
        RETURN cms.build_crud_response(
                true, -- Or false, depending on if this is considered a "successful no-op"
                'update'::cms.system_action,
                v_old_data,
                'No editable columns provided or all values matched existing data.', -- Optional message
                NULL
               );
    END IF;

    -- Build and execute query safely
    v_sql := format(
            'UPDATE %I.%I SET %s WHERE %s RETURNING to_jsonb(%I.*)',
            p_schema,
            p_table,
            array_to_string(v_sets, ', '),
            array_to_string(p_where_clauses, ' AND '),
            p_table
             );

    BEGIN
        EXECUTE v_sql INTO v_result;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Error updating record: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    END;

    -- Add audit log entry
    BEGIN
        v_audit_log_id := cms.create_audit_log(
                'UPDATE',
                p_schema,
                p_table,
                v_result ->> 'id',
                v_old_data,
                v_result
                          );
    EXCEPTION
        WHEN OTHERS THEN
            -- Don't fail the operation if audit logging fails
            RAISE WARNING 'Failed to log update operation: %', SQLERRM;
    END;

    RETURN cms.build_crud_response(
            true,
            'update'::cms.system_action,
            v_result,
            NULL,
            NULL
           );
EXCEPTION
    WHEN OTHERS THEN
        RETURN cms.build_crud_response(
                false,
                'update'::cms.system_action,
                NULL,
                SQLERRM,
                jsonb_build_object('sqlstate', SQLSTATE)
               );
END;
$$ LANGUAGE plpgsql;

-- SECTION: UPDATE RECORD BY ID
-- In this section, we define the update record by id function. This function is used to update a record in a table by its id. We require SECURITY DEFINER because we need to access to the end application's tables. Access is verified by the has_data_permission function.
create or replace function cms.update_record (
  p_schema text,
  p_table text,
  p_id text,
  p_data jsonb
) RETURNS jsonb SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
BEGIN
    RETURN cms._update_record_impl(
            p_schema,
            p_table,
            ARRAY [format('id = %L', p_id)],
            p_data
           );
END;
$$ LANGUAGE plpgsql;

grant
execute on function cms.update_record to authenticated;

-- SECTION: UPDATE RECORD BY CONDITIONS
-- In this section, we define the update record by conditions function when a primary key is not provided. This function is used to update a record in a table by a set of conditions.
create or replace function cms.update_record_by_conditions (
  p_schema text,
  p_table text,
  p_where_conditions jsonb,
  p_data jsonb
) RETURNS jsonb SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_where_clauses           text[] := '{}';
    v_column                  text;
    v_value                   jsonb;
    v_column_info             RECORD;
    v_formatted_value         text;
    v_condition_count         int    := 0;
    v_max_conditions CONSTANT int    := 10; -- Prevent overly complex conditions
BEGIN
    -- Security and admin access check
    IF NOT cms.verify_admin_access() THEN
        RAISE EXCEPTION 'Invalid admin access'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Validate schema and table names
    p_schema := cms.sanitize_identifier(p_schema);
    p_table := cms.sanitize_identifier(p_table);

    -- Check if schema is protected
    IF NOT cms.validate_schema_access(p_schema) THEN
        RAISE EXCEPTION 'Write operations are not allowed on protected schema: %. This schema is managed by Supabase and is critical to the functionality of your project.', p_schema
            USING ERRCODE = 'insufficient_privilege',
                HINT = 'You can only perform write operations on user-defined schemas';
    END IF;

    -- Validate where conditions
    IF p_where_conditions IS NULL OR jsonb_typeof(p_where_conditions) != 'object' THEN
        RAISE EXCEPTION 'Where conditions must be a valid JSON object'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Check for empty conditions
    IF NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_where_conditions)) THEN
        RAISE EXCEPTION 'Where conditions cannot be empty. At least one condition is required for safety'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Count conditions for complexity check
    SELECT COUNT(*) INTO v_condition_count FROM jsonb_object_keys(p_where_conditions);

    IF v_condition_count > v_max_conditions THEN
        RAISE EXCEPTION 'Too many where conditions: %. Maximum allowed: %',
            v_condition_count, v_max_conditions
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Build WHERE clause from conditions with proper type formatting
    FOR v_column, v_value IN
        SELECT key, value FROM jsonb_each(p_where_conditions)
        LOOP
            -- Validate column name
            IF NOT cms.validate_column_name(p_schema, p_table, v_column) THEN
                RAISE EXCEPTION 'Invalid column in where condition: %. Column does not exist in table %.%',
                    v_column, p_schema, p_table
                    USING ERRCODE = 'undefined_column';
            END IF;

            -- Get column information including data type
            SELECT data_type,
                   udt_name,
                   udt_schema,
                   is_nullable,
                   column_name
            INTO v_column_info
            FROM information_schema.columns
            WHERE table_schema = p_schema
              AND table_name = p_table
              AND column_name = v_column;

            -- This should not happen due to validate_column_name check above, but safety first
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Column metadata not found for: %.%.%', p_schema, p_table, v_column
                    USING ERRCODE = 'undefined_column';
            END IF;

            -- Handle NULL values in WHERE clause
            IF v_value IS NULL OR jsonb_typeof(v_value) = 'null' THEN
                v_where_clauses := array_append(
                        v_where_clauses,
                        format('%I IS NULL', v_column)
                                   );
            ELSE
                -- Format value according to its data type
                BEGIN
                    v_formatted_value := cms.format_typed_value(
                            v_value,
                            v_column_info.data_type,
                            v_column_info.udt_name,
                            v_column_info.udt_schema
                                         );

                    v_where_clauses := array_append(
                            v_where_clauses,
                            format('%I = %s', v_column, v_formatted_value)
                                       );

                EXCEPTION
                    WHEN OTHERS THEN
                        -- Provide detailed error context
                        RAISE EXCEPTION 'Failed to format where condition for column "%" with value "%": %',
                            v_column,
                            COALESCE(v_value::text, 'NULL'),
                            SQLERRM
                            USING ERRCODE = SQLSTATE,
                                HINT = format('Column type is: %s', v_column_info.data_type);
                END;
            END IF;
        END LOOP;

    -- Delegate to the existing implementation
    RETURN cms._update_record_impl(
            p_schema,
            p_table,
            v_where_clauses,
            p_data
           );

EXCEPTION
    WHEN OTHERS THEN
        -- Enhanced error logging with context
        RAISE LOG 'update_record_by_conditions failed - Schema: %, Table: %, Conditions: %, Data: %, Error: %',
            p_schema, p_table, p_where_conditions::text, p_data::text, SQLERRM;

        -- Return structured error response
        RETURN cms.build_crud_response(
                false,
                'update'::cms.system_action,
                NULL,
                format('Update failed: %s', SQLERRM),
                jsonb_build_object(
                        'sqlstate', SQLSTATE,
                        'schema', p_schema,
                        'table', p_table,
                        'error_detail', SQLERRM
                )
               );
END;
$$ LANGUAGE plpgsql;

grant
execute on function cms.update_record_by_conditions to authenticated;

-- SECTION: DELETE RECORD
-- In this section, we define the delete record function. This function is used to delete a record from a table. We require SECURITY DEFINER because we need to access to the end application's tables. Access is verified by the has_data_permission function.
create or replace function cms._delete_record_impl (
  p_schema text,
  p_table text,
  p_where_clauses text[]
) RETURNS jsonb SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_sql          text;
    v_exists       boolean;
    v_old_data     jsonb;
    v_record_id    text := NULL;
    v_audit_log_id uuid;
BEGIN
    -- Validate schema and table names
    p_schema := cms.sanitize_identifier(p_schema);
    p_table := cms.sanitize_identifier(p_table);

    -- Check if schema is protected
    IF NOT cms.validate_schema_access(p_schema) THEN
        RAISE EXCEPTION 'Write operations are not allowed on protected schema: %. This schema is managed by Supabase and is critical to the functionality of your project.', p_schema
            USING ERRCODE = 'insufficient_privilege',
                HINT = 'You can only perform write operations on user-defined schemas';
    END IF;

    -- JWT and permission checks
    IF NOT cms.verify_admin_access() THEN
        RAISE EXCEPTION 'Invalid admin access';
    END IF;

    IF NOT cms.has_data_permission('delete'::cms.system_action, p_schema, p_table) THEN
        RAISE EXCEPTION 'The user does not have permission to delete this record';
    END IF;

    -- First fetch AND LOCK the current data for audit logging
    EXECUTE format(
            'SELECT to_jsonb(%I.*) FROM %I.%I WHERE %s FOR UPDATE', -- Added FOR UPDATE
            p_table, p_schema, p_table, array_to_string(p_where_clauses, ' AND ')
            ) INTO v_old_data;

    -- If the record is not found, return a proper error response
    IF v_old_data IS NULL THEN
        RETURN cms.build_crud_response(
                false,
                'delete'::cms.system_action,
                NULL,
                'Record not found.',
                jsonb_build_object('affected_rows', 0)
               );
    END IF;

    -- Extract ID for audit log if available
    v_record_id := v_old_data ->> 'id';

    -- Perform the deletion
    v_sql := format('DELETE FROM %I.%I WHERE %s',
                    p_schema, p_table, array_to_string(p_where_clauses, ' AND '));

    BEGIN
        EXECUTE v_sql;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Error deleting record: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    END;

    -- Add audit log entry
    BEGIN
        v_audit_log_id := cms.create_audit_log(
                'DELETE',
                p_schema,
                p_table,
                v_record_id,
                v_old_data,
                NULL
                          );
    EXCEPTION
        WHEN OTHERS THEN
            -- Don't fail the operation if audit logging fails
            RAISE WARNING 'Failed to log delete operation: %', SQLERRM;
    END;

    RETURN jsonb_build_object(
            'success', true,
            'action', 'delete',
            'data', v_old_data, -- Return what was deleted
            'meta', jsonb_build_object(
                    'affected_rows', 1,
                    'audit_log_id', v_audit_log_id
                    )
           );
EXCEPTION
    WHEN OTHERS THEN
        RETURN cms.build_crud_response(
                false,
                'delete'::cms.system_action,
                NULL,
                SQLERRM,
                jsonb_build_object('sqlstate', SQLSTATE)
               );
END;
$$ LANGUAGE plpgsql;

-- SECTION: DELETE RECORD BY ID
-- In this section, we define the delete record by id function. This function is used to delete a record from a table by its id.
create or replace function cms.delete_record (p_schema text, p_table text, p_id text) RETURNS jsonb
set
  search_path = '' as $$
BEGIN
    RETURN cms._delete_record_impl(
            p_schema,
            p_table,
            ARRAY [format('id = %L', p_id)]
           );
END;
$$ LANGUAGE plpgsql;

grant
execute on function cms.delete_record to authenticated;

-- SECTION: DELETE RECORD BY CONDITIONS
-- In this section, we define the delete record by conditions function. This function is used to delete a record from a table by its conditions. Uses SECURITY DEFINER because we need to access to the end application's tables. Access is verified by the has_data_permission function.
create or replace function cms.delete_record_by_conditions (
  p_schema text,
  p_table text,
  p_where_conditions jsonb
) RETURNS jsonb SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_where_clauses                 text[] := '{}';
    v_column                        text;
    v_value                         jsonb;
    v_column_info                   RECORD;
    v_formatted_value               text;
    v_condition_count               int    := 0;
    v_max_conditions       CONSTANT int    := 10; -- Prevent overly complex conditions
    v_record_count                  int    := 0;
    v_max_records_affected CONSTANT int    := 25; -- Safety limit for bulk deletes
BEGIN
    -- Security and admin access check
    IF NOT cms.verify_admin_access() THEN
        RAISE EXCEPTION 'Invalid admin access'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Validate schema and table names
    p_schema := cms.sanitize_identifier(p_schema);
    p_table := cms.sanitize_identifier(p_table);

    -- Check if schema is protected
    IF NOT cms.validate_schema_access(p_schema) THEN
        RAISE EXCEPTION 'Write operations are not allowed on protected schema: %. This schema is managed by Supabase and is critical to the functionality of your project.', p_schema
            USING ERRCODE = 'insufficient_privilege',
                HINT = 'You can only perform write operations on user-defined schemas';
    END IF;

    -- Permission check
    IF NOT cms.has_data_permission('delete'::cms.system_action, p_schema, p_table) THEN
        RAISE EXCEPTION 'Permission denied for delete operation on %.%', p_schema, p_table
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Validate where conditions
    IF p_where_conditions IS NULL OR jsonb_typeof(p_where_conditions) != 'object' THEN
        RAISE EXCEPTION 'Where conditions must be a valid JSON object'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Check for empty conditions - CRITICAL for delete operations
    IF NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_where_conditions)) THEN
        RAISE EXCEPTION 'Where conditions cannot be empty for delete operations. This is a safety measure to prevent accidental bulk deletions'
            USING ERRCODE = 'invalid_parameter_value',
                HINT = 'Specify at least one condition to identify the records to delete';
    END IF;

    -- Count conditions for complexity check
    SELECT COUNT(*) INTO v_condition_count FROM jsonb_object_keys(p_where_conditions);

    IF v_condition_count > v_max_conditions THEN
        RAISE EXCEPTION 'Too many where conditions: %. Maximum allowed: %',
            v_condition_count, v_max_conditions
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Build WHERE clause from conditions with proper type formatting
    FOR v_column, v_value IN
        SELECT key, value FROM jsonb_each(p_where_conditions)
        LOOP
            -- Validate column name
            IF NOT cms.validate_column_name(p_schema, p_table, v_column) THEN
                RAISE EXCEPTION 'Invalid column in where condition: %. Column does not exist in table %.%',
                    v_column, p_schema, p_table
                    USING ERRCODE = 'undefined_column';
            END IF;

            -- Get column information including data type
            SELECT data_type,
                   udt_name,
                   udt_schema,
                   is_nullable,
                   column_name
            INTO v_column_info
            FROM information_schema.columns
            WHERE table_schema = p_schema
              AND table_name = p_table
              AND column_name = v_column;

            -- This should not happen due to validate_column_name check above, but safety first
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Column metadata not found for: %.%.%', p_schema, p_table, v_column
                    USING ERRCODE = 'undefined_column';
            END IF;

            -- Handle NULL values in WHERE clause
            IF v_value IS NULL OR jsonb_typeof(v_value) = 'null' THEN
                v_where_clauses := array_append(
                        v_where_clauses,
                        format('%I IS NULL', v_column)
                                   );
            ELSE
                -- Format value according to its data type
                BEGIN
                    v_formatted_value := cms.format_typed_value(
                            v_value,
                            v_column_info.data_type,
                            v_column_info.udt_name,
                            v_column_info.udt_schema
                                         );

                    v_where_clauses := array_append(
                            v_where_clauses,
                            format('%I = %s', v_column, v_formatted_value)
                                       );

                EXCEPTION
                    WHEN OTHERS THEN
                        -- Provide detailed error context
                        RAISE EXCEPTION 'Failed to format where condition for column "%" with value "%": %',
                            v_column,
                            COALESCE(v_value::text, 'NULL'),
                            SQLERRM
                            USING ERRCODE = SQLSTATE,
                                HINT = format('Column type is: %s', v_column_info.data_type);
                END;
            END IF;
        END LOOP;

    -- SAFETY CHECK: Count records that would be affected before deletion
    EXECUTE format(
            'SELECT COUNT(*) FROM %I.%I WHERE %s',
            p_schema, p_table, array_to_string(v_where_clauses, ' AND ')
            ) INTO v_record_count;

    -- Prevent accidental bulk deletions
    IF v_record_count > v_max_records_affected THEN
        RAISE EXCEPTION 'Delete operation would affect % records, which exceeds the safety limit of %. This appears to be a bulk deletion that should be reviewed',
            v_record_count, v_max_records_affected
            USING ERRCODE = 'invalid_parameter_value',
                HINT = 'If this bulk deletion is intentional, contact your administrator to increase the safety limit';
    END IF;

    -- Log the planned deletion for audit purposes
    RAISE NOTICE 'Delete operation will affect % record(s) in %.%', v_record_count, p_schema, p_table;

    -- If no records match, return early with clear message
    IF v_record_count = 0 THEN
        RETURN cms.build_crud_response(
                false,
                'delete'::cms.system_action,
                NULL,
                'No records found matching the specified conditions',
                jsonb_build_object(
                        'affected_rows', 0,
                        'conditions_checked', p_where_conditions
                )
               );
    END IF;

    -- Delegate to the existing implementation
    RETURN cms._delete_record_impl(
            p_schema,
            p_table,
            v_where_clauses
           );

EXCEPTION
    WHEN OTHERS THEN
        -- Enhanced error logging with context
        RAISE LOG 'delete_record_by_conditions failed - Schema: %, Table: %, Conditions: %, Error: %',
            p_schema, p_table, p_where_conditions::text, SQLERRM;

        -- Return structured error response
        RETURN cms.build_crud_response(
                false,
                'delete'::cms.system_action,
                NULL,
                format('Delete failed: %s', SQLERRM),
                jsonb_build_object(
                        'sqlstate', SQLSTATE,
                        'schema', p_schema,
                        'table', p_table,
                        'error_detail', SQLERRM,
                        'conditions', p_where_conditions
                )
               );
END;
$$ LANGUAGE plpgsql;

grant
execute on function cms.delete_record_by_conditions to authenticated;

-- SECTION: BUILD WHERE CLAUSE (FIXED)
-- This function builds a secure WHERE clause for queries with proper SQL injection prevention
create or replace function cms.build_where_clause (p_schema text, p_table text, p_filters jsonb) RETURNS text
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_filter                         jsonb;
    v_column                         text;
    v_operator                       text;
    v_value                          jsonb;
    v_clauses                        text[]      := '{}';
    v_allowed_ops                    text[]      := ARRAY ['=', '!=', '<', '>', '<=', '>=', 'LIKE', 'ILIKE', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL'];
    v_column_type                    text;
    v_typed_value                    text;
    v_temp_value                     text;
    v_array_elements                 text[]      := '{}';
    v_element                        jsonb;
    v_formatted_element              text;

    -- 🔒 ENHANCED COMPLEXITY LIMITS (Implementing expert recommendation #12)
    v_max_filters           CONSTANT int         := 20; -- Max number of filter objects
    v_max_array_size        CONSTANT int         := 50; -- Max size per individual array
    v_max_total_conditions  CONSTANT int         := 200; -- Max total conditions across all filters
    v_max_string_length     CONSTANT int         := 1000; -- Max length of individual values
    v_max_total_arrays      CONSTANT int         := 10; -- NEW: Max number of IN/NOT IN arrays total
    v_max_filter_complexity CONSTANT int         := 500; -- NEW: Max complexity score per filter

    -- Complexity tracking
    v_total_conditions               int         := 0;
    v_total_arrays                   int         := 0;
    v_current_array_size             int;
    v_filter_complexity              int;
    v_total_complexity               int         := 0;

    -- Performance monitoring
    v_start_time                     TIMESTAMPTZ := clock_timestamp();
    v_processing_time                INTERVAL;
BEGIN
    -- Input validation
    IF p_filters IS NULL OR jsonb_typeof(p_filters) != 'array' THEN
        RETURN NULL;
    END IF;

    -- 🚨 GUARD: Prevent excessive filter count
    IF jsonb_array_length(p_filters) > v_max_filters THEN
        RAISE EXCEPTION 'Too many filters provided (max %, got %)',
            v_max_filters, jsonb_array_length(p_filters)
            USING ERRCODE = 'data_exception',
                HINT = 'Reduce the number of filters or increase pagination';
    END IF;

    -- Process each filter with comprehensive tracking
    FOR v_filter IN SELECT * FROM jsonb_array_elements(p_filters)
        LOOP
            -- Reset per-filter complexity
            v_filter_complexity := 0;

            -- 🚨 GUARD: Check total complexity before processing each filter
            IF v_total_conditions >= v_max_total_conditions THEN
                RAISE EXCEPTION 'Query too complex: exceeds maximum of % total conditions',
                    v_max_total_conditions
                    USING ERRCODE = 'data_exception',
                        HINT = 'Simplify your filters or use pagination';
            END IF;

            -- Validate filter structure
            IF NOT (v_filter ? 'column' AND v_filter ? 'operator') THEN
                RAISE EXCEPTION 'Invalid filter structure: missing column or operator'
                    USING ERRCODE = 'invalid_parameter_value',
                        HINT = 'Each filter must have "column" and "operator" fields';
            END IF;

            v_column := v_filter ->> 'column';
            v_operator := v_filter ->> 'operator';
            v_value := v_filter -> 'value';

            -- 🔍 VALIDATION: Column name checks
            IF v_column IS NULL OR length(v_column) = 0 OR length(v_column) > 63 THEN
                RAISE EXCEPTION 'Invalid column name length (max 63 characters)'
                    USING ERRCODE = 'invalid_parameter_value';
            END IF;

            IF NOT cms.validate_column_name(p_schema, p_table, v_column) THEN
                RAISE EXCEPTION 'Column does not exist in table: %', v_column
                    USING ERRCODE = 'undefined_column';
            END IF;

            -- 🔍 VALIDATION: Operator checks
            IF v_operator IS NULL OR NOT v_operator = ANY (v_allowed_ops) THEN
                RAISE EXCEPTION 'Invalid or unsupported operator: %', COALESCE(v_operator, 'NULL')
                    USING ERRCODE = 'invalid_parameter_value',
                        HINT = format('Allowed operators: %s', array_to_string(v_allowed_ops, ', '));
            END IF;

            -- Get column data type for proper casting
            SELECT data_type
            INTO v_column_type
            FROM information_schema.columns
            WHERE table_schema = p_schema
              AND table_name = p_table
              AND column_name = v_column;

            -- 🎯 OPERATOR HANDLING with enhanced complexity tracking
            IF v_operator IN ('IS NULL', 'IS NOT NULL') THEN
                v_clauses := array_append(v_clauses, format('%I %s', v_column, v_operator));
                v_total_conditions := v_total_conditions + 1;
                v_filter_complexity := v_filter_complexity + 1;

            ELSIF v_operator IN ('IN', 'NOT IN') THEN
                -- 🚨 ENHANCED ARRAY VALIDATION (Expert recommendation #12)
                IF v_value IS NULL OR jsonb_typeof(v_value) != 'array' THEN
                    RAISE EXCEPTION 'IN/NOT IN operator requires array value'
                        USING ERRCODE = 'invalid_parameter_value';
                END IF;

                v_current_array_size := jsonb_array_length(v_value);

                -- Guard against empty arrays
                IF v_current_array_size = 0 THEN
                    RAISE EXCEPTION 'IN/NOT IN array cannot be empty'
                        USING ERRCODE = 'invalid_parameter_value';
                END IF;

                -- 🔒 NEW PROTECTION: Limit individual array size
                IF v_current_array_size > v_max_array_size THEN
                    RAISE EXCEPTION 'IN/NOT IN array too large (max % items, got %)',
                        v_max_array_size, v_current_array_size
                        USING ERRCODE = 'data_exception',
                            HINT = 'Break large arrays into multiple smaller filters';
                END IF;

                -- 🔒 NEW PROTECTION: Limit total number of arrays
                IF v_total_arrays >= v_max_total_arrays THEN
                    RAISE EXCEPTION 'Too many IN/NOT IN arrays (max %, got %)',
                        v_max_total_arrays, v_total_arrays + 1
                        USING ERRCODE = 'data_exception',
                            HINT = 'Reduce the number of array-based filters';
                END IF;

                -- 🔒 ENHANCED PROTECTION: Check if adding this array would exceed total complexity
                IF v_total_conditions + v_current_array_size > v_max_total_conditions THEN
                    RAISE EXCEPTION 'Query too complex: would exceed maximum of % total conditions (current: %, adding: %)',
                        v_max_total_conditions, v_total_conditions, v_current_array_size
                        USING ERRCODE = 'data_exception',
                            HINT = 'Reduce array sizes or number of filters';
                END IF;

                -- Process array elements with enhanced validation
                v_array_elements := '{}';
                FOR v_element IN SELECT * FROM jsonb_array_elements(v_value)
                    LOOP
                        v_temp_value := v_element #>> '{}';

                        -- 🔍 VALIDATION: String length check
                        IF length(v_temp_value) > v_max_string_length THEN
                            RAISE EXCEPTION 'Array element too long (max % characters, got %)',
                                v_max_string_length, length(v_temp_value)
                                USING ERRCODE = 'string_data_length_mismatch',
                                    HINT = 'Reduce the length of individual array values';
                        END IF;

                        -- 🎯 TYPE-SPECIFIC FORMATTING with enhanced validation
                        CASE v_column_type
                            WHEN 'uuid' THEN IF NOT v_temp_value ~
                                                    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                                RAISE EXCEPTION 'Invalid UUID format in array: %', v_temp_value
                                    USING ERRCODE = 'invalid_text_representation';
                                             END IF;
                                             v_formatted_element := format('%L::uuid', v_temp_value);

                            WHEN 'integer', 'bigint', 'smallint' THEN IF NOT v_temp_value ~ '^-?\d+$' THEN
                                RAISE EXCEPTION 'Invalid integer format in array: %', v_temp_value
                                    USING ERRCODE = 'invalid_text_representation';
                                                                      END IF;
                            -- Check for integer overflow
                                                                      BEGIN
                                                                          PERFORM v_temp_value::bigint;
                                                                      EXCEPTION
                                                                          WHEN numeric_value_out_of_range THEN
                                                                              RAISE EXCEPTION 'Integer value out of range in array: %', v_temp_value;
                                                                      END;
                                                                      v_formatted_element := v_temp_value;

                            WHEN 'numeric', 'decimal', 'real', 'double precision'
                                THEN IF NOT v_temp_value ~ '^-?\d*\.?\d+([eE][+-]?\d+)?$' THEN
                                    RAISE EXCEPTION 'Invalid numeric format in array: %', v_temp_value
                                        USING ERRCODE = 'invalid_text_representation';
                                     END IF;
                                     v_formatted_element := v_temp_value;

                            WHEN 'boolean' THEN IF NOT v_temp_value IN
                                                       ('true', 'false', 't', 'f', '1', '0', 'yes', 'no', 'on',
                                                        'off') THEN
                                RAISE EXCEPTION 'Invalid boolean format in array: %', v_temp_value
                                    USING ERRCODE = 'invalid_text_representation';
                                                END IF;
                                                v_formatted_element := format('%L::boolean', v_temp_value);

                            WHEN 'date', 'timestamp', 'timestamptz' THEN -- Validate date format
                            BEGIN
                                PERFORM v_temp_value::timestamp;
                            EXCEPTION
                                WHEN invalid_datetime_format THEN
                                    RAISE EXCEPTION 'Invalid date/timestamp format in array: %', v_temp_value
                                        USING ERRCODE = 'invalid_datetime_format';
                            END;
                            v_formatted_element := format('%L::%s', v_temp_value, v_column_type);

                            ELSE -- Default: string types with escaping
                            v_formatted_element := quote_literal(v_temp_value);
                            END CASE;

                        v_array_elements := array_append(v_array_elements, v_formatted_element);
                    END LOOP;

                -- Build the final IN/NOT IN clause
                v_clauses := array_append(v_clauses,
                                          format('%I %s (%s)', v_column, v_operator,
                                                 array_to_string(v_array_elements, ', '))
                             );

                -- Update complexity counters
                v_total_conditions := v_total_conditions + v_current_array_size;
                v_total_arrays := v_total_arrays + 1;
                v_filter_complexity := v_filter_complexity + v_current_array_size;

            ELSE
                -- 🎯 REGULAR COMPARISON OPERATORS
                IF v_value IS NULL OR jsonb_typeof(v_value) = 'null' THEN
                    RAISE EXCEPTION 'Cannot use operator % with NULL value. Use IS NULL/IS NOT NULL instead', v_operator
                        USING ERRCODE = 'invalid_parameter_value';
                END IF;

                v_temp_value := v_value #>> '{}';

                -- 🔍 VALIDATION: String length check
                IF length(v_temp_value) > v_max_string_length THEN
                    RAISE EXCEPTION 'Value too long (max % characters, got %)',
                        v_max_string_length, length(v_temp_value)
                        USING ERRCODE = 'string_data_length_mismatch';
                END IF;

                -- 🎯 TYPE-SAFE FORMATTING (same logic as arrays)
                CASE v_column_type
                    WHEN 'uuid'
                        THEN IF NOT v_temp_value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' THEN
                            RAISE EXCEPTION 'Invalid UUID format: %', v_temp_value
                                USING ERRCODE = 'invalid_text_representation';
                             END IF;
                             v_typed_value := format('%L::uuid', v_temp_value);

                    WHEN 'integer', 'bigint', 'smallint' THEN IF NOT v_temp_value ~ '^-?\d+' THEN
                        RAISE EXCEPTION 'Invalid integer format: %', v_temp_value
                            USING ERRCODE = 'invalid_text_representation';
                                                              END IF;
                    -- Validate range
                                                              BEGIN
                                                                  PERFORM v_temp_value::bigint;
                                                              EXCEPTION
                                                                  WHEN numeric_value_out_of_range THEN
                                                                      RAISE EXCEPTION 'Integer value out of range: %', v_temp_value;
                                                              END;
                                                              v_typed_value := v_temp_value;

                    WHEN 'numeric', 'decimal', 'real', 'double precision'
                        THEN IF NOT v_temp_value ~ '^-?\d*\.?\d+([eE][+-]?\d+)?' THEN
                            RAISE EXCEPTION 'Invalid numeric format: %', v_temp_value
                                USING ERRCODE = 'invalid_text_representation';
                             END IF;
                             v_typed_value := v_temp_value;

                    WHEN 'boolean'
                        THEN IF NOT v_temp_value IN ('true', 'false', 't', 'f', '1', '0', 'yes', 'no', 'on', 'off') THEN
                            RAISE EXCEPTION 'Invalid boolean format: %', v_temp_value
                                USING ERRCODE = 'invalid_text_representation';
                             END IF;
                             v_typed_value := format('%L::boolean', v_temp_value);

                    WHEN 'date', 'timestamp', 'timestamptz' THEN BEGIN
                                                                     PERFORM v_temp_value::timestamp;
                                                                 EXCEPTION
                                                                     WHEN invalid_datetime_format THEN
                                                                         RAISE EXCEPTION 'Invalid date/timestamp format: %', v_temp_value
                                                                             USING ERRCODE = 'invalid_datetime_format';
                                                                 END;
                                                                 v_typed_value := format('%L::%s', v_temp_value, v_column_type);

                    ELSE -- Default: string types
                    v_typed_value := quote_literal(v_temp_value);
                    END CASE;

                v_clauses := array_append(v_clauses, format('%I %s %s', v_column, v_operator, v_typed_value));
                v_total_conditions := v_total_conditions + 1;
                v_filter_complexity := v_filter_complexity + 1;
            END IF;

            -- 🔒 NEW PROTECTION: Check per-filter complexity
            IF v_filter_complexity > v_max_filter_complexity THEN
                RAISE EXCEPTION 'Individual filter too complex (max %, got %)',
                    v_max_filter_complexity, v_filter_complexity
                    USING ERRCODE = 'data_exception',
                        HINT = 'Simplify this filter or break it into multiple filters';
            END IF;

            v_total_complexity := v_total_complexity + v_filter_complexity;
        END LOOP;

    -- Calculate processing time for monitoring
    v_processing_time := clock_timestamp() - v_start_time;

    -- 🔍 PERFORMANCE MONITORING: Log if query is approaching limits
    IF v_total_conditions > v_max_total_conditions * 0.8 THEN
        RAISE WARNING 'WHERE clause approaching complexity limit: % of % conditions used (%.3f ms to build)',
            v_total_conditions, v_max_total_conditions,
            EXTRACT(MILLISECONDS FROM v_processing_time);
    END IF;

    -- 📊 COMPLEXITY REPORTING for monitoring
    IF v_total_arrays > v_max_total_arrays * 0.7 THEN
        RAISE WARNING 'High array usage in WHERE clause: % of % arrays used',
            v_total_arrays, v_max_total_arrays;
    END IF;

    -- Return the built WHERE clause
    IF array_length(v_clauses, 1) > 0 THEN
        RETURN array_to_string(v_clauses, ' AND ');
    ELSE
        RETURN NULL;
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        -- 🚨 ENHANCED ERROR REPORTING with context
        RAISE EXCEPTION 'WHERE clause build failed: % (Filter context: schema=%, table=%, total_conditions=%, total_arrays=%)',
            SQLERRM, p_schema, p_table, v_total_conditions, v_total_arrays
            USING ERRCODE = SQLSTATE,
                HINT = 'Check filter syntax, data types, and complexity limits';
END;
$$ LANGUAGE plpgsql STABLE security definer;

-- SECTION: BUILD SORT CLAUSE
-- In this section, we define the build sort clause function. This function is used to build the sort clause for a query.
create or replace function cms.build_sort_clause (p_schema text, p_table text, p_sort jsonb) RETURNS text
set
  search_path = '' as $$
DECLARE
    v_column    text;
    v_direction text;
    v_clauses   text[] := '{}';
BEGIN
    IF p_sort IS NULL OR jsonb_typeof(p_sort) != 'object' THEN
        RETURN NULL;
    END IF;

    FOR v_column, v_direction IN
        SELECT key, value::text FROM jsonb_each_text(p_sort)
        LOOP
            -- Validate column name
            IF NOT cms.validate_column_name(p_schema, p_table, v_column) THEN
                RAISE EXCEPTION 'Invalid sort column: %', v_column;
            END IF;

            -- Validate direction
            IF v_direction NOT IN ('ASC', 'DESC', 'asc', 'desc') THEN
                RAISE EXCEPTION 'Invalid sort direction: %', v_direction;
            END IF;

            v_clauses := array_append(v_clauses, quote_ident(v_column) || ' ' || upper(v_direction));
        END LOOP;

    IF cardinality(v_clauses) > 0 THEN
        RETURN 'ORDER BY ' || array_to_string(v_clauses, ', ');
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- SECTION: QUERY TABLE
-- In this section, we define the query table function. This function is used to query a table. We require SECURITY DEFINER because we need to access to the end application's tables. Access is verified by the has_data_permission function.
create or replace function cms.query_table (
  p_schema text,
  p_table text,
  p_filters jsonb default '[]',
  p_sort jsonb default '{}',
  p_pagination jsonb default '{"limit": 25, "offset": 0}'
) RETURNS table (records jsonb, total_count bigint) SECURITY DEFINER
set
  row_security = off
set
  search_path = '' as $$
DECLARE
    v_sql        text;
    v_where      text;
    v_sort       text;
    v_limit      int;
    v_offset     int;
    v_start_time TIMESTAMPTZ := clock_timestamp();
    v_query_time INTERVAL;
BEGIN
    -- Validate schema and table names
    p_schema := cms.sanitize_identifier(p_schema);
    p_table := cms.sanitize_identifier(p_table);

    -- Permission check
    IF NOT cms.has_data_permission('select'::cms.system_action, p_schema, p_table) THEN
        RAISE EXCEPTION 'The user does not have permission to read this table'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_where := cms.build_where_clause(p_schema, p_table, p_filters);
    v_sort := cms.build_sort_clause(p_schema, p_table, p_sort);

    -- Safely extract pagination parameters
    v_limit := COALESCE((p_pagination ->> 'limit')::int, 25);
    v_offset := COALESCE((p_pagination ->> 'offset')::int, 0);

    IF v_limit < 1 THEN
        v_limit := 1;
    ELSIF v_limit > 50 THEN
        RAISE EXCEPTION 'Limit too large (max 1000, requested %)', v_limit
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF v_offset < 0 THEN
        v_offset := 0;
    ELSIF v_offset > 1000000 THEN
        RAISE EXCEPTION 'Offset too large (max 1,000,000, requested %)', v_offset
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- 🔧 FIXED: Use CTE to properly separate total count from paginated results
    v_sql := format(
            'WITH total_count_query AS (
                SELECT COUNT(*) as total_records
                FROM %I.%I t
                WHERE %s
            ),
            paginated_query AS (
                SELECT to_jsonb(t.*) as record_data
                FROM %I.%I t
                WHERE %s %s
                LIMIT %s OFFSET %s
            )
            SELECT
                COALESCE(jsonb_agg(record_data), ''[]''::jsonb) AS records,
                (SELECT total_records FROM total_count_query) AS total_count
            FROM paginated_query',
            p_schema, p_table,
            COALESCE(v_where, 'TRUE'),
            p_schema, p_table,
            COALESCE(v_where, 'TRUE'),
            COALESCE(v_sort, ''),
            v_limit,
            v_offset
             );

    RETURN QUERY EXECUTE v_sql;

    -- Performance monitoring
    v_query_time := clock_timestamp() - v_start_time;
    IF EXTRACT(MILLISECONDS FROM v_query_time) > 5000 THEN
        RAISE WARNING 'Slow query detected: %.3f ms for %.%',
            EXTRACT(MILLISECONDS FROM v_query_time), p_schema, p_table;
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Query execution failed for %.%: % (SQLSTATE: %)',
            p_schema, p_table, SQLERRM, SQLSTATE;
END;
$$ LANGUAGE plpgsql;

-- SECTION: AUDIT LOG TABLE
-- In this section, we define the audit log table. This table is used to store the audit logs.
create table if not exists cms.audit_logs (
  id UUID primary key default gen_random_uuid (),
  created_at TIMESTAMPTZ not null default now(),
  account_id UUID references cms.accounts (id) on delete set null,
  user_id UUID references auth.users (id) on delete set null default auth.uid (),
  operation TEXT not null,
  schema_name TEXT not null,
  table_name TEXT not null,
  record_id TEXT,
  old_data JSONB,
  new_data JSONB,
  severity cms.audit_log_severity not null,
  metadata JSONB
);

comment on table cms.audit_logs is 'Table to store the audit logs';

comment on column cms.audit_logs.id is 'The ID of the audit log';

comment on column cms.audit_logs.created_at is 'The timestamp of the audit log';

comment on column cms.audit_logs.account_id is 'The ID of the account';

comment on column cms.audit_logs.user_id is 'The ID of the user';

comment on column cms.audit_logs.operation is 'The operation of the audit log';

comment on column cms.audit_logs.schema_name is 'The schema of the audit log';

comment on column cms.audit_logs.table_name is 'The table of the audit log';

comment on column cms.audit_logs.record_id is 'The ID of the record';

comment on column cms.audit_logs.old_data is 'The old data of the audit log';

comment on column cms.audit_logs.new_data is 'The new data of the audit log';

comment on column cms.audit_logs.severity is 'The severity of the audit log';

comment on column cms.audit_logs.metadata is 'The metadata of the audit log';

-- Grants
grant
select
,
  INSERT on cms.audit_logs to authenticated;

grant
select
  on cms.audit_logs to service_role;

-- Enable RLS for the audit log table
alter table cms.audit_logs ENABLE row LEVEL SECURITY;

-- Indexes
create index idx_audit_logs_created_at on cms.audit_logs (created_at);

create index idx_audit_logs_account_id on cms.audit_logs (account_id);

create index idx_audit_logs_operation on cms.audit_logs (operation);

create index idx_audit_logs_schema_table on cms.audit_logs (schema_name, table_name);

-- SECTION: CREATE AUDIT LOG
-- In this section, we define the create audit log function. This function is used to create an audit log.
create or replace function cms.create_audit_log (
  p_operation TEXT,
  p_schema TEXT,
  p_table TEXT,
  p_record_id TEXT,
  p_old_data JSONB,
  p_new_data JSONB,
  p_severity cms.audit_log_severity default 'info',
  p_metadata JSONB default '{}'::jsonb
) RETURNS UUID
set
  search_path = '' as $$
DECLARE
    v_log_id UUID;
BEGIN
    -- Insert log entry
    INSERT INTO cms.audit_logs (account_id,
                                     operation,
                                     schema_name,
                                     table_name,
                                     record_id,
                                     old_data,
                                     new_data,
                                     severity,
                                     metadata)
    VALUES (cms.get_current_user_account_id(),
            p_operation,
            p_schema,
            p_table,
            p_record_id,
            p_old_data,
            p_new_data,
            p_severity,
            p_metadata)
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- SECTION: CAN READ AUDIT LOG
-- In this section, we define the can read audit log function. This function is used to check if the user can read the audit log.
create or replace function cms.can_read_audit_log (p_target_account_id uuid) returns boolean
set
  search_path = '' as $$
declare
    v_can_read_logs                 boolean;
    v_current_account_role_rank int;
    v_target_account_role_rank  int;
begin
    -- the user is an admin
    if not cms.verify_admin_access() then
        return false;
    end if;

    -- The user first must have a permission to read the audit log
    select cms.has_admin_permission('log'::cms.system_resource, 'select'::cms.system_action)
    into v_can_read_logs;

    if not v_can_read_logs then
        return false;
    end if;

    -- The user is the owner of the audit log
    if p_target_account_id = cms.get_current_user_account_id() then
        return true;
    end if;

    -- Get the current account's role rank
    select rank
    into v_current_account_role_rank
    from cms.roles
             join cms.account_roles on cms.roles.id = cms.account_roles.role_id
    where cms.account_roles.account_id = cms.get_current_user_account_id();

    -- Get the target account's role rank
    select rank
    into v_target_account_role_rank
    from cms.roles
             join cms.account_roles on cms.roles.id = cms.account_roles.role_id
    where cms.account_roles.account_id = p_target_account_id;

    -- The user's role rank is less than the target account's role rank
    -- so the user cannot read the audit log of the target account because their role is not high enough
    if (v_target_account_role_rank > v_current_account_role_rank) then
        return false;
    end if;

    return true;
end;
$$ language plpgsql;

grant
execute on function cms.can_read_audit_log to authenticated;

-- SELECT(cms.audit_logs)
create policy select_cms_audit_logs on cms.audit_logs for
select
  using (cms.can_read_audit_log (account_id));

-- INSERT(cms.audit_logs)
-- Only the owner of the audit log can insert into the audit log table
create policy insert_cms_audit_logs on cms.audit_logs for INSERT
with
  check (
    -- The user is the owner of the audit log
    account_id = cms.get_current_user_account_id ()
  );

-- SECTION: GLOBAL SEARCH
-- In this section, we define the global search function. This function is used to search for tables and columns in the database. We require SECURITY DEFINER because we need to access to the end application's tables. Access is verified by the has_data_permission function.
CREATE OR REPLACE FUNCTION cms.global_search (
  p_query_text TEXT,
  p_limit_val INT DEFAULT 10,
  p_offset_val INT DEFAULT 0,
  p_schema_filter TEXT[] DEFAULT ARRAY['public'],
  p_table_filter TEXT[] DEFAULT NULL,
  p_timeout_seconds INT DEFAULT 15
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET
  row_security = OFF
SET
  search_path = '' AS $$
DECLARE
    result JSONB;
    search_terms TEXT[];
    v_original_timeout TEXT;
    v_search_start_time TIMESTAMPTZ;
    v_elapsed_seconds NUMERIC;
    table_metadata RECORD;
    union_queries TEXT[] := '{}';
    final_sql TEXT;
    total_count BIGINT;
    final_results JSONB;
    tables_searched_count INT := 0;
BEGIN
    -- Record start time for performance monitoring
    v_search_start_time := clock_timestamp();

    -- Skip processing for very short queries
    IF length(p_query_text) < 2 THEN
        RETURN jsonb_build_object('results', '[]'::jsonb, 'total', 0);
    END IF;

    -- Store original timeout and set protective timeout
    BEGIN
        SHOW statement_timeout INTO v_original_timeout;
    EXCEPTION
        WHEN OTHERS THEN
            v_original_timeout := '0';
    END;

    EXECUTE format('SET LOCAL statement_timeout = %L', p_timeout_seconds * 1000 || 'ms');

    -- Split search query into terms for better matching
    search_terms := regexp_split_to_array(lower(p_query_text), '\s+');

    -- If the limit is less than 1, set it to 1
    if p_limit_val < 1 then
        p_limit_val := 1;
    end if;

    -- If the offset is less than 0, set it to 0
    if p_offset_val < 0 then
        p_offset_val := 0;
    end if;

    -- =================================================================
    -- OPTIMIZATION: Build a single UNION ALL query instead of looping
    -- =================================================================

    -- Step 1: Gather all searchable tables and their configurations at once.
    -- This loop does NOT execute queries, it only builds the query string fragments.
    FOR table_metadata IN
        SELECT
            tm.schema_name,
            tm.table_name,
            tm.display_name,
            tm.columns_config
        FROM cms.table_metadata tm
        WHERE
            tm.is_searchable = TRUE
            AND (p_schema_filter IS NULL OR tm.schema_name = ANY (p_schema_filter))
            AND (p_table_filter IS NULL OR tm.table_name = ANY (p_table_filter))
            -- IMPORTANT: Check permissions *before* trying to build a query for the table.
            AND cms.has_data_permission('select'::cms.system_action, tm.schema_name, tm.table_name)
            AND tm.columns_config IS NOT NULL
            AND jsonb_typeof(tm.columns_config) = 'object'
        -- Order the tables to prioritize better matches first, just like the original cursor.
        ORDER BY
            CASE
                WHEN tm.table_name ILIKE '%' || p_query_text || '%' THEN 0
                WHEN tm.display_name ILIKE '%' || p_query_text || '%' THEN 1
                ELSE 2
            END,
            tm.ordering NULLS LAST,
            tm.schema_name,
            tm.table_name
        -- Limit the number of tables to prevent creating a monstrously large query.
        LIMIT 20
    LOOP
        -- Step 2: For each table, construct its part of the UNION ALL query.
        DECLARE
            display_column TEXT;
            display_column_fallbacks TEXT[] := '{name,title,label,username,email,description,id}';
            where_clause TEXT;
            score_sql TEXT;
            searchable_cols TEXT[];
            primary_key_columns TEXT[] := '{}';
            col_name TEXT;
            col_keys TEXT[];
            pk_col JSONB;
            term TEXT;
            where_conditions TEXT[] := '{}';
        BEGIN
            -- Extract column names from columns_config
            col_keys := ARRAY(SELECT k FROM jsonb_object_keys(table_metadata.columns_config) AS k);

            -- Find primary key columns for URL building
            IF table_metadata.columns_config ? 'ui_config' AND
               jsonb_typeof(table_metadata.columns_config -> 'ui_config' -> 'primary_keys') = 'array' THEN
                FOR pk_col IN SELECT *
                              FROM jsonb_array_elements(table_metadata.columns_config -> 'ui_config' -> 'primary_keys')
                LOOP
                    primary_key_columns := array_append(primary_key_columns, pk_col ->> 'column_name');
                END LOOP;
            END IF;
            IF array_length(primary_key_columns, 1) IS NULL THEN
                primary_key_columns := ARRAY['id'];
            END IF;

            -- Find best display column
            FOREACH col_name IN ARRAY display_column_fallbacks LOOP
                IF col_name = ANY(col_keys) THEN
                    display_column := col_name;
                    EXIT;
                END IF;
            END LOOP;
            display_column := COALESCE(display_column, col_keys[1], 'id');

            -- Collect searchable columns
            searchable_cols := ARRAY(
                SELECT key
                FROM jsonb_object_keys(table_metadata.columns_config) key
                WHERE table_metadata.columns_config->key->>'is_searchable' IS DISTINCT FROM 'false'
            );

            IF array_length(searchable_cols, 1) IS NULL THEN
                CONTINUE; -- Skip table if no columns are searchable
            END IF;

            -- Build WHERE clause for this specific table
            FOREACH term IN ARRAY search_terms LOOP
                IF term = '' THEN CONTINUE; END IF;
                DECLARE
                    term_clauses TEXT[] := '{}';
                BEGIN
                    FOREACH col_name IN ARRAY searchable_cols LOOP
                        term_clauses := array_append(term_clauses, format('%I::text ILIKE %L', col_name, '%' || term || '%'));
                    END LOOP;
                    where_conditions := array_append(where_conditions, '(' || array_to_string(term_clauses, ' OR ') || ')');
                END;
            END LOOP;

            IF array_length(where_conditions, 1) = 0 THEN
                CONTINUE; -- No valid search terms, skip table
            END IF;
            where_clause := array_to_string(where_conditions, ' AND ');


            -- Build score calculation
            score_sql := format(
                '(CASE WHEN %I::text ILIKE %L THEN 100.0 WHEN %I::text ILIKE %L THEN 50.0 ELSE 1.0 END)',
                display_column, p_query_text,
                display_column, p_query_text || '%'
            );

            -- Construct the SELECT statement for this table and add it to our array of queries
            union_queries := array_append(union_queries, format(
                $subquery$
                (SELECT
                    %L AS schema_name,
                    %L AS table_name,
                    %L AS table_display,
                    %L::text[] AS primary_keys,
                    %I::text AS title,
                    %s AS rank,
                    to_jsonb(t.*) AS record,
                    jsonb_build_object('schema', %L, 'table', %L, 'id', to_jsonb(t.*)->%L) as url_params
                FROM %I.%I t
                WHERE %s
                LIMIT 5)
                $subquery$,
                table_metadata.schema_name,
                table_metadata.table_name,
                COALESCE(table_metadata.display_name, table_metadata.table_name),
                primary_key_columns,
                display_column,
                score_sql,
                table_metadata.schema_name,
                table_metadata.table_name,
                primary_key_columns[1],
                table_metadata.schema_name,
                table_metadata.table_name,
                where_clause
            ));
        END;
    END LOOP;

    tables_searched_count := array_length(union_queries, 1);

    -- If no searchable tables were found, exit early.
    IF tables_searched_count IS NULL OR tables_searched_count = 0 THEN
        RETURN jsonb_build_object(
            'results', '[]'::jsonb, 'total', 0, 'tables_count', 0, 'tables_searched', 0,
            'query', p_query_text, 'has_more', false
        );
    END IF;

    -- Step 3: Combine all subqueries into one large query with a final aggregation, ordering, and pagination.
    final_sql := format(
        $finalquery$
        WITH all_results AS (
            %s
        ),
        counted_results AS (
            SELECT *, COUNT(*) OVER() as full_count FROM all_results
        ),
        paginated_results AS (
            SELECT *
            FROM counted_results
            ORDER BY rank DESC, title ASC
            LIMIT %s OFFSET %s
        )
        SELECT
            (SELECT COALESCE(jsonb_agg(pr), '[]'::jsonb) FROM (SELECT schema_name, table_name, table_display, title, rank, primary_keys, record, url_params FROM paginated_results) pr),
            (SELECT full_count FROM counted_results LIMIT 1)
        $finalquery$,
        array_to_string(union_queries, ' UNION ALL '),
        p_limit_val,
        p_offset_val
    );

    -- Step 4: Execute the single, powerful query.
    BEGIN
        EXECUTE final_sql INTO final_results, total_count;
    EXCEPTION
        WHEN query_canceled THEN
            RAISE WARNING 'Global search query timed out.';
            final_results := '[]'::jsonb;
            total_count := 0;
        WHEN OTHERS THEN
            RAISE WARNING 'Global search failed: %. SQLSTATE: %', SQLERRM, SQLSTATE;
            RAISE NOTICE 'Failing SQL: %', final_sql;
            RETURN jsonb_build_object('error', SQLERRM, 'detail', SQLSTATE);
    END;

    -- Reset timeout to original value
    BEGIN
        IF v_original_timeout IS NOT NULL AND v_original_timeout != '0' THEN
            EXECUTE format('SET LOCAL statement_timeout = %L', v_original_timeout);
        ELSE
            RESET statement_timeout;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not reset statement_timeout: %', SQLERRM;
    END;

    -- Calculate final elapsed time
    v_elapsed_seconds := EXTRACT(EPOCH FROM (clock_timestamp() - v_search_start_time));

    -- Build the final result with performance metrics
    result := jsonb_build_object(
        'results', COALESCE(final_results, '[]'::jsonb),
        'total', COALESCE(total_count, 0),
        'tables_count', tables_searched_count,
        'tables_searched', tables_searched_count,
        'query', p_query_text,
        'has_more', COALESCE(total_count, 0) > (p_limit_val + p_offset_val),
        'performance', jsonb_build_object(
            'elapsed_seconds', round(v_elapsed_seconds, 3),
            'timeout_seconds', p_timeout_seconds,
            'timed_out', v_elapsed_seconds >= p_timeout_seconds
        )
    );

    RETURN result;

EXCEPTION
    WHEN OTHERS THEN
        -- Ensure timeout is reset even on error
        BEGIN
            IF v_original_timeout IS NOT NULL AND v_original_timeout != '0' THEN
                EXECUTE format('SET LOCAL statement_timeout = %L', v_original_timeout);
            ELSE
                RESET statement_timeout;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Emergency timeout reset failed: %', SQLERRM;
        END;
        -- Return error information for debugging
        RETURN jsonb_build_object(
            'results', '[]'::jsonb, 'total', 0, 'error', SQLERRM, 'detail', SQLSTATE
        );
END;
$$;

-- Grant permissions to the global search function
grant
execute on function cms.global_search to authenticated;

-- SECTION: GET COLUMN STORAGE CONFIG
-- In this section, we define the get column storage config function. This function is used to get the storage configuration for a column.
create or replace function cms.get_column_storage_config (p_schema text, p_table text, p_column text) RETURNS jsonb
set
  search_path = '' as $$
DECLARE
    v_config jsonb;
BEGIN
    -- Validate inputs
    p_schema := cms.sanitize_identifier(p_schema);
    p_table := cms.sanitize_identifier(p_table);
    p_column := cms.sanitize_identifier(p_column);

    -- Check permissions
    IF NOT cms.has_data_permission('select'::cms.system_action, p_schema, p_table) THEN
        RAISE EXCEPTION 'Permission denied for accessing table metadata';
    END IF;

    SELECT tm.columns_config -> p_column -> 'ui_config' -> 'ui_data_type_config'
    INTO v_config
    FROM cms.table_metadata tm
    WHERE tm.schema_name = p_schema
      AND tm.table_name = p_table
      AND tm.columns_config -> p_column -> 'ui_config' ->> 'ui_data_type' IN ('file', 'image');

    RETURN COALESCE(v_config, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;

grant
execute on function cms.get_column_storage_config to authenticated;

-- SECTION: GET AUTH USERS PERMISSIONS
-- In this section, we define the get auth users permissions function. This function is used to get the permissions for the Auth users in Supabase.
-- Add can_insert permission to the get_current_user_auth_users_permissions function
create or replace function cms.get_current_user_auth_users_permissions () returns jsonb language plpgsql
set
  search_path = '' as $$
declare
    v_can_read   boolean;
    v_can_update boolean;
    v_can_delete boolean;
    v_can_insert boolean;
begin
    select cms.has_admin_permission('auth_user'::cms.system_resource, 'select'::cms.system_action)
    into v_can_read;

    select cms.has_admin_permission('auth_user'::cms.system_resource, 'update'::cms.system_action)
    into v_can_update;

    select cms.has_admin_permission('auth_user'::cms.system_resource, 'delete'::cms.system_action)
    into v_can_delete;

    select cms.has_admin_permission('auth_user'::cms.system_resource, 'insert'::cms.system_action)
    into v_can_insert;

    return jsonb_build_object('can_read', v_can_read, 'can_update', v_can_update, 'can_delete', v_can_delete,
                              'can_insert', v_can_insert);
end;
$$;

grant
execute on function cms.get_current_user_auth_users_permissions to authenticated;

-- Section MFA Restrictions
-- MFA Restrictions:
-- the following policies are applied to the tables as a
-- restrictive policy to ensure that if MFA is enabled, then the policy will be applied.
-- For users that have not enabled MFA, the policy will not be applied and will keep the default behavior.
-- Restrict access to configuration if MFA is enabled
create policy restrict_mfa_configuration on cms.configuration as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to accounts if MFA is enabled
create policy restrict_mfa_accounts on cms.accounts as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to permissions
create policy restrict_mfa_permissions on cms.permissions as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to roles if MFA is enabled
create policy restrict_mfa_roles on cms.roles as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to account_permissions if MFA is enabled
create policy restrict_mfa_account_permissions on cms.account_permissions as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to account_roles if MFA is enabled
create policy restrict_mfa_account_roles on cms.account_roles as restrictive to authenticated using (cms.is_mfa_compliant ());

create policy restrict_mfa_role_permissions on cms.role_permissions as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to permission groups if MFA is enabled
create policy restrict_mfa_permission_groups on cms.permission_groups as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to permission groups permissions if MFA is enabled
create policy restrict_mfa_permission_groups_permissions on cms.permission_group_permissions as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to role_permission_groups if MFA is enabled
create policy restrict_mfa_role_permission_groups on cms.role_permission_groups as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to table metadata if MFA is enabled
create policy restrict_mfa_table_metadata on cms.table_metadata as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to saved views if MFA is enabled
create policy restrict_mfa_saved_views on cms.saved_views as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to saved view roles if MFA is enabled
create policy restrict_mfa_saved_view_roles on cms.saved_view_roles as restrictive to authenticated using (cms.is_mfa_compliant ());

-- Restrict access to audit logs if MFA is enabled
create policy restrict_mfa_audit_logs on cms.audit_logs as restrictive to authenticated using (cms.is_mfa_compliant ());

-- SECTION: UPDATE UPDATED AT COLUMN
-- In this section, we define the update updated at column function. This function is used to update the updated at column for all relevant tables.
do $$
    DECLARE
        t text;
    BEGIN
        FOR t IN
            SELECT table_name
            FROM information_schema.columns
            WHERE table_schema = 'cms'
              AND column_name = 'updated_at'
            LOOP
                EXECUTE format('
            CREATE TRIGGER update_%I_timestamp
            BEFORE UPDATE ON cms.%I
            FOR EACH ROW
            EXECUTE FUNCTION cms.update_updated_at_column();
        ', t, t);
            END LOOP;
    END;
$$;

-- SECTION: AUDIT TRIGGERS FOR PERMISSIONS, ROLES, AND PERMISSION GROUPS
-- This section adds database triggers to automatically log changes to permission-related tables
-- SECTION: AUDIT TRIGGER FUNCTION
-- Generic trigger function that can be used for any table to create audit logs
create or replace function cms.audit_trigger_function () returns trigger
set
  row_security = off
set
  search_path = '' as $$
declare
    v_operation   text;
    v_old_data    jsonb;
    v_new_data    jsonb;
    v_record_id   text;
    v_record_json jsonb;
begin
    -- Determine operation type and get record data
    if TG_OP = 'DELETE' then
        v_operation := 'DELETE';
        v_old_data := to_jsonb(OLD);
        v_new_data := null;
        v_record_json := v_old_data;
    elsif TG_OP = 'UPDATE' then
        v_operation := 'UPDATE';
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
        v_record_json := v_new_data;
    elsif TG_OP = 'INSERT' then
        v_operation := 'INSERT';
        v_old_data := null;
        v_new_data := to_jsonb(NEW);
        v_record_json := v_new_data;
    end if;

    -- Generate record ID based on table structure
    -- For tables with single 'id' primary key
    if v_record_json ? 'id' then
        v_record_id := (v_record_json ->> 'id')::text;
    else
        -- For tables with composite primary keys, create a combined ID
        case TG_TABLE_NAME
            when 'account_roles'
                then v_record_id := (v_record_json ->> 'account_id') || '|' || (v_record_json ->> 'role_id');
            when 'role_permissions'
                then v_record_id := (v_record_json ->> 'role_id') || '|' || (v_record_json ->> 'permission_id');
            when 'account_permissions'
                then v_record_id := (v_record_json ->> 'account_id') || '|' || (v_record_json ->> 'permission_id');
            when 'permission_group_permissions'
                then v_record_id := (v_record_json ->> 'group_id') || '|' || (v_record_json ->> 'permission_id');
            when 'role_permission_groups'
                then v_record_id := (v_record_json ->> 'role_id') || '|' || (v_record_json ->> 'group_id');
            else -- Fallback: use all non-null fields as record ID
            v_record_id := v_record_json::text;
            end case;
    end if;

    -- Create audit log entry
    perform cms.create_audit_log(
            p_operation := v_operation,
            p_schema := TG_TABLE_SCHEMA,
            p_table := TG_TABLE_NAME,
            p_record_id := v_record_id,
            p_old_data := v_old_data,
            p_new_data := v_new_data,
            p_severity := 'info',
            p_metadata := jsonb_build_object(
                    'trigger_name', TG_NAME,
                    'trigger_when', TG_WHEN,
                    'trigger_level', TG_LEVEL
                          )
            );

    -- Return appropriate record
    if TG_OP = 'DELETE' then
        return OLD;
    else
        return NEW;
    end if;
end;
$$ language plpgsql security definer;

-- SECTION: ROLES TABLE AUDIT TRIGGERS
-- Create triggers for the roles table
create trigger roles_audit_insert_trigger
after insert on cms.roles for each row
execute function cms.audit_trigger_function ();

create trigger roles_audit_update_trigger
after
update on cms.roles for each row
execute function cms.audit_trigger_function ();

create trigger roles_audit_delete_trigger
after delete on cms.roles for each row
execute function cms.audit_trigger_function ();

-- SECTION: PERMISSIONS TABLE AUDIT TRIGGERS
-- Create triggers for the permissions table
create trigger permissions_audit_insert_trigger
after insert on cms.permissions for each row
execute function cms.audit_trigger_function ();

create trigger permissions_audit_update_trigger
after
update on cms.permissions for each row
execute function cms.audit_trigger_function ();

create trigger permissions_audit_delete_trigger
after delete on cms.permissions for each row
execute function cms.audit_trigger_function ();

-- SECTION: PERMISSION GROUPS TABLE AUDIT TRIGGERS
-- Create triggers for the permission_groups table
create trigger permission_groups_audit_insert_trigger
after insert on cms.permission_groups for each row
execute function cms.audit_trigger_function ();

create trigger permission_groups_audit_update_trigger
after
update on cms.permission_groups for each row
execute function cms.audit_trigger_function ();

create trigger permission_groups_audit_delete_trigger
after delete on cms.permission_groups for each row
execute function cms.audit_trigger_function ();

-- SECTION: ACCOUNT ROLES TABLE AUDIT TRIGGERS
-- Create triggers for the account_roles junction table
create trigger account_roles_audit_insert_trigger
after insert on cms.account_roles for each row
execute function cms.audit_trigger_function ();

create trigger account_roles_audit_delete_trigger
after delete on cms.account_roles for each row
execute function cms.audit_trigger_function ();

-- SECTION: ROLE PERMISSIONS TABLE AUDIT TRIGGERS
-- Create triggers for the role_permissions junction table
create trigger role_permissions_audit_insert_trigger
after insert on cms.role_permissions for each row
execute function cms.audit_trigger_function ();

create trigger role_permissions_audit_delete_trigger
after delete on cms.role_permissions for each row
execute function cms.audit_trigger_function ();

-- SECTION: ACCOUNT PERMISSIONS TABLE AUDIT TRIGGERS
-- Create triggers for the account_permissions table
create trigger account_permissions_audit_insert_trigger
after insert on cms.account_permissions for each row
execute function cms.audit_trigger_function ();

create trigger account_permissions_audit_update_trigger
after
update on cms.account_permissions for each row
execute function cms.audit_trigger_function ();

create trigger account_permissions_audit_delete_trigger
after delete on cms.account_permissions for each row
execute function cms.audit_trigger_function ();

-- SECTION: PERMISSION GROUP PERMISSIONS TABLE AUDIT TRIGGERS
-- Create triggers for the permission_group_permissions junction table
create trigger permission_group_permissions_audit_insert_trigger
after insert on cms.permission_group_permissions for each row
execute function cms.audit_trigger_function ();

create trigger permission_group_permissions_audit_delete_trigger
after delete on cms.permission_group_permissions for each row
execute function cms.audit_trigger_function ();

-- SECTION: ROLE PERMISSION GROUPS TABLE AUDIT TRIGGERS
-- Create triggers for the role_permission_groups junction table
create trigger role_permission_groups_audit_insert_trigger
after insert on cms.role_permission_groups for each row
execute function cms.audit_trigger_function ();

create trigger role_permission_groups_audit_delete_trigger
after delete on cms.role_permission_groups for each row
execute function cms.audit_trigger_function ();

-- Admin Access Management Functions
-- This migration adds functions to properly manage admin access by handling both JWT metadata and account creation

-- Function to grant admin access to a user
-- This function performs two operations in a transaction:
-- 1. Updates the user's app_metadata in auth.users to set admin_access = 'true'
-- 2. Creates or activates an account in cms.accounts if it doesn't exist
create or replace function cms.grant_admin_access (
    p_user_id uuid
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
    v_account_exists boolean;
begin
    -- Get the current user's ID from JWT
    v_current_user_id := auth.uid();
    
    if v_current_user_id is null then
        return jsonb_build_object('success', false, 'error', 'Not authenticated');
    end if;
    
    -- Prevent users from granting admin access to themselves
    if v_current_user_id = p_user_id then
        return jsonb_build_object('success', false, 'error', 'Cannot grant admin access to yourself');
    end if;
    
    -- Check if current user has permission to insert accounts
    if not cms.has_admin_permission('account'::cms.system_resource, 'insert') then
        return jsonb_build_object('success', false, 'error', 'Insufficient permissions to grant admin access');
    end if;
    
    -- Get current app_metadata from auth.users
    select raw_app_meta_data into v_existing_metadata
    from auth.users
    where id = p_user_id;
    
    if v_existing_metadata is null then
        return jsonb_build_object('success', false, 'error', 'User not found');
    end if;
    
    -- Update app_metadata to include admin_access = 'true'
    v_updated_metadata := coalesce(v_existing_metadata, '{}'::jsonb) || jsonb_build_object('cms_access', 'true');
    
    -- Update the user's app_metadata
    update auth.users 
    set raw_app_meta_data = v_updated_metadata,
        updated_at = now()
    where id = p_user_id;
    
    if not found then
        return jsonb_build_object('success', false, 'error', 'Failed to update user metadata');
    end if;
    
    -- Check if account already exists in cms.accounts
    select exists(
        select 1 from cms.accounts 
        where auth_user_id = p_user_id
    ) into v_account_exists;
    
    if not v_account_exists then
        -- Create account in cms.accounts
        insert into cms.accounts (auth_user_id, is_active)
        values (p_user_id, true)
        on conflict (auth_user_id) do update set
            is_active = true,
            updated_at = now();
    else
        -- Ensure existing account is active
        update cms.accounts 
        set is_active = true,
            updated_at = now()
        where auth_user_id = p_user_id;
    end if;
    
    -- Create audit log
    perform cms.create_audit_log(
        'grant_admin_access',
        'cms', 
        'accounts',
        p_user_id::text,
        null, -- old_data
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
$$;

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