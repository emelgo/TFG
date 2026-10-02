
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