
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