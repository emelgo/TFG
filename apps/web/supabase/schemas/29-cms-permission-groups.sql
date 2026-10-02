-- SECTION: PERMISSION GROUPS
-- In this section, we define the permission groups table and the functions to check if a user can modify a permission group.
--
-- This function is used to check if a user can modify a permission group.
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