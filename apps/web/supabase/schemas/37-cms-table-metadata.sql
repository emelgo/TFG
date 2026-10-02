
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
  to authenticated using (
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
  to authenticated using (
    cms.has_admin_permission (
      'table'::cms.system_resource,
      'update'::cms.system_action
    )
  );
