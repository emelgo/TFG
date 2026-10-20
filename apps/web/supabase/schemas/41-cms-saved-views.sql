
/*
 * -------------------------------------------------------
 * Sección: Vistas guardadas del CMS
 * Filtros, columnas y configuraciones del explorador de datos que el
 * personal guarda para reutilizarlas. Son personales y se pueden compartir
 * con roles (42-cms-saved-view-roles.sql).
 * -------------------------------------------------------
 */
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
  -- schema_name debe ser un identificador válido.
  constraint saved_views_schema_name_check check (schema_name ~ '^[a-zA-Z_][a-zA-Z0-9_]*$'),
  -- table_name debe ser un identificador válido.
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

-- Permisos de tabla; la RLS decide sobre qué filas.
grant
select
,
  insert,
update,
delete on table cms.saved_views to authenticated,
service_role;

-- RLS activada; las políticas están en 43-cms-saved-views-rls.sql.
alter table cms.saved_views ENABLE row LEVEL SECURITY;