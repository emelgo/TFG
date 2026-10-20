
/*
 * -------------------------------------------------------
 * Sección: Metadatos de tablas del CMS
 * Configuración de cómo muestra el CMS cada tabla de la aplicación: nombre
 * visible, columnas, relaciones, claves y opciones de interfaz. El CMS la
 * rellena automáticamente al sincronizar las tablas gestionadas
 * (45-cms-sync-managed-tables.sql) y el personal la puede ajustar.
 * -------------------------------------------------------
 */
create table if not exists cms.table_metadata (
  schema_name VARCHAR(64) not null,
  table_name VARCHAR(64) not null,
  display_name VARCHAR(255),
  description TEXT,
  display_format TEXT,
  is_visible BOOLEAN default true,
  ordering INTEGER,
  -- Configuración de claves (primaria, de visualización...).
  keys_config JSONB default '{}'::jsonb,
  -- Configuración de columnas: JSONB indexado por el nombre de la columna.
  columns_config JSONB default '{}'::jsonb,
  -- Configuración de relaciones: array de objetos de relación.
  relations_config JSONB default '[]'::jsonb,
  -- Personalización de la interfaz.
  ui_config JSONB default '{}'::jsonb,
  -- Indica si la tabla participa en la búsqueda global.
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

-- Permisos de tabla: solo lectura y actualización (las filas las crea la
-- sincronización); la RLS decide sobre qué filas.
grant
select
,
update on table cms.table_metadata to authenticated,
service_role;

-- RLS activada.
alter table cms.table_metadata ENABLE row LEVEL SECURITY;

-- Política SELECT: un usuario ve los metadatos de una tabla si tiene permiso
-- de lectura sobre esa tabla; así el CMS no revela ni siquiera la existencia
-- de tablas a las que no tiene acceso.
create policy view_table_metadata on cms.table_metadata for
select
  to authenticated using (
    cms.has_data_permission (
      'select'::cms.system_action,
      schema_name,
      table_name
    )
  );

-- Política UPDATE: cambiar cómo se muestra una tabla es una acción de
-- configuración, así que exige el permiso de sistema `table:update`.
create policy update_table_metadata on cms.table_metadata
for update
  to authenticated using (
    cms.has_admin_permission (
      'table'::cms.system_resource,
      'update'::cms.system_action
    )
  );
