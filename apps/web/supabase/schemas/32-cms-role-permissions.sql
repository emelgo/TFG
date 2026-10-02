
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