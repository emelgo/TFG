--
-- SECTION: ROLE PERMISSION GROUPS
-- In this section, we define the role permission groups table.
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