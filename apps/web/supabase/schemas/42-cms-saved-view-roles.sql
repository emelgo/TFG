
/*
 * -------------------------------------------------------
 * Sección: Vistas guardadas compartidas con roles
 * Tabla intermedia que indica con qué roles del CMS se comparte cada vista.
 * -------------------------------------------------------
 */
create table if not exists cms.saved_view_roles (
  view_id UUID references cms.saved_views (id) on delete CASCADE,
  role_id UUID references cms.roles (id) on delete CASCADE,
  primary key (view_id, role_id)
);

comment on table cms.saved_view_roles is 'Table to store the saved view roles';

comment on column cms.saved_view_roles.view_id is 'The ID of the saved view';

comment on column cms.saved_view_roles.role_id is 'The ID of the role';

-- Permisos de tabla (sin UPDATE: compartir o dejar de compartir es insertar o
-- borrar una fila); la RLS decide sobre qué filas.
grant
select
,
  insert,
  delete on table cms.saved_view_roles to authenticated,
  service_role;

-- RLS activada; las políticas están en 43-cms-saved-views-rls.sql.
alter table cms.saved_view_roles ENABLE row LEVEL SECURITY;

-- Índice por rol, que es como filtran las políticas de vistas compartidas.
create index idx_saved_view_roles_role_id on cms.saved_view_roles (role_id);