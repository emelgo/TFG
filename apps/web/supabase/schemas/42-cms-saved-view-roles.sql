
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