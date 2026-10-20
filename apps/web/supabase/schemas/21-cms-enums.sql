
/*
 * -------------------------------------------------------
 * Sección: Tipos enumerados del CMS
 * -------------------------------------------------------
 */

-- Gravedad de una entrada del registro de auditoría.
create type cms.audit_log_severity as ENUM('info', 'warning', 'error');

-- Recursos del sistema: los que pertenecen al propio CMS (cuentas de
-- administración, roles, registros...), no a la aplicación que se gestiona.
-- Son el objeto de los permisos de tipo `system`.
create type cms.system_resource as ENUM(
  'account',
  'role',
  'permission',
  'log',
  'table',
  'auth_user',
  'system_setting'
);

-- Tipo de permiso: `system` (sobre recursos del CMS) o `data` (sobre tablas,
-- columnas o ficheros de la aplicación).
create type cms.permission_type as ENUM('system', 'data');

-- Alcance de un permiso de datos: una tabla, una columna o el almacenamiento.
create type cms.permission_scope as ENUM('table', 'column', 'storage');

-- Acciones que puede autorizar un permiso; `*` equivale a todas.
create type cms.system_action as ENUM('insert', 'update', 'delete', 'select', '*');