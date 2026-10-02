-- This migration is generated from apps/web/supabase/schemas/*.sql.
-- Do not edit it by hand. Run: pnpm --filter web supabase:build-initial-migration
-- -----------------------------------------------------------------------------
-- Source: apps/web/supabase/schemas/00-privileges.sql
-- -----------------------------------------------------------------------------
/*
 * -------------------------------------------------------
 * Section: Revoke default privileges from public schema
 * We will revoke all default privileges from public schema on functions to prevent public access to them
 * -------------------------------------------------------
 */

-- Create a private PymeKit schema
create schema if not exists kit;

create extension if not exists "unaccent" schema kit;

-- We remove all default privileges from public schema on functions to
--   prevent public access to them
alter default privileges
revoke
execute on functions
from
  public;

revoke all on schema public
from
  public;

revoke all PRIVILEGES on database "postgres"
from
  "anon";

revoke all PRIVILEGES on schema "public"
from
  "anon";

revoke all PRIVILEGES on schema "storage"
from
  "anon";

revoke all PRIVILEGES on all SEQUENCES in schema "public"
from
  "anon";

revoke all PRIVILEGES on all SEQUENCES in schema "storage"
from
  "anon";

revoke all PRIVILEGES on all FUNCTIONS in schema "public"
from
  "anon";

revoke all PRIVILEGES on all FUNCTIONS in schema "storage"
from
  "anon";

revoke all PRIVILEGES on all TABLES in schema "public"
from
  "anon";

revoke all PRIVILEGES on all TABLES in schema "storage"
from
  "anon";

-- We remove all default privileges from public schema on functions to
--   prevent public access to them by default
alter default privileges in schema public
revoke
execute on functions
from
  anon,
  authenticated;

-- we allow the authenticated role to execute functions in the public schema
grant usage on schema public to authenticated;

-- we allow the service_role role to execute functions in the public schema
grant usage on schema public to service_role;

-- -----------------------------------------------------------------------------
-- Source: apps/web/supabase/schemas/01-enums.sql
-- -----------------------------------------------------------------------------
/*
 * -------------------------------------------------------
 * Section: Enums
 * We create the enums for the schema
 * -------------------------------------------------------
 */

/*
* Permissions
- We create the permissions for the PymeKit. These permissions are used to manage the permissions for the roles
- The permissions are 'roles.manage', 'billing.manage', 'settings.manage', 'members.manage', and 'invites.manage'.
- You can add more permissions as needed.
*/
create type public.app_permissions as enum(
  'roles.manage',
  'billing.manage',
  'settings.manage',
  'members.manage',
  'invites.manage'
);

/*
* Subscription Status
- We create the subscription status for the PymeKit. These statuses are used to manage the status of the subscriptions
- The statuses are 'active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', and 'paused'.
- You can add more statuses as needed.
*/
create type public.subscription_status as ENUM(
  'active',
  'trialing',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused'
);

/*
Payment Status
- We create the payment status for the PymeKit. These statuses are used to manage the status of the payments
*/
create type public.payment_status as ENUM('pending', 'succeeded', 'failed');

/*
* Billing Provider
- We create the billing provider for the PymeKit. These providers are used to manage the billing provider for the accounts
- The providers are 'stripe'
- You can add more providers as needed.
*/
create type public.billing_provider as ENUM('stripe');

/*
* Subscription Item Type
- We create the subscription item type for the PymeKit. These types are used to manage the type of the subscription items
- The types are 'flat', 'per_seat', and 'metered'.
- You can add more types as needed.
*/
create type public.subscription_item_type as ENUM('flat', 'per_seat', 'metered');

/*
* Invitation Type
- We create the invitation type for the PymeKit. These types are used to manage the type of the invitation
*/
create type public.invitation as (email text, role varchar(50));

-- -----------------------------------------------------------------------------
-- Source: apps/web/supabase/schemas/02-config.sql
-- -----------------------------------------------------------------------------
/*
 * -------------------------------------------------------
 * Section: App Configuration
 * We create the configuration for the PymeKit to enable or disable features
 * -------------------------------------------------------
 */

create table if not exists
  public.config (
    enable_team_accounts boolean default true not null,
    enable_account_billing boolean default true not null,
    enable_team_account_billing boolean default true not null,
    billing_provider public.billing_provider default 'stripe' not null
  );

-- The application expects a single global configuration row.
create unique index if not exists config_singleton on public.config ((true));

comment on table public.config is 'Configuration for the PymeKit.';

comment on column public.config.enable_team_accounts is 'Enable team accounts';

comment on column public.config.enable_account_billing is 'Enable billing for individual accounts';

comment on column public.config.enable_team_account_billing is 'Enable billing for team accounts';

comment on column public.config.billing_provider is 'The billing provider to use';

-- RLS(config)
alter table public.config enable row level security;

-- create config row
insert into
  public.config (
    enable_team_accounts,
    enable_account_billing,
    enable_team_account_billing
  )
values
  (true, true, true)
on conflict
do nothing;

-- Revoke all on accounts table from authenticated and service_role
revoke all on public.config
from
  authenticated,
  service_role;

-- Open up access to config table for authenticated users and service_role
grant
select
  on public.config to authenticated,
  service_role;

-- RLS
-- SELECT(config):
-- Authenticated users can read the config
create policy "public config can be read by authenticated users" on public.config for
select
  to authenticated using (true);

-- Function to get the config settings
create
or replace function public.get_config () returns json
set
  search_path = '' as $$
declare
    result record;
begin
    select
        *
    from
        public.config
    limit 1 into result;

    return row_to_json(result);

end;

$$ language plpgsql;

-- Automatically set timestamps on tables when a row is inserted or updated
create
or replace function public.trigger_set_timestamps () returns trigger
set
  search_path = '' as $$
begin
    if TG_OP = 'INSERT' then
        new.created_at = now();

        new.updated_at = now();

    else
        new.updated_at = now();

        new.created_at = old.created_at;

    end if;

    return NEW;

end
$$ language plpgsql;

-- Automatically set user tracking on tables when a row is inserted or updated
create
or replace function public.trigger_set_user_tracking () returns trigger
set
  search_path = '' as $$
begin
    if TG_OP = 'INSERT' then
        new.created_by = auth.uid();
        new.updated_by = auth.uid();

    else
        new.updated_by = auth.uid();

        new.created_by = old.created_by;

    end if;

    return NEW;

end
$$ language plpgsql;

grant
execute on function public.get_config () to authenticated,
service_role;

-- Function "public.is_set"
-- Check if a field is set in the config
create
or replace function public.is_set (field_name text) returns boolean
set
  search_path = '' as $$
declare
    result boolean;
begin
    execute format('select %I from public.config limit 1', field_name) into result;

    return result;

end;

$$ language plpgsql;

grant
execute on function public.is_set (text) to authenticated;

-- -----------------------------------------------------------------------------
-- Source: apps/web/supabase/schemas/03-accounts.sql
-- -----------------------------------------------------------------------------
/*
 * -------------------------------------------------------
 * Section: Accounts
 * We create the schema for the accounts. Accounts are the top level entity in the PymeKit. They can be team or personal accounts.
 * -------------------------------------------------------
 */

-- Accounts table
create table if not exists
  public.accounts (
    id uuid unique not null default extensions.uuid_generate_v4 (),
    primary_owner_user_id uuid references auth.users on delete cascade not null default auth.uid (),
    name varchar(255) not null check (length(trim(name)) > 0),
    slug text unique,
    email varchar(320) unique,
    is_personal_account boolean default false not null,
    updated_at timestamp with time zone,
    created_at timestamp with time zone,
    created_by uuid references auth.users,
    updated_by uuid references auth.users,
    picture_url varchar(1000),
    public_data jsonb default '{}'::jsonb not null,
    primary key (id)
  );

comment on table public.accounts is 'Accounts are the top level entity in the PymeKit. They can be team or personal accounts.';

comment on column public.accounts.is_personal_account is 'Whether the account is a personal account or not';

comment on column public.accounts.name is 'The name of the account';

comment on column public.accounts.slug is 'The slug of the account';

comment on column public.accounts.primary_owner_user_id is 'The primary owner of the account';

comment on column public.accounts.email is 'The email of the account. For teams, this is the email of the team (if any)';

-- Enable RLS on the accounts table
alter table "public"."accounts" enable row level security;

-- Revoke all on accounts table from authenticated and service_role
revoke all on public.accounts
from
  authenticated,
  service_role;

-- Open up access to accounts
-- authenticated has no INSERT: accounts are only created by the
-- kit.setup_new_user trigger and the create_team_account function (both
-- SECURITY DEFINER), so the role never inserts rows directly.
grant
select
,
  delete on table public.accounts to authenticated;

grant
select
,
  insert,
  delete on table public.accounts to service_role;

-- service_role retains full-table UPDATE (system-managed and identity columns)
grant
update on table public.accounts to service_role;

-- authenticated may only UPDATE genuinely user-editable columns.
-- Identity columns (id, primary_owner_user_id, is_personal_account, email) are
-- guarded by kit.protect_account_fields and must never change. System-managed
-- columns (created_at/updated_at, created_by/updated_by) are written only by
-- triggers or the service_role. Note that `slug` IS user-editable: renaming a
-- team updates it directly (see updateTeamAccountName).
-- Enforced by Postgres before RLS or the trigger run (defense-in-depth).
-- NOTE: BEFORE triggers that mutate timestamps/tracking on NEW keep working,
-- because column privileges are checked against the statement's SET list, not
-- against columns a trigger writes.
grant
update (name, slug, picture_url, public_data) on table public.accounts to authenticated;

-- constraint that conditionally allows nulls on the slug ONLY if
--  personal_account is true
alter table public.accounts
add constraint accounts_slug_null_if_personal_account_true check (
  (
    is_personal_account = true
    and slug is null
  )
  or (
    is_personal_account = false
    and slug is not null
  )
);

alter table public.accounts
add constraint accounts_slug_format check (
  slug is null
  or (
    char_length(slug) <= 255
    and slug ~ '^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$'
  )
);

-- Indexes
create index if not exists ix_accounts_primary_owner_user_id on public.accounts (primary_owner_user_id);

create index if not exists ix_accounts_is_personal_account on public.accounts (is_personal_account);

-- constraint to ensure that the primary_owner_user_id is unique for personal accounts
create unique index unique_personal_account on public.accounts (primary_owner_user_id)
where
  is_personal_account = true;

-- Triggers for accounts table
create trigger accounts_set_timestamps
before insert or update on public.accounts
for each row execute function public.trigger_set_timestamps();

create trigger accounts_set_user_tracking
before insert or update on public.accounts
for each row execute function public.trigger_set_user_tracking();

-- RLS on the accounts table
-- UPDATE(accounts):
-- Team owners can update their accounts
create policy accounts_self_update on public.accounts
for update
  to authenticated using (
    (
      select
        auth.uid ()
    ) = primary_owner_user_id
  )
with
  check (
    (
      select
        auth.uid ()
    ) = primary_owner_user_id
  );

-- Function "public.transfer_team_account_ownership"
-- Function to transfer the ownership of a team account to another user
create
or replace function public.transfer_team_account_ownership (target_account_id uuid, new_owner_id uuid) returns void
set
  search_path = '' as $$
begin
    if current_user not in('service_role') then
        raise exception 'You do not have permission to transfer account ownership';
    end if;

    -- verify the user is already a member of the account
    if not exists(
        select
            1
        from
            public.accounts_memberships
        where
            target_account_id = account_id
            and user_id = new_owner_id) then
        raise exception 'The new owner must be a member of the account';
    end if;

    -- update the primary owner of the account
    update
        public.accounts
    set
        primary_owner_user_id = new_owner_id
    where
        id = target_account_id
        and is_personal_account = false;

    -- update membership assigning it the hierarchy role
    update
        public.accounts_memberships
    set
        account_role =(
            public.get_upper_system_role())
    where
        target_account_id = account_id
        and user_id = new_owner_id
        and account_role <>(
            public.get_upper_system_role());

end;

$$ language plpgsql;

grant
execute on function public.transfer_team_account_ownership (uuid, uuid) to service_role;

-- Function "public.is_account_owner"
-- Function to check if a user is the primary owner of an account
create
or replace function public.is_account_owner (account_id uuid) returns boolean
set
  search_path = '' as $$
    select
        exists(
            select
                1
            from
                public.accounts
            where
                id = is_account_owner.account_id
                and primary_owner_user_id = auth.uid());
$$ language sql;

grant
execute on function public.is_account_owner (uuid) to authenticated,
service_role;

-- Function "kit.protect_account_fields"
-- Function to protect account fields from being updated
create
or replace function kit.protect_account_fields () returns trigger as $$
begin
    if current_user in('authenticated', 'anon') then
	-- "is distinct from" treats NULL as a comparable value, so transitions
	-- between NULL and a value (email is nullable) are caught as well
	if new.id is distinct from old.id
	    or new.is_personal_account is distinct from old.is_personal_account
	    or new.primary_owner_user_id is distinct from old.primary_owner_user_id
	    or new.email is distinct from old.email then
            raise exception 'You do not have permission to update this field';

        end if;

    end if;

    return NEW;

end
$$ language plpgsql
set
  search_path = '';

-- trigger to protect account fields
create trigger protect_account_fields before
update on public.accounts for each row
execute function kit.protect_account_fields ();

-- Function "public.get_upper_system_role"
-- Function to get the highest system role for an account
create
or replace function public.get_upper_system_role () returns varchar
set
  search_path = '' as $$
declare
    role varchar(50);
begin
    select name from public.roles
      where hierarchy_level = 1 into role;

    return role;
end;
$$ language plpgsql;

grant
execute on function public.get_upper_system_role () to service_role;

-- create a trigger to update the account email when the primary owner email is updated
create
or replace function kit.handle_update_user_email () returns trigger language plpgsql security definer
set
  search_path = '' as $$
begin
    update
        public.accounts
    set
        email = new.email
    where
        primary_owner_user_id = new.id
        and is_personal_account = true;

    return new;

end;

$$;

-- trigger the function every time a user email is updated only if the user is the primary owner of the account and
-- the account is personal account
create trigger "on_auth_user_updated"
after
update of email on auth.users for each row
execute procedure kit.handle_update_user_email ();


/**
 * -------------------------------------------------------
 * Section: Slugify
 * We create the schema for the slugify functions. Slugify functions are used to create slugs from strings.
 * We use this for ensure unique slugs for accounts.
 * -------------------------------------------------------
 */
-- Create a function to slugify a string
-- useful for turning an account name into a unique slug
create
or replace function kit.slugify ("value" text) returns text as $$
    -- removes accents (diacritic signs) from a given string --
    with "unaccented" as(
        select
            kit.unaccent("value") as "value"
),
-- lowercases the string
"lowercase" as(
    select
        lower("value") as "value"
    from
        "unaccented"
),
-- remove single and double quotes
"removed_quotes" as(
    select
	regexp_replace("value", '[''"]+', '',
	    'gi') as "value"
    from
        "lowercase"
),
-- replaces anything that's not a letter, number, hyphen('-'), or underscore('_') with a hyphen('-')
"hyphenated" as(
    select
	regexp_replace("value", '[^a-z0-9\\-_]+', '-',
	    'gi') as "value"
    from
        "removed_quotes"
),
-- trims hyphens('-') if they exist on the head or tail of
--   the string
"trimmed" as(
    select
	regexp_replace(regexp_replace("value", '\-+$',
	    ''), '^\-', '') as "value" from "hyphenated"
)
        select
            "value"
        from
            "trimmed";
$$ language SQL strict immutable
set
  search_path to '';

grant
execute on function kit.slugify (text) to service_role,
authenticated;


-- Function "kit.set_slug_from_account_name"
-- Set the slug from the account name and increment if the slug exists
create
or replace function kit.set_slug_from_account_name () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
    tmp_slug varchar;
    increment integer;
    tmp_row_count integer;
begin
    tmp_row_count = 1;

    increment = 0;

    while tmp_row_count > 0 loop
        if increment > 0 then
            tmp_slug = kit.slugify(new.name || ' ' || increment::varchar);

        else
            tmp_slug = kit.slugify(new.name);

        end if;

        select count(1)
        from public.accounts
        where slug = tmp_slug
          and id <> new.id
        into tmp_row_count;

        increment = increment +1;

    end loop;

    new.slug := tmp_slug;

    return NEW;

end
$$;

-- Create a trigger to set the slug from the account name
create trigger "set_slug_from_account_name" before insert on public.accounts for each row when (
  NEW.name is not null
  and NEW.slug is null
  and NEW.is_personal_account = false
)
execute procedure kit.set_slug_from_account_name ();

-- Create a trigger when a name is updated to update the slug
create trigger "update_slug_from_account_name" before
update on public.accounts for each row when (
  NEW.name is not null
  and NEW.name <> OLD.name
  and NEW.is_personal_account = false
)
execute procedure kit.set_slug_from_account_name ();

-- Function "kit.setup_new_user"
-- Setup a new user account after user creation
create
or replace function kit.setup_new_user () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
    user_name text;
    picture_url text;
begin
    if new.raw_user_meta_data ->> 'name' is not null then
        user_name := new.raw_user_meta_data ->> 'name';

    end if;

    if user_name is null and new.email is not null then
        user_name := split_part(new.email, '@', 1);

    end if;

    if user_name is null then
        user_name := '';

    end if;

    if new.raw_user_meta_data ->> 'avatar_url' is not null then
        picture_url := new.raw_user_meta_data ->> 'avatar_url';
    else
        picture_url := null;
    end if;

    insert into public.accounts(
        id,
        primary_owner_user_id,
        name,
        is_personal_account,
        picture_url,
        email)
    values (
        new.id,
        new.id,
        user_name,
        true,
        picture_url,
        new.email);

    return new;

end;

$$;

-- trigger the function every time a user is created
create trigger on_auth_user_created
after insert on auth.users for each row
execute procedure kit.setup_new_user ();

/**
 * -------------------------------------------------------
 * Section: Functions
 * We create the schema for the functions
 * -------------------------------------------------------
 */
-- Function "public.create_team_account"
-- Create a team account with membership in a single transaction
-- Called by service_role only (Policies API enforced in application layer)
create
or replace function public.create_team_account (
    account_name text,
    user_id uuid,
    account_slug text default null
) returns public.accounts
language plpgsql
security definer
set
  search_path = '' as $$
declare
    new_account public.accounts;
    owner_role varchar(50);
begin
    if (not public.is_set('enable_team_accounts')) then
        raise exception 'Team accounts are not enabled';
    end if;

    -- Get the highest system role for the owner
    select public.get_upper_system_role() into owner_role;

    -- Insert the new team account
    -- The slug will be auto-generated from name by the "set_slug_from_account_name"
    -- trigger if account_slug is null
    insert into public.accounts(
        name,
        slug,
        is_personal_account,
        primary_owner_user_id)
    values (
        account_name,
        account_slug,
        false,
        user_id)
    returning * into new_account;

    -- Create membership for the owner (atomic with account creation)
    insert into public.accounts_memberships(
        account_id,
        user_id,
        account_role)
    values (
        new_account.id,
        user_id,
        coalesce(owner_role, 'owner'));

    return new_account;

end;

$$;

grant
execute on function public.create_team_account (text, uuid, text) to service_role;

-- RLS(public.accounts)
-- The primary owner can delete team accounts. Personal accounts are excluded:
-- they are deleted through the admin flow (auth.admin.deleteUser cascades to
-- the account row), never directly by their owner.
create policy delete_team_account
    on public.accounts
    for delete
    to authenticated
    using (
        auth.uid() = primary_owner_user_id
        and is_personal_account = false
    );

-- Functions "public.get_account_members"
-- Function to get the members of an account by the account slug
create
or replace function public.get_account_members (account_slug text) returns table (
  id uuid,
  user_id uuid,
  account_id uuid,
  role varchar(50),
  role_hierarchy_level int,
  primary_owner_user_id uuid,
  name varchar,
  email varchar,
  picture_url varchar,
  created_at timestamptz,
  updated_at timestamptz
) language plpgsql
set
  search_path = '' as $$
begin
    return QUERY
    select
        acc.id,
        am.user_id,
        am.account_id,
        am.account_role,
        r.hierarchy_level,
        a.primary_owner_user_id,
        acc.name,
        acc.email,
        acc.picture_url,
        am.created_at,
        am.updated_at
    from
        public.accounts_memberships am
        join public.accounts a on a.id = am.account_id
        join public.accounts acc on acc.id = am.user_id
        join public.roles r on r.name = am.account_role
    where
        a.slug = account_slug;

end;

$$;

grant
execute on function public.get_account_members (text) to authenticated,
service_role;

-- -----------------------------------------------------------------------------
-- Source: apps/web/supabase/schemas/04-roles.sql
-- -----------------------------------------------------------------------------
/*
 * -------------------------------------------------------
 * Section: Roles
 * We create the schema for the roles. Roles are the roles for an account. For example, an account might have the roles 'owner', 'admin', and 'member'.
 * -------------------------------------------------------
 */

-- Roles Table
create table if not exists
  public.roles (
    name varchar(50) not null,
    hierarchy_level int not null check (hierarchy_level > 0),
    primary key (name),
    unique (hierarchy_level)
  );

-- Revoke all on roles table from authenticated and service_role
revoke all on public.roles
from
  authenticated,
  service_role;

-- Open up access to roles table for authenticated users and service_role
grant
select
on table public.roles to authenticated,
service_role;

-- RLS
alter table public.roles enable row level security;

-- -----------------------------------------------------------------------------
-- Source: apps/web/supabase/schemas/05-memberships.sql
-- -----------------------------------------------------------------------------
/*
 * -------------------------------------------------------
 * Section: Memberships
 * We create the schema for the memberships. Memberships are the memberships for an account. For example, a user might be a member of an account with the role 'owner'.
 * -------------------------------------------------------
 */

-- Account Memberships table
create table if not exists
  public.accounts_memberships (
    user_id uuid references auth.users on delete cascade not null,
    account_id uuid references public.accounts (id) on delete cascade not null,
    account_role varchar(50) references public.roles (name) not null,
    created_at timestamptz default current_timestamp not null,
    updated_at timestamptz default current_timestamp not null,
    created_by uuid references auth.users,
    updated_by uuid references auth.users,
    primary key (user_id, account_id)
  );

comment on table public.accounts_memberships is 'The memberships for an account';

comment on column public.accounts_memberships.account_id is 'The account the membership is for';

comment on column public.accounts_memberships.account_role is 'The role for the membership';

-- Revoke all on accounts_memberships table from authenticated and service_role
revoke all on public.accounts_memberships
from
  authenticated,
  service_role;

-- Open up access to accounts_memberships table for authenticated users and service_role
-- authenticated has no INSERT: memberships are only created by
-- accept_invitation (run with the service_role client) and by
-- create_team_account (SECURITY DEFINER), so the role never inserts rows
-- directly.
grant
select
,
  delete on table public.accounts_memberships to authenticated;

grant
select
,
  insert,
  delete on table public.accounts_memberships to service_role;

-- service_role retains full-table UPDATE
grant
update on table public.accounts_memberships to service_role;

-- authenticated may only UPDATE the membership role. The identity columns
-- (user_id, account_id) must never change: they define the tenancy link, so
-- allowing them to change would let a member re-parent a membership row into
-- another account. Enforced by Postgres up front, on top of the
-- kit.prevent_memberships_update trigger.
grant
update (account_role) on table public.accounts_memberships to authenticated;

-- Indexes on the accounts_memberships table
create index ix_accounts_memberships_account_id on public.accounts_memberships (account_id);

create index ix_accounts_memberships_user_id on public.accounts_memberships (user_id);

create index ix_accounts_memberships_account_role on public.accounts_memberships (account_role);

-- Triggers for accounts_memberships table
create trigger accounts_memberships_set_timestamps
before insert or update on public.accounts_memberships
for each row execute function public.trigger_set_timestamps();

create trigger accounts_memberships_set_user_tracking
before insert or update on public.accounts_memberships
for each row execute function public.trigger_set_user_tracking();

-- Enable RLS on the accounts_memberships table
alter table public.accounts_memberships enable row level security;

-- Function "kit.prevent_account_owner_membership_delete"
-- Trigger to prevent a primary owner from being removed from an account
create
or replace function kit.prevent_account_owner_membership_delete () returns trigger
set
  search_path = '' as $$
begin
    if exists(
        select
            1
        from
            public.accounts
        where
            id = old.account_id
            and primary_owner_user_id = old.user_id) then
    raise exception 'The primary account owner cannot be removed from the account membership list';

end if;

    return old;

end;

$$ language plpgsql;

create
or replace trigger prevent_account_owner_membership_delete_check before delete on public.accounts_memberships for each row
execute function kit.prevent_account_owner_membership_delete ();

-- Function "kit.prevent_memberships_update"
-- Trigger to prevent updates to account memberships with the exception of the account_role
create
or replace function kit.prevent_memberships_update () returns trigger
set
  search_path = '' as $$
begin
    if new.account_role <> old.account_role then
        return new;
    end if;

    raise exception 'Only the account_role can be updated';

end; $$ language plpgsql;

create
or replace trigger prevent_memberships_update_check before
update on public.accounts_memberships for each row
execute function kit.prevent_memberships_update ();

-- Function "public.has_role_on_account"
-- Function to check if a user has a role on an account
create
or replace function public.has_role_on_account (
  account_id uuid,
  account_role varchar(50) default null
) returns boolean language sql security definer
set
  search_path = '' as $$
    select
        exists(
            select
                1
            from
                public.accounts_memberships membership
            where
                membership.user_id = (select auth.uid())
                and membership.account_id = has_role_on_account.account_id
                and((membership.account_role = has_role_on_account.account_role
                    or has_role_on_account.account_role is null)));
$$;

grant
execute on function public.has_role_on_account (uuid, varchar) to authenticated;

-- Function "public.is_team_member"
-- Check if a user is a team member of an account or not
create
or replace function public.is_team_member (account_id uuid, user_id uuid) returns boolean language sql security definer
set
  search_path = '' as $$
    select
        exists(
            select
                1
            from
                public.accounts_memberships membership
            where
                public.has_role_on_account(account_id)
                and membership.user_id = is_team_member.user_id
                and membership.account_id = is_team_member.account_id);
$$;

grant
execute on function public.is_team_member (uuid, uuid) to authenticated,
service_role;

-- RLS
-- SELECT(roles)
-- authenticated users can query roles
create policy roles_read on public.roles for
select
  to authenticated using (
    true
  );

-- Function "public.can_action_account_member"
-- Check if a user can perform management actions on an account member
create
or replace function public.can_action_account_member (target_team_account_id uuid, target_user_id uuid) returns boolean
set
  search_path = '' as $$
declare
    permission_granted boolean;
    target_user_hierarchy_level int;
    current_user_hierarchy_level int;
    is_account_owner boolean;
    target_user_role varchar(50);
begin
    if target_user_id = auth.uid() then
      raise exception 'You cannot update your own account membership with this function';
    end if;

    -- an account owner can action any member of the account
    if public.is_account_owner(target_team_account_id) then
      return true;
    end if;

     -- check the target user is the primary owner of the account
    select
        exists (
            select
                1
            from
                public.accounts
            where
                id = target_team_account_id
                and primary_owner_user_id = target_user_id) into is_account_owner;

    if is_account_owner then
        raise exception 'The primary account owner cannot be actioned';
    end if;

    -- validate the auth user has the required permission on the account
    -- to manage members of the account
    select
 public.has_permission(auth.uid(), target_team_account_id,
     'members.manage'::public.app_permissions) into
     permission_granted;

    -- if the user does not have the required permission, raise an exception
    if not permission_granted then
      raise exception 'You do not have permission to action a member from this account';
    end if;

    -- get the role of the target user
    select
        am.account_role,
        r.hierarchy_level
    from
        public.accounts_memberships as am
    join
        public.roles as r on am.account_role = r.name
    where
        am.account_id = target_team_account_id
        and am.user_id = target_user_id
    into target_user_role, target_user_hierarchy_level;

    -- get the hierarchy level of the current user
    select
        r.hierarchy_level into current_user_hierarchy_level
    from
        public.roles as r
    join
        public.accounts_memberships as am on r.name = am.account_role
    where
        am.account_id = target_team_account_id
        and am.user_id = auth.uid();

    if target_user_role is null then
      raise exception 'The target user does not have a role on the account';
    end if;

    if current_user_hierarchy_level is null then
      raise exception 'The current user does not have a role on the account';
    end if;

    -- check the current user has a higher role than the target user
    if current_user_hierarchy_level >= target_user_hierarchy_level then
      raise exception 'You do not have permission to action a member from this account';
    end if;

    return true;

end;

$$ language plpgsql;

grant
execute on function public.can_action_account_member (uuid, uuid) to authenticated,
service_role;

-- RLS
-- SELECT(accounts_memberships):
-- Users can read their team members account memberships
create policy accounts_memberships_read on public.accounts_memberships for
select
  to authenticated using (
    (
      (
        select
          auth.uid ()
      ) = user_id
    )
    or is_team_member (account_id, user_id)
  );

create
or replace function public.is_account_team_member (target_account_id uuid) returns boolean
set
  search_path = '' as $$
    select exists(
        select 1
        from public.accounts_memberships as membership
        where public.is_team_member (membership.account_id, target_account_id)
    );
$$ language sql;

grant
execute on function public.is_account_team_member (uuid) to authenticated,
service_role;

-- RLS on the accounts table
-- SELECT(accounts):
-- Users can read the an account if
--   - they are the primary owner of the account
--   - they have a role on the account
--   - they are reading an account of the same team
create policy accounts_read on public.accounts for
select
  to authenticated using (
    (
      (
        select
          auth.uid ()
      ) = primary_owner_user_id
    )
    or public.has_role_on_account (id)
    or public.is_account_team_member (id)
  );

-- DELETE(accounts_memberships):
-- Users with the required role can remove members from an account or remove their own
create policy accounts_memberships_delete on public.accounts_memberships for delete to authenticated using (
  (
    user_id = (
      select
        auth.uid ()
    )
  )
  or public.can_action_account_member (account_id, user_id)
);

-- -----------------------------------------------------------------------------
-- Source: apps/web/supabase/schemas/06-roles-permissions.sql
-- -----------------------------------------------------------------------------
/*
 * -------------------------------------------------------
 * Section: Role Permissions
 * We create the schema for the role permissions. Role permissions are the permissions for a role.
 * For example, the 'owner' role might have the 'roles.manage' permission.
 * -------------------------------------------------------
 
 */
-- Create table for roles permissions
create table if not exists
  public.role_permissions (
    id bigint generated by default as identity primary key,
    role varchar(50) references public.roles (name) not null,
    permission public.app_permissions not null,
    unique (role, permission)
  );

comment on table public.role_permissions is 'The permissions for a role';

comment on column public.role_permissions.role is 'The role the permission is for';

comment on column public.role_permissions.permission is 'The permission for the role';

-- Indexes on the role_permissions table
create index ix_role_permissions_role on public.role_permissions (role);

-- Revoke all on role_permissions table from authenticated and service_role
revoke all on public.role_permissions
from
  authenticated,
  service_role;

-- Open up access to role_permissions table for authenticated users and service_role
grant
select
,
  insert,
update,
delete on table public.role_permissions to service_role;

-- Authenticated users can read role permissions
grant
select
  on table public.role_permissions to authenticated;

-- Function "public.has_permission"
-- Create a function to check if a user has a permission
create
or replace function public.has_permission (
  user_id uuid,
  account_id uuid,
  permission_name public.app_permissions
) returns boolean
set
  search_path = '' as $$
begin
    return exists(
        select
            1
        from
            public.accounts_memberships
	    join public.role_permissions on
		accounts_memberships.account_role =
		role_permissions.role
        where
            accounts_memberships.user_id = has_permission.user_id
            and accounts_memberships.account_id = has_permission.account_id
            and role_permissions.permission = has_permission.permission_name);

end;

$$ language plpgsql;

grant
execute on function public.has_permission (uuid, uuid, public.app_permissions) to authenticated,
service_role;

-- Function "public.has_more_elevated_role"
-- Check if a user has a more elevated role than the target role
create
or replace function public.has_more_elevated_role (
  target_user_id uuid,
  target_account_id uuid,
  role_name varchar
) returns boolean
set
  search_path = '' as $$
declare
    declare is_primary_owner boolean;
    user_role_hierarchy_level int;
    target_role_hierarchy_level int;
begin
    -- Check if the user is the primary owner of the account
    select
        exists (
            select
                1
            from
                public.accounts
            where
                id = target_account_id
                and primary_owner_user_id = target_user_id) into is_primary_owner;

    -- If the user is the primary owner, they have the highest role and can
    --   perform any action
    if is_primary_owner then
        return true;
    end if;

    -- Get the hierarchy level of the user's role within the account
    select
        hierarchy_level into user_role_hierarchy_level
    from
        public.roles
    where
        name =(
            select
                account_role
            from
                public.accounts_memberships
            where
                account_id = target_account_id
                and target_user_id = user_id);

    if user_role_hierarchy_level is null then
        return false;
    end if;

    -- Get the hierarchy level of the target role
    select
        hierarchy_level into target_role_hierarchy_level
    from
        public.roles
    where
        name = role_name;

    -- If the target role does not exist, the user cannot perform the action
    if target_role_hierarchy_level is null then
        return false;
    end if;

    -- If the user's role is higher than the target role, they can perform
    --   the action
    return user_role_hierarchy_level < target_role_hierarchy_level;

end;

$$ language plpgsql;

grant
execute on function public.has_more_elevated_role (uuid, uuid, varchar) to authenticated,
service_role;

-- Function "public.has_same_role_hierarchy_level"
-- Check if a user has the same role hierarchy level as the target role
create
or replace function public.has_same_role_hierarchy_level (
  target_user_id uuid,
  target_account_id uuid,
  role_name varchar
) returns boolean
set
  search_path = '' as $$
declare
    is_primary_owner boolean;
    user_role_hierarchy_level int;
    target_role_hierarchy_level int;
begin
    -- Check if the user is the primary owner of the account
    select
        exists (
            select
                1
            from
                public.accounts
            where
                id = target_account_id
                and primary_owner_user_id = target_user_id) into is_primary_owner;

    -- If the user is the primary owner, they have the highest role and can perform any action
    if is_primary_owner then
        return true;
    end if;

    -- Get the hierarchy level of the user's role within the account
    select
        hierarchy_level into user_role_hierarchy_level
    from
        public.roles
    where
        name =(
            select
                account_role
            from
                public.accounts_memberships
            where
                account_id = target_account_id
                and target_user_id = user_id);

    -- If the user does not have a role in the account, they cannot perform the action
    if user_role_hierarchy_level is null then
        return false;
    end if;

    -- Get the hierarchy level of the target role
    select
        hierarchy_level into target_role_hierarchy_level
    from
        public.roles
    where
        name = role_name;

    -- If the target role does not exist, the user cannot perform the action
    if target_role_hierarchy_level is null then
        return false;
    end if;

   -- check the user's role hierarchy level is the same as the target role
    return user_role_hierarchy_level = target_role_hierarchy_level;

end;

$$ language plpgsql;

grant
execute on function public.has_same_role_hierarchy_level (uuid, uuid, varchar) to authenticated,
service_role;

-- Enable RLS on the role_permissions table
alter table public.role_permissions enable row level security;

-- RLS on the role_permissions table
-- SELECT(role_permissions):
-- Authenticated Users can read global permissions
create policy role_permissions_read on public.role_permissions for
select
  to authenticated using (true);

-- -----------------------------------------------------------------------------
-- Source: apps/web/supabase/schemas/07-invitations.sql
-- -----------------------------------------------------------------------------
/*
 * -------------------------------------------------------
 * Section: Invitations
 * We create the schema for the invitations. Invitations are the invitations for an account sent to a user to join the account.
 * -------------------------------------------------------
 */

create table if not exists
  public.invitations (
    id serial primary key,
    email varchar(255) not null check (length(trim(email)) > 3),
    account_id uuid references public.accounts (id) on delete cascade not null,
    invited_by uuid references auth.users on delete cascade not null,
    role varchar(50) references public.roles (name) not null,
    invite_token varchar(255) unique not null,
    created_at timestamptz default current_timestamp not null,
    updated_at timestamptz default current_timestamp not null,
    sent_at timestamptz,
    last_send_attempt_at timestamptz,
    resend_count integer default 0 not null check (resend_count >= 0),
    expires_at timestamptz default current_timestamp + interval '7 days' not null,
    check (sent_at is null or sent_at >= created_at),
    check (
      last_send_attempt_at is null
      or last_send_attempt_at >= created_at
    ),
    constraint invitations_expires_after_created check (expires_at > created_at),
    constraint invitations_email_format check (
      email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    ),
    unique (email, account_id)
  );

comment on table public.invitations is 'The invitations for an account';

comment on column public.invitations.account_id is 'The account the invitation is for';

comment on column public.invitations.invited_by is 'The user who invited the user';

comment on column public.invitations.role is 'The role for the invitation';

comment on column public.invitations.invite_token is 'The token for the invitation';

comment on column public.invitations.sent_at is 'The time the invitation email was successfully sent';

comment on column public.invitations.last_send_attempt_at is 'The most recent invitation email send attempt, used for resend rate limiting';

comment on column public.invitations.resend_count is 'The number of resend attempts made after the initial invitation email';

comment on column public.invitations.expires_at is 'The expiry date for the invitation';

comment on column public.invitations.email is 'The email of the user being invited';

-- Indexes on the invitations table
create index ix_invitations_account_id on public.invitations (account_id);

create index ix_invitations_invited_by on public.invitations (invited_by);

create index ix_invitations_account_expires_at on public.invitations (account_id, expires_at);

create index ix_invitations_unsent on public.invitations (account_id, created_at)
where
  sent_at is null;

create index ix_invitations_resend_rate_limit on public.invitations (id, last_send_attempt_at, resend_count);

-- Triggers for invitations table
create trigger invitations_set_timestamps
before insert or update on public.invitations
for each row execute function public.trigger_set_timestamps();

-- Revoke all on invitations table from authenticated and service_role
revoke all on public.invitations
from
  authenticated,
  service_role;

-- service_role retains full access (used by the admin client for the accept route)
grant
select
,
  insert,
update,
delete on table public.invitations to service_role;

-- Authenticated users may update/delete (gated by RLS) but may NOT:
--   * INSERT: invitations are only created by add_invitations_to_account,
--     which runs with the service_role client (there is no INSERT policy);
--   * read the invite_token column: it is a credential and must not be
--     exposed via the data API to members of the inviting account. The accept
--     route reads it with the service_role (admin) client. This is
--     defense-in-depth on top of the signed-link check (see
--     @pymekit/team-accounts/invitation-signature).
grant delete on table public.invitations to authenticated;

-- authenticated may only UPDATE the invitation role and expiry. Identity and
-- delivery columns (id, email, account_id, invited_by, invite_token,
-- created_at, sent_at, last_send_attempt_at, resend_count) are never
-- user-updatable — the resend flow writes them with the service_role. Enforced
-- by Postgres up front, on top of the kit.protect_invitation_delivery_fields
-- trigger.
grant update (role, expires_at) on table public.invitations to authenticated;

grant
select
  (
    id,
    email,
    account_id,
    invited_by,
    role,
    created_at,
    updated_at,
    sent_at,
    last_send_attempt_at,
    resend_count,
    expires_at
  ) on table public.invitations to authenticated;

-- Enable RLS on the invitations table
alter table public.invitations enable row level security;

-- Function "kit.check_team_account"
-- Function to check if the account is a team account or not when inserting or updating an invitation
create
or replace function kit.check_team_account () returns trigger
set
  search_path = '' as $$
begin
    if(
        select
            is_personal_account
        from
            public.accounts
        where
            id = new.account_id) then
        raise exception 'Account must be an team account';

    end if;

    return NEW;

end;

$$ language plpgsql;

create trigger only_team_accounts_check before insert
or
update on public.invitations for each row
execute procedure kit.check_team_account ();

create
or replace function kit.protect_invitation_delivery_fields () returns trigger
set
  search_path = '' as $$
begin
    if current_user in('authenticated', 'anon') then
        if new.id is distinct from old.id
            or new.email is distinct from old.email
            or new.account_id is distinct from old.account_id
            or new.invited_by is distinct from old.invited_by
            or new.invite_token is distinct from old.invite_token
            or new.created_at is distinct from old.created_at
            or new.sent_at is distinct from old.sent_at
            or new.last_send_attempt_at is distinct from old.last_send_attempt_at
            or new.resend_count is distinct from old.resend_count then
            raise exception 'You do not have permission to update invitation delivery fields';
        end if;
    end if;

    return new;
end;
$$ language plpgsql;

create trigger protect_invitation_delivery_fields before
update on public.invitations for each row
execute function kit.protect_invitation_delivery_fields ();

-- RLS on the invitations table
-- SELECT(invitations):
-- Users can read invitations to users of an account they are a member of
create policy invitations_read_self on public.invitations for
select
  to authenticated using (public.has_role_on_account (account_id));

-- INSERT(invitations):
-- Invitations are created through server actions using admin client.
-- Permission and role hierarchy checks are enforced in the server action.
-- No RLS policy needed for INSERT.

-- UPDATE(invitations):
-- Users can update invitations to users of an account they are a member of and have the 'invites.manage' permission AND
-- the target role is not higher than the user's role
create policy invitations_update on public.invitations
for update
  to authenticated using (
    public.has_permission (
      (
        select
          auth.uid ()
      ),
      account_id,
      'invites.manage'::public.app_permissions
    )
    and public.has_more_elevated_role (
      (
        select
          auth.uid ()
      ),
      account_id,
      role
    )
  )
with
  check (
    public.has_permission (
      (
        select
          auth.uid ()
      ),
      account_id,
      'invites.manage'::public.app_permissions
    )
    and public.has_more_elevated_role (
      (
        select
          auth.uid ()
      ),
      account_id,
      role
    )
  );

-- DELETE(public.invitations):
-- Users can delete invitations to users of an account they are a member of and have the 'invites.manage' permission
create policy invitations_delete on public.invitations for delete to authenticated using (
  has_role_on_account (account_id)
  and public.has_permission (
    (
      select
        auth.uid ()
    ),
    account_id,
    'invites.manage'::public.app_permissions
  )
);

-- Functions "public.accept_invitation"
-- Function to accept an invitation to an account
create
or replace function accept_invitation (token text, user_id uuid) returns uuid
set
  search_path = '' as $$
declare
    target_account_id uuid;
    target_role varchar(50);
begin
    select
        account_id,
        role into target_account_id,
        target_role
    from
        public.invitations
    where
        invite_token = token
        and expires_at > now();

    if not found then
        raise exception 'Invalid or expired invitation token';
    end if;

    insert into public.accounts_memberships(
        user_id,
        account_id,
        account_role)
    values (
        accept_invitation.user_id,
        target_account_id,
        target_role);

    delete from public.invitations
    where invite_token = token;

    return target_account_id;
end;

$$ language plpgsql;

grant
execute on function accept_invitation (text, uuid) to service_role;

-- Function "public.create_invitation"
-- create an invitation to an account
create
or replace function public.create_invitation (account_id uuid, email text, role varchar(50)) returns public.invitations
set
  search_path = '' as $$
declare
    new_invitation public.invitations;
    invite_token text;
begin
    invite_token := extensions.uuid_generate_v4();

    insert into public.invitations(
        email,
        account_id,
        invited_by,
        role,
        invite_token)
    values (
        email,
        account_id,
        auth.uid(),
        role,
        invite_token)
returning
    * into new_invitation;

    return new_invitation;

end;

$$ language plpgsql;


-- Function "public.get_account_invitations"
-- List the account invitations by the account slug
create
or replace function public.get_account_invitations (account_slug text) returns table (
  id integer,
  email varchar(255),
  account_id uuid,
  invited_by uuid,
  role varchar(50),
  created_at timestamptz,
  updated_at timestamptz,
  sent_at timestamptz,
  last_send_attempt_at timestamptz,
  resend_count integer,
  expires_at timestamptz,
  inviter_name varchar,
  inviter_email varchar
)
set
  search_path = '' as $$
begin
    return query
    select
        invitation.id,
        invitation.email,
        invitation.account_id,
        invitation.invited_by,
        invitation.role,
        invitation.created_at,
        invitation.updated_at,
        invitation.sent_at,
        invitation.last_send_attempt_at,
        invitation.resend_count,
        invitation.expires_at,
        inviter.name,
        inviter.email
    from
        public.invitations as invitation
        join public.accounts as account on invitation.account_id = account.id
        -- the inviter's personal account shares its id with the auth user
        left join public.accounts as inviter on invitation.invited_by = inviter.id
    where
        account.slug = account_slug;

end;

$$ language plpgsql;

grant
execute on function public.get_account_invitations (text) to authenticated,
service_role;

-- Function "public.add_invitations_to_account"
-- Add invitations to an account.
-- Enforces two anti-abuse limits atomically (a per-account advisory lock
-- serializes concurrent batches so the counts cannot be raced):
--   * a quota on outstanding (non-expired) invitations, and
--   * a rate limit on invitations created within a rolling window.
-- Limits are hardcoded here (plpgsql cannot import TS); keep them in sync with
-- MAX_PENDING_INVITATIONS_PER_ACCOUNT / INVITATION_CREATE_RATE_LIMIT /
-- INVITATION_CREATE_RATE_WINDOW_MINUTES in invite-members.schema.ts.
create
or replace function public.add_invitations_to_account (
  account_slug text,
  invitations public.invitation[],
  invited_by uuid
) returns public.invitations[]
set
  search_path = '' as $$
declare
    new_invitation public.invitations;
    all_invitations public.invitations[] := array[]::public.invitations[];
    invite_token text;
    email text;
    role varchar(50);
    target_account_id uuid;
    batch_size integer := coalesce(array_length(invitations, 1), 0);
    pending_count integer;
    recent_count integer;
begin
    select
        id into target_account_id
    from
        public.accounts
    where
        slug = account_slug;

    if target_account_id is null then
        raise exception 'Account not found';
    end if;

    -- Serialize concurrent invitation batches for this account so the limit
    -- checks below are race-free within the transaction.
    perform
        pg_advisory_xact_lock(hashtext('invitations:' || target_account_id::text));

    -- Quota: cap the number of outstanding (non-expired) invitations.
    select
        count(*) into pending_count
    from
        public.invitations
    where
        account_id = target_account_id
        and expires_at > now();

    if pending_count + batch_size > 50 then
        raise exception 'Account has reached the maximum number of pending invitations';
    end if;

    -- Rate limit: cap the number of invitations created per rolling 60-minute
    -- window.
    select
        count(*) into recent_count
    from
        public.invitations
    where
        account_id = target_account_id
        and created_at > now() - interval '60 minutes';

    if recent_count + batch_size > 20 then
        raise exception 'Invitation rate limit reached. Please try again later.';
    end if;

    FOREACH email,
    role in array invitations loop
        invite_token := extensions.uuid_generate_v4();

        insert into public.invitations(
            email,
            account_id,
            invited_by,
            role,
            invite_token)
        values (
            email,
            target_account_id,
            invited_by,
            role,
            invite_token)
    returning
        * into new_invitation;

        all_invitations := array_append(all_invitations, new_invitation);

    end loop;

    return all_invitations;

end;

$$ language plpgsql;

grant
execute on function public.add_invitations_to_account (text, public.invitation[], uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Source: apps/web/supabase/schemas/08-billing-customers.sql
-- -----------------------------------------------------------------------------
/*
 * -------------------------------------------------------
 * Section: Billing Customers
 * We create the schema for the billing customers. Billing customers are the customers for an account in the billing provider. For example, a user might have a customer in the billing provider with the customer ID 'cus_123'.
 * -------------------------------------------------------

 */
-- Billing Customers table
create table if not exists
  public.billing_customers (
    account_id uuid references public.accounts (id) on delete cascade not null,
    id serial primary key,
    email text check (email is null or length(trim(email)) > 3),
    provider public.billing_provider not null,
    customer_id text not null,
    unique (provider, customer_id),
    unique (account_id, customer_id, provider)
  );

comment on table public.billing_customers is 'The billing customers for an account';

comment on column public.billing_customers.account_id is 'The account the billing customer is for';

comment on column public.billing_customers.provider is 'The provider of the billing customer';

comment on column public.billing_customers.customer_id is 'The customer ID for the billing customer';

comment on column public.billing_customers.email is 'The email of the billing customer';

-- Indexes on the billing_customers table
create index ix_billing_customers_account_id on public.billing_customers (account_id);

create index ix_billing_customers_provider_customer_id on public.billing_customers (provider, customer_id);

-- Revoke all on billing_customers table from authenticated and service_role
revoke all on public.billing_customers
from
  authenticated,
  service_role;

-- Open up relevant access to billing_customers table for authenticated users and service_role
grant
select
,
  insert,
update,
delete on table public.billing_customers to service_role;

-- Open up access to billing_customers table for authenticated users
grant
select
  on table public.billing_customers to authenticated,
  service_role;

-- Enable RLS on billing_customers table
alter table public.billing_customers enable row level security;

-- RLS on the billing_customers table
-- SELECT(billing_customers):
-- Users can read account subscriptions on an account they are a member of
create policy billing_customers_read_self on public.billing_customers for
select
  to authenticated using (
    account_id = (
      select
        auth.uid ()
    )
    or has_role_on_account (account_id)
  );

-- -----------------------------------------------------------------------------
-- Source: apps/web/supabase/schemas/09-subscriptions.sql
-- -----------------------------------------------------------------------------
/*
 * -------------------------------------------------------
 * Section: Subscriptions
 * We create the schema for the subscriptions. Subscriptions are the subscriptions for an account to a product. For example, a user might have a subscription to a product with the status 'active'.
 * -------------------------------------------------------

 */
-- Subscriptions table
create table if not exists
  public.subscriptions (
    id text not null primary key,
    account_id uuid references public.accounts (id) on delete cascade not null,
    billing_customer_id int references public.billing_customers on delete cascade not null,
    status public.subscription_status not null,
    active bool not null,
    billing_provider public.billing_provider not null,
    cancel_at_period_end bool not null,
    currency varchar(3) not null check (currency ~ '^[A-Za-z]{3}$'),
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp,
    period_starts_at timestamptz not null,
    period_ends_at timestamptz not null check (period_ends_at > period_starts_at),
    trial_starts_at timestamptz,
    trial_ends_at timestamptz,
    check (
      trial_starts_at is null
      or trial_ends_at is null
      or trial_ends_at >= trial_starts_at
    )
  );

comment on table public.subscriptions is 'The subscriptions for an account';

comment on column public.subscriptions.account_id is 'The account the subscription is for';

comment on column public.subscriptions.billing_provider is 'The provider of the subscription';

comment on column public.subscriptions.cancel_at_period_end is 'Whether the subscription will be canceled at the end of the period';

comment on column public.subscriptions.currency is 'The currency for the subscription';

comment on column public.subscriptions.status is 'The status of the subscription';

comment on column public.subscriptions.period_starts_at is 'The start of the current period for the subscription';

comment on column public.subscriptions.period_ends_at is 'The end of the current period for the subscription';

comment on column public.subscriptions.trial_starts_at is 'The start of the trial period for the subscription';

comment on column public.subscriptions.trial_ends_at is 'The end of the trial period for the subscription';

comment on column public.subscriptions.active is 'Whether the subscription is active';

comment on column public.subscriptions.billing_customer_id is 'The billing customer ID for the subscription';

-- Revoke all on subscriptions table from authenticated and service_role
revoke all on public.subscriptions
from
  authenticated,
  service_role;

-- Open up relevant access to subscriptions table for authenticated users and service_role
grant
select
,
  insert,
update,
delete on table public.subscriptions to service_role;

grant
select
  on table public.subscriptions to authenticated;

-- Indexes on the subscriptions table
create index ix_subscriptions_account_id on public.subscriptions (account_id);

create index ix_subscriptions_billing_customer_id on public.subscriptions (billing_customer_id);

create index ix_subscriptions_active_account_id on public.subscriptions (account_id)
where
  active = true;

-- Triggers for subscriptions table
create trigger subscriptions_set_timestamps
before insert or update on public.subscriptions
for each row execute function public.trigger_set_timestamps();

-- Enable RLS on subscriptions table
alter table public.subscriptions enable row level security;

-- RLS on the subscriptions table
-- SELECT(subscriptions):
-- Users can read account subscriptions on an account they are a member of
create policy subscriptions_read_self on public.subscriptions for
select
  to authenticated using (
    (
      has_role_on_account (account_id)
      and public.is_set ('enable_team_account_billing')
    )
    or (
      account_id = (
        select
          auth.uid ()
      )
      and public.is_set ('enable_account_billing')
    )
  );

-- Function "public.upsert_subscription"
-- Insert or Update a subscription and its items in the database when receiving a webhook from the billing provider
create
or replace function public.upsert_subscription (
  target_account_id uuid,
  target_customer_id varchar(255),
  target_subscription_id text,
  active bool,
  status public.subscription_status,
  billing_provider public.billing_provider,
  cancel_at_period_end bool,
  currency varchar(3),
  period_starts_at timestamptz,
  period_ends_at timestamptz,
  line_items jsonb,
  trial_starts_at timestamptz default null,
  trial_ends_at timestamptz default null
) returns public.subscriptions
set
  search_path = '' as $$
declare
    new_subscription public.subscriptions;
    new_billing_customer_id int;
begin
    insert into public.billing_customers(
        account_id,
        provider,
        customer_id)
    values (
        target_account_id,
        billing_provider,
        target_customer_id)
on conflict (
    account_id,
    provider,
    customer_id)
    do update set
        provider = excluded.provider
    returning
        id into new_billing_customer_id;

    insert into public.subscriptions(
        account_id,
        billing_customer_id,
        id,
        active,
        status,
        billing_provider,
        cancel_at_period_end,
        currency,
        period_starts_at,
        period_ends_at,
        trial_starts_at,
        trial_ends_at)
    values (
        target_account_id,
        new_billing_customer_id,
        target_subscription_id,
        active,
        status,
        billing_provider,
        cancel_at_period_end,
        currency,
        period_starts_at,
        period_ends_at,
        trial_starts_at,
        trial_ends_at)
on conflict (
    id)
    do update set
        active = excluded.active,
        status = excluded.status,
        cancel_at_period_end = excluded.cancel_at_period_end,
        currency = excluded.currency,
        period_starts_at = excluded.period_starts_at,
        period_ends_at = excluded.period_ends_at,
        trial_starts_at = excluded.trial_starts_at,
        trial_ends_at = excluded.trial_ends_at
    returning
        * into new_subscription;

    -- Upsert subscription items and delete ones that are not in the line_items array
    with item_data as (
        select
            (line_item ->> 'id')::varchar as line_item_id,
            (line_item ->> 'product_id')::varchar as prod_id,
            (line_item ->> 'variant_id')::varchar as var_id,
            (line_item ->> 'type')::public.subscription_item_type as type,
            (line_item ->> 'price_amount')::numeric as price_amt,
            (line_item ->> 'quantity')::integer as qty,
            (line_item ->> 'interval')::varchar as intv,
            (line_item ->> 'interval_count')::integer as intv_count
        from
            jsonb_array_elements(line_items) as line_item
    ),
    line_item_ids as (
        select line_item_id from item_data
    ),
    deleted_items as (
        delete from
            public.subscription_items
        where
            public.subscription_items.subscription_id = new_subscription.id
            and public.subscription_items.id not in (select line_item_id from line_item_ids)
        returning *
    )
    insert into public.subscription_items(
        id,
        subscription_id,
        product_id,
        variant_id,
        type,
        price_amount,
        quantity,
        interval,
        interval_count)
    select
        line_item_id,
        target_subscription_id,
        prod_id,
        var_id,
        type,
        price_amt,
        qty,
        intv,
        intv_count
    from
        item_data
    on conflict (id)
        do update set
            product_id = excluded.product_id,
            variant_id = excluded.variant_id,
            price_amount = excluded.price_amount,
            quantity = excluded.quantity,
            interval = excluded.interval,
            type = excluded.type,
            interval_count = excluded.interval_count;

    return new_subscription;

end;

$$ language plpgsql;

grant
execute on function public.upsert_subscription (
  uuid,
  varchar,
  text,
  bool,
  public.subscription_status,
  public.billing_provider,
  bool,
  varchar,
  timestamptz,
  timestamptz,
  jsonb,
  timestamptz,
  timestamptz
) to service_role;

/* -------------------------------------------------------
* Section: Subscription Items
* We create the schema for the subscription items. Subscription items are the items in a subscription.
* For example, a subscription might have a subscription item with the product ID 'prod_123' and the variant ID 'var_123'.
* -------------------------------------------------------
*/
create table if not exists
  public.subscription_items (
    id varchar(255) not null primary key,
    subscription_id text references public.subscriptions (id) on delete cascade not null,
    product_id varchar(255) not null,
    variant_id varchar(255) not null,
    type public.subscription_item_type not null,
    price_amount numeric,
    quantity integer not null default 1 check (quantity > 0),
    interval varchar(255) not null,
    interval_count integer not null check (interval_count > 0),
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp,
    unique (subscription_id, product_id, variant_id)
  );

comment on table public.subscription_items is 'The items in a subscription';

comment on column public.subscription_items.subscription_id is 'The subscription the item is for';

comment on column public.subscription_items.product_id is 'The product ID for the item';

comment on column public.subscription_items.variant_id is 'The variant ID for the item';

comment on column public.subscription_items.price_amount is 'The price amount for the item';

comment on column public.subscription_items.quantity is 'The quantity of the item';

comment on column public.subscription_items.interval is 'The interval for the item';

comment on column public.subscription_items.interval_count is 'The interval count for the item';

comment on column public.subscription_items.created_at is 'The creation date of the item';

comment on column public.subscription_items.updated_at is 'The last update date of the item';

-- Revoke all access to subscription_items table for authenticated users and service_role
revoke all on public.subscription_items
from
  authenticated,
  service_role;

-- Open up relevant access to subscription_items table for authenticated users and service_role
grant
select
  on table public.subscription_items to authenticated,
  service_role;

grant insert,
update,
delete on table public.subscription_items to service_role;

-- Indexes
-- Indexes on the subscription_items table
create index ix_subscription_items_subscription_id on public.subscription_items (subscription_id);

create index ix_subscription_items_product_variant on public.subscription_items (product_id, variant_id);

-- Triggers for subscription_items table
create trigger subscription_items_set_timestamps
before insert or update on public.subscription_items
for each row execute function public.trigger_set_timestamps();

-- RLS
alter table public.subscription_items enable row level security;

-- SELECT(subscription_items)
-- Users can read subscription items on a subscription they are a member of
create policy subscription_items_read_self on public.subscription_items for
select
  to authenticated using (
    exists (
      select
        1
      from
        public.subscriptions
      where
        id = subscription_id
        and (
          account_id = (
            select
              auth.uid ()
          )
          or has_role_on_account (account_id)
        )
    )
  );


-- Function "public.has_active_subscription"
-- Check if a user has an active subscription on an account - ie. it's trialing or active
-- Useful to gate access to features that require a subscription
create
or replace function public.has_active_subscription (target_account_id uuid) returns boolean
set
  search_path = '' as $$
begin
    return exists (
        select
            1
        from
            public.subscriptions
        where
            account_id = target_account_id
            and active = true);

end;

$$ language plpgsql;

grant
execute on function public.has_active_subscription (uuid) to authenticated,
service_role;

-- -----------------------------------------------------------------------------
-- Source: apps/web/supabase/schemas/10-orders.sql
-- -----------------------------------------------------------------------------
/**
 * -------------------------------------------------------
 * Section: Orders
 * We create the schema for the subscription items. Subscription items are the items in a subscription.
 * For example, a subscription might have a subscription item with the product ID 'prod_123' and the variant ID 'var_123'.
 * -------------------------------------------------------
 */

create table if not exists
  public.orders (
    id text not null primary key,
    account_id uuid references public.accounts (id) on delete cascade not null,
    billing_customer_id int references public.billing_customers on delete cascade not null,
    status public.payment_status not null,
    billing_provider public.billing_provider not null,
    total_amount numeric not null check (total_amount >= 0),
    currency varchar(3) not null check (currency ~ '^[A-Za-z]{3}$'),
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp
  );

comment on table public.orders is 'The one-time orders for an account';

comment on column public.orders.account_id is 'The account the order is for';

comment on column public.orders.billing_provider is 'The provider of the order';

comment on column public.orders.total_amount is 'The total amount for the order';

comment on column public.orders.currency is 'The currency for the order';

comment on column public.orders.status is 'The status of the order';

comment on column public.orders.billing_customer_id is 'The billing customer ID for the order';

-- Revoke all access to orders table for authenticated users and service_role
revoke all on public.orders
from
  authenticated,
  service_role;

-- Open up access to orders table for authenticated users and service_role
grant
select
  on table public.orders to authenticated;

grant
select
,
  insert,
update,
delete on table public.orders to service_role;

-- Indexes
-- Indexes on the orders table
create index ix_orders_account_id on public.orders (account_id);

create index ix_orders_billing_customer_id on public.orders (billing_customer_id);

create index ix_orders_account_created_at on public.orders (account_id, created_at desc);

-- Triggers for orders table
create trigger orders_set_timestamps
before insert or update on public.orders
for each row execute function public.trigger_set_timestamps();

-- RLS
alter table public.orders enable row level security;

-- SELECT(orders)
-- Users can read orders on an account they are a member of or the account is their own
create policy orders_read_self on public.orders for
select
  to authenticated using (
    (
      account_id = (
        select
          auth.uid ()
      )
      and public.is_set ('enable_account_billing')
    )
    or (
      has_role_on_account (account_id)
      and public.is_set ('enable_team_account_billing')
    )
  );

/**
 * -------------------------------------------------------
 * Section: Order Items
 * We create the schema for the order items. Order items are the items in an order.
 * -------------------------------------------------------
 */
create table if not exists
  public.order_items (
    id text not null primary key,
    order_id text references public.orders (id) on delete cascade not null,
    product_id text not null,
    variant_id text not null,
    price_amount numeric,
    quantity integer not null default 1 check (quantity > 0),
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp,
    unique (order_id, product_id, variant_id)
  );

comment on table public.order_items is 'The items in an order';

comment on column public.order_items.order_id is 'The order the item is for';

comment on column public.order_items.order_id is 'The order the item is for';

comment on column public.order_items.product_id is 'The product ID for the item';

comment on column public.order_items.variant_id is 'The variant ID for the item';

comment on column public.order_items.price_amount is 'The price amount for the item';

comment on column public.order_items.quantity is 'The quantity of the item';

comment on column public.order_items.created_at is 'The creation date of the item';

comment on column public.order_items.updated_at is 'The last update date of the item';

-- Revoke all access to order_items table for authenticated users and service_role
revoke all on public.order_items
from
  authenticated,
  service_role;

-- Open up relevant access to order_items table for authenticated users and service_role
grant
select
  on table public.order_items to authenticated,
  service_role;

grant insert, update, delete on table public.order_items to service_role;

-- Indexes on the order_items table
create index ix_order_items_order_id on public.order_items (order_id);

create index ix_order_items_product_variant on public.order_items (product_id, variant_id);

-- Triggers for order_items table
create trigger order_items_set_timestamps
before insert or update on public.order_items
for each row execute function public.trigger_set_timestamps();

-- RLS
alter table public.order_items enable row level security;

-- SELECT(order_items):
-- Users can read order items on an order they are a member of
create policy order_items_read_self on public.order_items for
select
  to authenticated using (
    exists (
      select
        1
      from
        public.orders
      where
        id = order_id
        and (
          account_id = (
            select
              auth.uid ()
          )
          or has_role_on_account (account_id)
        )
    )
  );

-- Function "public.upsert_order"
-- Insert or update an order and its items when receiving a webhook from the billing provider
create
or replace function public.upsert_order (
  target_account_id uuid,
  target_customer_id varchar(255),
  target_order_id text,
  status public.payment_status,
  billing_provider public.billing_provider,
  total_amount numeric,
  currency varchar(3),
  line_items jsonb
) returns public.orders
set
  search_path = '' as $$
declare
    new_order public.orders;
    new_billing_customer_id int;
begin
    insert into public.billing_customers(
        account_id,
        provider,
        customer_id)
    values (
        target_account_id,
        billing_provider,
        target_customer_id)
on conflict (
    account_id,
    provider,
    customer_id)
    do update set
        provider = excluded.provider
    returning
        id into new_billing_customer_id;

    insert into public.orders(
        account_id,
        billing_customer_id,
        id,
        status,
        billing_provider,
        total_amount,
        currency)
    values (
        target_account_id,
        new_billing_customer_id,
        target_order_id,
        status,
        billing_provider,
        total_amount,
        currency)
on conflict (
    id)
    do update set
        status = excluded.status,
        total_amount = excluded.total_amount,
        currency = excluded.currency
    returning
        * into new_order;

    -- Upsert order items and delete ones that are not in the line_items array
    with item_data as (
        select
            (line_item ->> 'id')::varchar as line_item_id,
            (line_item ->> 'product_id')::varchar as prod_id,
            (line_item ->> 'variant_id')::varchar as var_id,
            (line_item ->> 'price_amount')::numeric as price_amt,
            (line_item ->> 'quantity')::integer as qty
        from
            jsonb_array_elements(line_items) as line_item
    ),
    line_item_ids as (
        select line_item_id from item_data
    ),
    deleted_items as (
        delete from
            public.order_items
        where
            public.order_items.order_id = new_order.id
            and public.order_items.id not in (select line_item_id from line_item_ids)
        returning *
    )
    insert into public.order_items(
        id,
        order_id,
        product_id,
        variant_id,
        price_amount,
        quantity)
    select
        line_item_id,
        target_order_id,
        prod_id,
        var_id,
        price_amt,
        qty
    from
        item_data
    on conflict (id)
        do update set
            price_amount = excluded.price_amount,
            product_id = excluded.product_id,
            variant_id = excluded.variant_id,
            quantity = excluded.quantity;

    return new_order;

end;

$$ language plpgsql;

grant
execute on function public.upsert_order (
  uuid,
  varchar,
  text,
  public.payment_status,
  public.billing_provider,
  numeric,
  varchar,
  jsonb
) to service_role;

-- -----------------------------------------------------------------------------
-- Source: apps/web/supabase/schemas/11-notifications.sql
-- -----------------------------------------------------------------------------

/**
 * -------------------------------------------------------
 * Section: Notifications
 * We create the schema for the notifications. Notifications are the notifications for an account.
 * -------------------------------------------------------
 */
create type public.notification_channel as enum('in_app', 'email');

create type public.notification_type as enum('info', 'warning', 'error');

create table if not exists
  public.notifications (
    id bigint generated always as identity primary key,
    account_id uuid not null references public.accounts (id) on delete cascade,
    type public.notification_type not null default 'info',
    body varchar(5000) not null,
    link varchar(255),
    channel public.notification_channel not null default 'in_app',
    dismissed boolean not null default false,
    expires_at timestamptz default (now() + interval '1 month'),
    created_at timestamptz not null default now(),
    check (expires_at is null or expires_at > created_at)
  );

comment on table notifications is 'The notifications for an account';

comment on column notifications.account_id is 'The account the notification is for';

comment on column notifications.type is 'The type of the notification';

comment on column notifications.body is 'The body of the notification';

comment on column notifications.link is 'The link for the notification';

comment on column notifications.channel is 'The channel for the notification';

comment on column notifications.dismissed is 'Whether the notification has been dismissed';

comment on column notifications.expires_at is 'The expiry date for the notification';

comment on column notifications.created_at is 'The creation date for the notification';

-- Revoke all access to notifications table for authenticated users and service_role
revoke all on public.notifications
from
  authenticated,
  service_role;

-- Open up relevant access to notifications table for authenticated users and service_role
grant
select
  on table public.notifications to authenticated,
service_role;

-- service_role retains full-table UPDATE
grant
update on table public.notifications to service_role;

-- authenticated may only toggle the dismissed flag. Every other column
-- (account_id, type, body, link, channel, expires_at, created_at) is
-- system-managed. Enforced by Postgres up front, on top of the
-- kit.update_notification_dismissed_status trigger.
grant
update (dismissed) on table public.notifications to authenticated;

grant insert,
delete on table public.notifications to service_role;

-- enable realtime
alter publication supabase_realtime
add table public.notifications;

-- Indexes
-- Indexes on the notifications table
-- index for selecting notifications for an account that are not dismissed and not expired
create index idx_notifications_account_dismissed on notifications (account_id, dismissed, expires_at);

create index idx_notifications_account_created_at on notifications (account_id, created_at desc);

-- RLS
alter table public.notifications enable row level security;

-- SELECT(notifications):
-- Users can read notifications on an account they are a member of
create policy notifications_read_self on public.notifications for
select
  to authenticated using (
    account_id = (
      select
        auth.uid ()
    )
    or has_role_on_account (account_id)
  );

-- UPDATE(notifications):
-- Users can set notifications to read on an account they are a member of
create policy notifications_update_self on public.notifications
for update
  to authenticated using (
    account_id = (
      select
        auth.uid ()
    )
    or has_role_on_account (account_id)
  );

-- Function "kit.update_notification_dismissed_status"
-- Make sure the only updatable field is the dismissed status and nothing else
create
or replace function kit.update_notification_dismissed_status () returns trigger
set
  search_path to '' as $$
begin
    old.dismissed := new.dismissed;

    if (new is distinct from old) then
         raise exception 'UPDATE of columns other than "dismissed" is forbidden';
    end if;

    return old;
end;
$$ language plpgsql;

-- add trigger when updating a notification to update the dismissed status
create trigger update_notification_dismissed_status before
update on public.notifications for each row
execute procedure kit.update_notification_dismissed_status ();

-- -----------------------------------------------------------------------------
-- Source: apps/web/supabase/schemas/12-one-time-tokens.sql
-- -----------------------------------------------------------------------------
/*
 * -------------------------------------------------------
 * Section: Nonces
 * We create the schema for the nonces. Nonces are used to create one-time tokens for authentication purposes.
 * -------------------------------------------------------
 */

-- Create a table to store one-time tokens (nonces)
CREATE TABLE IF NOT EXISTS public.nonces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_token TEXT NOT NULL, -- token sent to client (hashed)
    nonce TEXT NOT NULL, -- token stored in DB (hashed)
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NULL, -- Optional to support anonymous tokens
    purpose TEXT NOT NULL, -- e.g., 'password-reset', 'email-verification', etc.

    -- Status fields
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    used_at TIMESTAMPTZ,
    revoked BOOLEAN NOT NULL DEFAULT FALSE, -- For administrative revocation
    revoked_reason TEXT, -- Reason for revocation if applicable

    -- Audit fields
    verification_attempts INTEGER NOT NULL DEFAULT 0 CHECK (verification_attempts >= 0), -- Track attempted uses
    last_verification_at TIMESTAMPTZ, -- Timestamp of last verification attempt
    last_verification_ip INET, -- For tracking verification source
    last_verification_user_agent TEXT, -- For tracking client information

    -- Extensibility fields
    metadata JSONB DEFAULT '{}'::JSONB, -- optional metadata
    scopes TEXT[] DEFAULT '{}', -- OAuth-style authorized scopes
    CHECK (expires_at > created_at),
    CHECK (used_at IS NULL OR used_at >= created_at)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_nonces_status ON public.nonces (client_token, user_id, purpose, expires_at)
  WHERE used_at IS NULL AND revoked = FALSE;

-- Optimized index for verify_nonce function query pattern
-- Matches filter order: purpose → expires_at → user_id
CREATE INDEX IF NOT EXISTS idx_nonces_verify_lookup ON public.nonces (purpose, expires_at DESC, user_id)
  WHERE used_at IS NULL AND revoked = FALSE;

CREATE INDEX IF NOT EXISTS idx_nonces_verify_recent ON public.nonces (purpose, user_id, created_at DESC)
  WHERE used_at IS NULL AND revoked = FALSE;

CREATE INDEX IF NOT EXISTS idx_nonces_cleanup ON public.nonces (expires_at, used_at, revoked);

-- Enable Row Level Security (RLS)
ALTER TABLE public.nonces ENABLE ROW LEVEL SECURITY;

-- RLS policies
-- Users can view their own nonces for verification
-- Defense-in-depth RLS policies. NOTE: the nonces table is intentionally
-- RPC-only — the authenticated role is never granted base table privileges, so
-- these policies only take effect if such a grant is ever added. All token
-- access happens through the SECURITY DEFINER verify_nonce / get_nonce_status
-- functions; the table is never exposed to the data API directly.
CREATE POLICY "Users can read their own nonces"
  ON public.nonces
  FOR SELECT
  USING (
    user_id = (select auth.uid())
  );

-- Create a function to create a nonce
-- Create a function to create a nonce
create or replace function public.create_nonce (
    p_user_id UUID default null,
    p_purpose TEXT default null,
    p_expires_in_seconds INTEGER default 3600, -- 1 hour by default
    p_metadata JSONB default null,
    p_scopes text[] default null,
    p_revoke_previous BOOLEAN default true -- New parameter to control automatic revocation
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
    set
        search_path to '' as $$
DECLARE
    v_client_token TEXT;
    v_nonce TEXT;
    v_expires_at TIMESTAMPTZ;
    v_id UUID;
    v_plaintext_token TEXT;
    v_revoked_count INTEGER;
BEGIN
    IF p_purpose IS NULL OR length(trim(p_purpose)) = 0 THEN
        RAISE EXCEPTION 'Nonce purpose is required';
    END IF;

    IF p_expires_in_seconds IS NULL OR p_expires_in_seconds <= 0 THEN
        RAISE EXCEPTION 'Nonce expiration must be greater than zero seconds';
    END IF;

    -- Revoke previous tokens for the same user and purpose if requested
    -- This only applies if a user ID is provided (not for anonymous tokens)
    IF p_revoke_previous = TRUE AND p_user_id IS NOT NULL THEN
        WITH revoked AS (
            UPDATE public.nonces
                SET
                    revoked = TRUE,
                    revoked_reason = 'Superseded by new token with same purpose'
                WHERE
                    user_id = p_user_id
                        AND purpose = p_purpose
                        AND used_at IS NULL
                        AND revoked = FALSE
                        AND expires_at > NOW()
                RETURNING 1
        )
        SELECT COUNT(*) INTO v_revoked_count FROM revoked;
    END IF;

    -- Generate a 6-digit token
    v_plaintext_token := (100000 + floor(random() * 900000))::text;
    v_client_token := extensions.crypt(v_plaintext_token, extensions.gen_salt('bf'));

    -- Still generate a secure nonce for internal use
    v_nonce := encode(extensions.gen_random_bytes(24), 'base64');
    v_nonce := extensions.crypt(v_nonce, extensions.gen_salt('bf'));

    -- Calculate expiration time
    v_expires_at := NOW() + (p_expires_in_seconds * interval '1 second');

    -- Insert the new nonce
    INSERT INTO public.nonces (
        client_token,
        nonce,
        user_id,
        expires_at,
        metadata,
        purpose,
        scopes
    )
    VALUES (
               v_client_token,
               v_nonce,
               p_user_id,
               v_expires_at,
               COALESCE(p_metadata, '{}'::JSONB),
               p_purpose,
               COALESCE(p_scopes, '{}'::TEXT[])
           )
    RETURNING id INTO v_id;

    -- Return the token information
    -- Note: returning the plaintext token, not the hash
    RETURN jsonb_build_object(
            'id', v_id,
            'token', v_plaintext_token,
            'expires_at', v_expires_at,
            'revoked_previous_count', COALESCE(v_revoked_count, 0)
           );
END;
$$;

grant execute on function public.create_nonce to service_role;

-- Create a function to verify a nonce
-- Create a function to verify a nonce
create or replace function public.verify_nonce (
    p_token TEXT,
    p_purpose TEXT,
    p_user_id UUID default null,
    p_required_scopes text[] default null,
    p_max_verification_attempts INTEGER default 5,
    p_ip INET default null,
    p_user_agent TEXT default null
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
    set
        SEARCH_PATH to '' as $$
DECLARE
    v_nonce          RECORD;
    v_exhausted      BOOLEAN;
    v_max_attempts   INTEGER := least(greatest(coalesce(p_max_verification_attempts, 5), 1), 10);
BEGIN
    -- SECURITY: authenticated callers may only act on their own (or anonymous)
    -- tokens. Without this pin a user could pass another user's id and burn or
    -- revoke that user's active tokens via failed attempts. The caller's role
    -- is read from the JWT claim, falling back to the role GUC set by SET
    -- ROLE: inside a SECURITY DEFINER function current_user is the function
    -- owner, never the caller, so neither is usable here. The service_role
    -- client keeps the ability to verify on behalf of any user.
    IF coalesce(auth.jwt() ->> 'role', current_setting('role', true)) = 'authenticated' THEN
        p_user_id := (select auth.uid());
    END IF;

    -- Find and update the nonce in a single operation
    -- First filter by indexed columns to reduce candidate rows, then do bcrypt comparison
    WITH candidate_nonces AS (
        -- Use index to filter candidates by purpose, user_id, expiry, status
        SELECT id, client_token, user_id, purpose, metadata, scopes,
               verification_attempts, expires_at, used_at, revoked
        FROM public.nonces
        WHERE purpose = p_purpose
          AND used_at IS NULL
          AND NOT revoked
          AND expires_at > NOW()
          -- Only apply user_id filter if the token was created for a specific user
          AND (
            -- Case 1: Anonymous token (user_id is NULL in DB)
            (user_id IS NULL)
                OR
                -- Case 2: User-specific token (check if user_id matches)
            (user_id = p_user_id)
            )
        ORDER BY created_at DESC
        -- Safety net: Limit to 100 most recent candidates to cap worst-case performance
        -- In production, auto-revocation keeps this low, but this protects against edge cases
        LIMIT 100
            -- CRITICAL: Lock rows to prevent race conditions in concurrent verifications
            -- SKIP LOCKED ensures other requests fail fast instead of waiting
            FOR UPDATE SKIP LOCKED
    ),
         -- SECURITY: Count this verification attempt against ALL active candidate
         -- nonces for this purpose/user, regardless of whether the supplied token
         -- matches. Counting only successful matches (the previous behaviour) meant
         -- wrong guesses were never recorded, so the attempt cap never tripped and
         -- the token was unboundedly brute-forceable.
         -- NOTE: create_nonce defaults revoke_previous=true, so there is normally a
         -- single active nonce per (purpose, user_id). If a caller ever issues
         -- multiple concurrent nonces for the same purpose+user, a failed guess
         -- counts against all of them together.
         updated_nonces AS (
             UPDATE public.nonces n
                 SET verification_attempts        = n.verification_attempts + 1,
                     last_verification_at         = NOW(),
                     last_verification_ip         = COALESCE(p_ip, n.last_verification_ip),
                     last_verification_user_agent = COALESCE(p_user_agent, n.last_verification_user_agent)
                 FROM candidate_nonces c
                 WHERE n.id = c.id
                 RETURNING n.*
         ),
         matched_nonce AS (
             -- Now do the expensive bcrypt comparison only on the (incremented) candidates
             SELECT *
             FROM updated_nonces
             WHERE client_token = extensions.crypt(p_token, client_token)
             LIMIT 1
         )
    SELECT * INTO v_nonce FROM matched_nonce;

    -- No token matched. The attempt has been counted on the active candidate
    -- nonce(s); revoke any that have now exceeded the cap so further guesses
    -- fail fast (the candidate set is no longer eligible on the next call).
    IF v_nonce.id IS NULL THEN
        WITH exhausted AS (
            UPDATE public.nonces
                SET revoked        = TRUE,
                    revoked_reason = 'Maximum verification attempts exceeded'
                WHERE purpose = p_purpose
                    AND used_at IS NULL
                    AND NOT revoked
                    AND ((user_id IS NULL) OR (user_id = p_user_id))
                    AND verification_attempts > v_max_attempts
                RETURNING id
        )
        SELECT count(*) > 0 INTO v_exhausted FROM exhausted;

        IF v_exhausted THEN
            RETURN jsonb_build_object(
                    'valid', false,
                    'message', 'Token revoked due to too many verification attempts',
                    'max_attempts_exceeded', true
                   );
        END IF;

        RETURN jsonb_build_object(
                'valid', false,
                'message', 'Invalid or expired token'
               );
    END IF;

    -- Check if max verification attempts exceeded (using the incremented value)
    IF v_nonce.verification_attempts > v_max_attempts THEN
        -- Automatically revoke the token
        UPDATE public.nonces
        SET revoked        = TRUE,
            revoked_reason = 'Maximum verification attempts exceeded'
        WHERE id = v_nonce.id;

        RETURN jsonb_build_object(
                'valid', false,
                'message', 'Token revoked due to too many verification attempts',
                'max_attempts_exceeded', true
               );
    END IF;

    -- Check scopes if required
    IF p_required_scopes IS NOT NULL AND array_length(p_required_scopes, 1) > 0 THEN
        -- Fix scope validation to properly check if token scopes contain all required scopes
        -- Using array containment check: array1 @> array2 (array1 contains array2)
        IF NOT (v_nonce.scopes @> p_required_scopes) THEN
            RETURN jsonb_build_object(
                    'valid', false,
                    'message', 'Token does not have required permissions',
                    'token_scopes', v_nonce.scopes,
                    'required_scopes', p_required_scopes
                   );
        END IF;
    END IF;

    -- Mark nonce as used
    UPDATE public.nonces
    SET used_at = NOW()
    WHERE id = v_nonce.id;

    -- Return success with metadata
    RETURN jsonb_build_object(
            'valid', true,
            'user_id', v_nonce.user_id,
            'metadata', v_nonce.metadata,
            'scopes', v_nonce.scopes,
            'purpose', v_nonce.purpose
           );
END;
$$;

grant
    execute on function public.verify_nonce to authenticated,
    service_role;

-- Create a function to revoke a nonce
CREATE OR REPLACE FUNCTION public.revoke_nonce(
  p_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_affected_rows INTEGER;
BEGIN
  UPDATE public.nonces
  SET
    revoked = TRUE,
    revoked_reason = p_reason
  WHERE
    id = p_id
    AND used_at IS NULL
    AND NOT revoked
  RETURNING 1 INTO v_affected_rows;

  RETURN v_affected_rows > 0;
END;
$$;

grant execute on function public.revoke_nonce to service_role;

-- Create a function to clean up expired nonces
CREATE OR REPLACE FUNCTION kit.cleanup_expired_nonces(
  p_older_than_days INTEGER DEFAULT 1,
  p_include_used BOOLEAN DEFAULT TRUE,
  p_include_revoked BOOLEAN DEFAULT TRUE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Count and delete expired or used nonces based on parameters
  WITH deleted AS (
    DELETE FROM public.nonces
    WHERE
      (
        -- Expired and unused tokens
        (expires_at < NOW() AND used_at IS NULL)

        -- Used tokens older than specified days (if enabled)
        OR (p_include_used = TRUE AND used_at < NOW() - (p_older_than_days * interval '1 day'))

        -- Revoked tokens older than specified days (if enabled)
        OR (p_include_revoked = TRUE AND revoked = TRUE AND created_at < NOW() - (p_older_than_days * interval '1 day'))
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM deleted;

  RETURN v_count;
END;
$$;

-- Create a function to get token status (for administrative use)
CREATE OR REPLACE FUNCTION public.get_nonce_status(
  p_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_nonce public.nonces;
BEGIN
  SELECT * INTO v_nonce FROM public.nonces WHERE id = p_id;

  IF v_nonce.id IS NULL THEN
    RETURN jsonb_build_object('exists', false);
  END IF;

  RETURN jsonb_build_object(
    'exists', true,
    'purpose', v_nonce.purpose,
    'user_id', v_nonce.user_id,
    'created_at', v_nonce.created_at,
    'expires_at', v_nonce.expires_at,
    'used_at', v_nonce.used_at,
    'revoked', v_nonce.revoked,
    'revoked_reason', v_nonce.revoked_reason,
    'verification_attempts', v_nonce.verification_attempts,
    'last_verification_at', v_nonce.last_verification_at,
    'last_verification_ip', v_nonce.last_verification_ip,
    'is_valid', (v_nonce.used_at IS NULL AND NOT v_nonce.revoked AND v_nonce.expires_at > NOW())
  );
END;
$$;

-- get_nonce_status is an administrative function called by the backend using
-- the service role (see @pymekit/otp getNonceStatus via the admin client). It must
-- be executable by service_role like the other administrative nonce functions.
grant execute on function public.get_nonce_status to service_role;

-- Comments for documentation
COMMENT ON TABLE public.nonces IS 'Table for storing one-time tokens with enhanced security and audit features';
COMMENT ON FUNCTION public.create_nonce IS 'Creates a new one-time token for a specific purpose with enhanced options';
COMMENT ON FUNCTION public.verify_nonce IS 'Verifies a one-time token, checks scopes, and marks it as used';
COMMENT ON FUNCTION public.revoke_nonce IS 'Administratively revokes a token to prevent its use';
COMMENT ON FUNCTION kit.cleanup_expired_nonces IS 'Cleans up expired, used, or revoked tokens based on parameters';
COMMENT ON FUNCTION public.get_nonce_status IS 'Retrieves the status of a token for administrative purposes';

-- -----------------------------------------------------------------------------
-- Source: apps/web/supabase/schemas/13-mfa.sql
-- -----------------------------------------------------------------------------
/*
 * -------------------------------------------------------
 * Section: MFA
 * We create the policies and functions to enforce MFA
 * -------------------------------------------------------
 */

/*
* public.is_aal2
* Check if the user has aal2 access
*/
create
    or replace function public.is_aal2() returns boolean
    set
        search_path = '' as
$$
declare
    is_aal2 boolean;
begin
    select auth.jwt() ->> 'aal' = 'aal2' into is_aal2;

    return coalesce(is_aal2, false);
end
$$ language plpgsql;

-- Grant access to the function to authenticated users
grant execute on function public.is_aal2() to authenticated;

/*
* public.is_super_admin
* Check if the user is a super admin. 
* A Super Admin is a user that has the role 'super-admin' and has MFA enabled.
*/
create
    or replace function public.is_super_admin() returns boolean
    set
        search_path = '' as
$$
declare
    is_super_admin boolean;
begin
    if not public.is_aal2() then
        return false;
    end if;

    select (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'super-admin' into is_super_admin;

    return coalesce(is_super_admin, false);
end
$$ language plpgsql;

-- Grant access to the function to authenticated users
grant execute on function public.is_super_admin() to authenticated;

/*
* public.is_mfa_compliant
* Check if the user meets MFA requirements if they have MFA enabled.
* If the user has MFA enabled, then the user must have aal2 enabled. Otherwise, the user must have aal1 enabled (default behavior).
*/
create or replace function public.is_mfa_compliant() returns boolean
    set search_path = '' as
$$
begin
    return array[(select auth.jwt()->>'aal')] <@ (
        select
            case
                when count(id) > 0 then array['aal2']
                else array['aal1', 'aal2']
                end as aal
        from auth.mfa_factors
        where ((select auth.uid()) = auth.mfa_factors.user_id) and auth.mfa_factors.status = 'verified'
    );
end
$$ language plpgsql security definer;

-- Grant access to the function to authenticated users
grant execute on function public.is_mfa_compliant() to authenticated;

-- MFA Restrictions:
-- the following policies are applied to the tables as a
-- restrictive policy to ensure that if MFA is enabled, then the policy will be applied.
-- For users that have not enabled MFA, the policy will not be applied and will keep the default behavior.

-- Restrict access to accounts if MFA is enabled
create policy restrict_mfa_accounts
    on public.accounts
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- Restrict access to accounts memberships if MFA is enabled
create policy restrict_mfa_accounts_memberships
    on public.accounts_memberships
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- Restrict access to subscriptions if MFA is enabled
create policy restrict_mfa_subscriptions
    on public.subscriptions
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- Restrict access to subscription items if MFA is enabled
create policy restrict_mfa_subscription_items
    on public.subscription_items
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- Restrict access to role permissions if MFA is enabled
create policy restrict_mfa_role_permissions
    on public.role_permissions
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- Restrict access to invitations if MFA is enabled
create policy restrict_mfa_invitations
    on public.invitations
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- Restrict access to orders if MFA is enabled
create policy restrict_mfa_orders
    on public.orders
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- Restrict access to orders items if MFA is enabled
create policy restrict_mfa_order_items
    on public.order_items
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- Restrict access to orders if MFA is enabled
create policy restrict_mfa_notifications
    on public.notifications
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- Restrict access to billing customers if MFA is enabled
create policy restrict_mfa_billing_customers
    on public.billing_customers
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- Restrict access to nonces if MFA is enabled
create policy restrict_mfa_nonces
    on public.nonces
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

-- -----------------------------------------------------------------------------
-- Source: apps/web/supabase/schemas/14-super-admin.sql
-- -----------------------------------------------------------------------------
/*
 * -------------------------------------------------------
 * Section: Super Admin
 * We create the policies and functions to enforce super admin access
 * -------------------------------------------------------
 */

-- the following policies are applied to the tables as a permissive policy to ensure that
-- super admins can access all tables (view only).

-- Allow Super Admins to access the accounts table
create policy super_admins_access_accounts
    on public.accounts
    as permissive
    for select
    to authenticated
    using (public.is_super_admin());

-- Allow Super Admins to access the accounts memberships table
create policy super_admins_access_accounts_memberships
    on public.accounts_memberships
    as permissive
    for select
    to authenticated
    using (public.is_super_admin());

-- Allow Super Admins to access the subscriptions table
create policy super_admins_access_subscriptions
    on public.subscriptions
    as permissive
    for select
    to authenticated
    using (public.is_super_admin());

-- Allow Super Admins to access the subscription items table
create policy super_admins_access_subscription_items
    on public.subscription_items
    as permissive
    for select
    to authenticated
    using (public.is_super_admin());

-- Allow Super Admins to access the invitations items table
create policy super_admins_access_invitations
    on public.invitations
    as permissive
    for select
    to authenticated
    using (public.is_super_admin());

-- Allow Super Admins to access the orders table
create policy super_admins_access_orders
    on public.orders
    as permissive
    for select
    to authenticated
    using (public.is_super_admin());

-- Allow Super Admins to access the order items table
create policy super_admins_access_order_items
    on public.order_items
    as permissive
    for select
    to authenticated
    using (public.is_super_admin());

-- Allow Super Admins to access the role permissions table
create policy super_admins_access_role_permissions
    on public.role_permissions
    as permissive
    for select
    to authenticated
    using (public.is_super_admin());

-- Allow Super Admins to access the billing customers table
create policy super_admins_access_billing_customers
    on public.billing_customers
    as permissive
    for select
    to authenticated
    using (public.is_super_admin());

-- Allow Super Admins to access the notifications table
create policy super_admins_access_notifications
    on public.notifications
    as permissive
    for select
    to authenticated
    using (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- Source: apps/web/supabase/schemas/15-active-account.sql
-- -----------------------------------------------------------------------------
/*
 * -------------------------------------------------------
 * Section: Active Account
 * Persists the account (personal or team) each user is currently working in.
 * The stored pointer is nullable; absence resolves to the personal account.
 * -------------------------------------------------------
 */

-- Table: one row per user pointing at their active account.
create table if not exists
  public.user_active_account (
    user_id uuid primary key references auth.users (id) on delete cascade,
    account_id uuid not null references public.accounts (id) on delete cascade,
    updated_at timestamp with time zone default now() not null
  );

comment on table public.user_active_account is 'The account (personal or team) the user is currently working in. Absence of a row resolves to the personal account.';

alter table "public"."user_active_account" enable row level security;

revoke all on public.user_active_account
from
  authenticated,
  service_role;

grant
select
,
  insert,
update,
delete on table public.user_active_account to service_role;

grant
select
,
  insert,
  delete on table public.user_active_account to authenticated;

-- authenticated may only UPDATE the pointer itself. The identity column
-- (user_id) is the tenancy link and must never change; updated_at is written
-- by set_active_account, which runs with invoker rights and therefore needs
-- the column privilege. Enforced by Postgres before RLS (defense-in-depth on
-- top of the user_active_account_write policy).
grant
update (account_id, updated_at) on table public.user_active_account to authenticated;

create index if not exists ix_user_active_account_account_id on public.user_active_account (account_id);

-- RLS: a user only sees their own row.
create policy "user_active_account_read" on public.user_active_account for
select
  to authenticated using (user_id = (select auth.uid ()));

-- RLS: a user may only point at their personal account or a team they belong to.
create policy "user_active_account_write" on public.user_active_account for all to authenticated using (user_id = (select auth.uid ()))
with
  check (
    user_id = (select auth.uid ())
    and (
      account_id = (select auth.uid ())
      or public.has_role_on_account (account_id)
    )
  );

-- Restrict access to the active-account pointer if MFA is enabled, in line
-- with the restrictive policies on the other user-facing tables (13-mfa.sql).
create policy restrict_mfa_user_active_account
    on public.user_active_account
    as restrictive
    to authenticated
    using (public.is_mfa_compliant());

--
-- Function "public.set_active_account"
-- Validates membership then upserts the caller's active account. Passing the
-- caller's own user id selects the personal account.
create
or replace function public.set_active_account (target_account_id uuid) returns void
set
  search_path = '' as $$
begin
  if target_account_id <> (select auth.uid())
     and not public.has_role_on_account(target_account_id) then
    raise exception 'You are not a member of the target account';
  end if;

  insert into public.user_active_account (user_id, account_id)
  values ((select auth.uid()), target_account_id)
  on conflict (user_id)
  do update set account_id = excluded.account_id, updated_at = now();
end;
$$ language plpgsql;

grant
execute on function public.set_active_account (uuid) to authenticated;

--
-- Function "public.active_account_id"
-- The single source of truth for "which account is active": reads the stored
-- pointer, falling back to the personal account (id = user id) when unset or
-- when the stored team membership is stale. Reused by every active-account RPC.
create
or replace function public.active_account_id () returns uuid
set
  search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_active_id uuid;
begin
  select ua.account_id into v_active_id
  from public.user_active_account ua
  where ua.user_id = v_user_id;

  if v_active_id is null then
    return v_user_id;
  end if;

  if v_active_id <> v_user_id
     and not public.has_role_on_account(v_active_id) then
    return v_user_id;
  end if;

  return v_active_id;
end;
$$ language plpgsql;

grant
execute on function public.active_account_id () to authenticated,
service_role;

--
-- Function "public.active_account_workspace"
-- Loads the full workspace for the caller's active account in a single
-- superset shape covering both personal and team accounts. Falls back to the
-- personal account when no row is set or the stored team membership is stale.
create
or replace function public.active_account_workspace () returns table (
  id uuid,
  name varchar(255),
  picture_url varchar(1000),
  slug text,
  is_personal_account boolean,
  role varchar(50),
  role_hierarchy_level int,
  primary_owner_user_id uuid,
  public_data jsonb,
  subscription_status public.subscription_status,
  permissions public.app_permissions[]
)
set
  search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_active_id uuid := public.active_account_id();
begin
  return query
  select
    accounts.id,
    accounts.name,
    accounts.picture_url,
    accounts.slug,
    accounts.is_personal_account,
    accounts_memberships.account_role,
    roles.hierarchy_level,
    accounts.primary_owner_user_id,
    accounts.public_data,
    (
      select subscriptions.status
      from public.subscriptions
      where subscriptions.account_id = accounts.id
      order by subscriptions.created_at desc
      limit 1
    ) as subscription_status,
    coalesce(
      array_agg(distinct role_permissions.permission)
        filter (where role_permissions.permission is not null),
      array[]::public.app_permissions[]
    )
  from public.accounts
    left join public.accounts_memberships
      on accounts.id = accounts_memberships.account_id
      and accounts_memberships.user_id = v_user_id
    left join public.roles on accounts_memberships.account_role = roles.name
    left join public.role_permissions
      on accounts_memberships.account_role = role_permissions.role
  where accounts.id = v_active_id
  group by
    accounts.id,
    accounts_memberships.account_role,
    roles.hierarchy_level;
end;
$$ language plpgsql;

grant
execute on function public.active_account_workspace () to authenticated,
service_role;

--
-- Function "public.get_active_account_members"
-- Members of the active account, resolved server-side. Delegates to the
-- slug-based `get_account_members`; a personal active account has a null slug
-- and therefore returns no rows (personal accounts have no members).
create
or replace function public.get_active_account_members () returns table (
  id uuid,
  user_id uuid,
  account_id uuid,
  role varchar(50),
  role_hierarchy_level int,
  primary_owner_user_id uuid,
  name varchar,
  email varchar,
  picture_url varchar,
  created_at timestamptz,
  updated_at timestamptz
)
set
  search_path = '' as $$
begin
  return query
  select * from public.get_account_members(
    (select accounts.slug from public.accounts
     where accounts.id = public.active_account_id())
  );
end;
$$ language plpgsql;

grant
execute on function public.get_active_account_members () to authenticated,
service_role;

--
-- Function "public.get_active_account_invitations"
-- Invitations of the active account, resolved server-side. Delegates to the
-- slug-based `get_account_invitations`; a personal active account returns none.
create
or replace function public.get_active_account_invitations () returns table (
  id integer,
  email varchar(255),
  account_id uuid,
  invited_by uuid,
  role varchar(50),
  created_at timestamptz,
  updated_at timestamptz,
  sent_at timestamptz,
  last_send_attempt_at timestamptz,
  resend_count integer,
  expires_at timestamptz,
  inviter_name varchar,
  inviter_email varchar
)
set
  search_path = '' as $$
begin
  return query
  select * from public.get_account_invitations(
    (select accounts.slug from public.accounts
     where accounts.id = public.active_account_id())
  );
end;
$$ language plpgsql;

grant
execute on function public.get_active_account_invitations () to authenticated,
service_role;

-- -----------------------------------------------------------------------------
-- Source: apps/web/supabase/schemas/16-account-views.sql
-- -----------------------------------------------------------------------------
/*
 * -------------------------------------------------------
 * Section: Account Functions
 * We create the schema for the functions. Functions are the custom functions for the application.
 * -------------------------------------------------------
 */


--
-- VIEW "user_account_workspace":
-- we create a view to load the general app data for the authenticated
-- user which includes the user accounts and memberships
create or replace view
    public.user_account_workspace
            with
            (security_invoker = true) as
select
    accounts.id as id,
    accounts.name as name,
    accounts.picture_url as picture_url,
    accounts.public_data as public_data,
    (
        select
            status
        from
            public.subscriptions
        where
            account_id = accounts.id
        order by
            created_at desc
        limit
            1
    ) as subscription_status
from
    public.accounts
where
    primary_owner_user_id = (select auth.uid ())
  and accounts.is_personal_account = true
limit
    1;

grant
    select
    on public.user_account_workspace to authenticated,
    service_role;

--
-- VIEW "user_accounts":
-- we create a view to load the user's accounts and memberships
-- useful to display the user's accounts in the app
create or replace view
    public.user_accounts (id, name, picture_url, slug, role, public_data)
        with
        (security_invoker = true) as
select
    account.id,
    account.name,
    account.picture_url,
    account.slug,
    membership.account_role,
    account.public_data
from
    public.accounts account
        join public.accounts_memberships membership on account.id = membership.account_id
where
    membership.user_id = (select auth.uid ())
  and account.is_personal_account = false
  and account.id in (
    select
        account_id
    from
        public.accounts_memberships
    where
        user_id = (select auth.uid ())
);

grant
    select
    on public.user_accounts to authenticated,
    service_role;

--
-- Function "public.team_account_workspace"
-- Load all the data for a team account workspace
create or replace function public.team_account_workspace(account_slug text)
returns table (
    id uuid,
    name varchar(255),
    picture_url varchar(1000),
    slug text,
    role varchar(50),
    role_hierarchy_level int,
    primary_owner_user_id uuid,
    public_data jsonb,
    subscription_status public.subscription_status,
    permissions public.app_permissions[]
)
set search_path to ''
as $$
begin
    return QUERY
    select
        accounts.id,
        accounts.name,
        accounts.picture_url,
        accounts.slug,
        accounts_memberships.account_role,
        roles.hierarchy_level,
        accounts.primary_owner_user_id,
        accounts.public_data,
        subscriptions.status,
        array_agg(role_permissions.permission)
    from
        public.accounts
        join public.accounts_memberships on accounts.id = accounts_memberships.account_id
        left join public.subscriptions on accounts.id = subscriptions.account_id
        join public.roles on accounts_memberships.account_role = roles.name
        left join public.role_permissions on accounts_memberships.account_role = role_permissions.role
    where
        accounts.slug = account_slug
        and public.accounts_memberships.user_id = (select auth.uid())
    group by
        accounts.id,
        accounts_memberships.account_role,
        accounts.public_data,
        subscriptions.status,
        roles.hierarchy_level;
end;
$$ language plpgsql;

grant
execute on function public.team_account_workspace (text) to authenticated,
service_role;

-- -----------------------------------------------------------------------------
-- Source: apps/web/supabase/schemas/17-storage.sql
-- -----------------------------------------------------------------------------
/*
 * -------------------------------------------------------
 * Section: Storage
 * We create the schema for the storage
 * -------------------------------------------------------
 */

-- Account Image
insert into
  storage.buckets (id, name, PUBLIC)
values
  ('account_image', 'account_image', true)
on conflict (id)
do nothing;

-- Function: get the storage filename as a UUID.
-- Useful if you want to name files with UUIDs related to an account
create
or replace function kit.get_storage_filename_as_uuid (name text) returns uuid
set
  search_path = '' as $$
begin
    return replace(storage.filename(name), concat('.',
	storage.extension(name)), '')::uuid;

exception
  when invalid_text_representation then
    return null;
end;

$$ language plpgsql;

grant
execute on function kit.get_storage_filename_as_uuid (text) to authenticated,
service_role;

-- RLS policies for storage bucket account_image.
-- Files are named after the account uuid they belong to. Reading requires
-- membership; writing (insert/update/delete) requires ownership of the
-- personal account or the settings.manage permission on the team account.
-- Policies are split per command because DELETE only consults USING — a
-- single FOR ALL policy would let any member delete the team image.
create policy account_image_select on storage.objects for
select
  to authenticated using (
    bucket_id = 'account_image'
    and (
      kit.get_storage_filename_as_uuid (name) = auth.uid ()
      or public.has_role_on_account (kit.get_storage_filename_as_uuid (name))
    )
  );

create policy account_image_insert on storage.objects for insert to authenticated
with
  check (
    bucket_id = 'account_image'
    and (
      kit.get_storage_filename_as_uuid (name) = auth.uid ()
      or public.has_permission (
        auth.uid (),
        kit.get_storage_filename_as_uuid (name),
        'settings.manage'
      )
    )
  );

create policy account_image_update on storage.objects
for update
  to authenticated using (
    bucket_id = 'account_image'
    and (
      kit.get_storage_filename_as_uuid (name) = auth.uid ()
      or public.has_permission (
        auth.uid (),
        kit.get_storage_filename_as_uuid (name),
        'settings.manage'
      )
    )
  )
with
  check (
    bucket_id = 'account_image'
    and (
      kit.get_storage_filename_as_uuid (name) = auth.uid ()
      or public.has_permission (
        auth.uid (),
        kit.get_storage_filename_as_uuid (name),
        'settings.manage'
      )
    )
  );

create policy account_image_delete on storage.objects for delete to authenticated using (
  bucket_id = 'account_image'
  and (
    kit.get_storage_filename_as_uuid (name) = auth.uid ()
    or public.has_permission (
      auth.uid (),
      kit.get_storage_filename_as_uuid (name),
      'settings.manage'
    )
  )
);

-- -----------------------------------------------------------------------------
-- Source: apps/web/supabase/schemas/18-roles-seed.sql
-- -----------------------------------------------------------------------------
/*
 * -------------------------------------------------------
 * Section: Roles Seed
 * We create the roles and role permissions seed data
 * -------------------------------------------------------
 */

-- Seed the roles table with default roles 'owner' and 'member'
insert into public.roles(
    name,
    hierarchy_level)
values (
           'owner',
           1)
on conflict (name)
do update set hierarchy_level = excluded.hierarchy_level;

insert into public.roles(
    name,
    hierarchy_level)
values (
           'member',
           2)
on conflict (name)
do update set hierarchy_level = excluded.hierarchy_level;

-- We seed the role_permissions table with the default roles and permissions
insert into public.role_permissions(
    role,
    permission)
values (
           'owner',
           'roles.manage'),
       (
           'owner',
           'billing.manage'),
       (
           'owner',
           'settings.manage'),
       (
           'owner',
           'members.manage'),
       (
           'owner',
           'invites.manage'),
       (
           'member',
           'settings.manage'),
       (
           'member',
           'invites.manage')
on conflict (role, permission)
do nothing;
