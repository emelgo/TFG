
-- SECTION: AUDIT LOG SEVERITY
-- In this section, we define the audit log severity. Audit log severity is the severity of the audit log.
create type cms.audit_log_severity as ENUM('info', 'warning', 'error');

-- SECTION: SYSTEM RESOURCES
-- In this section, we define the system resources. System resources are resources that belong to CMS itself, not the end application being managed.
create type cms.system_resource as ENUM(
  'account',
  'role',
  'permission',
  'log',
  'table',
  'auth_user',
  'system_setting'
);

-- SECTION: PERMISSION TYPE
-- In this section, we define the permission type. Permission type is the type of the permission.
create type cms.permission_type as ENUM('system', 'data');

-- SECTION: PERMISSION SCOPES
-- In this section, we define the permission scopes. Permission scopes are the scopes of the permissions.
create type cms.permission_scope as ENUM('table', 'column', 'storage');

-- SECTION: SYSTEM ACTIONS
-- In this section, we define the system actions. System actions are the actions that can be performed on the system resources.
create type cms.system_action as ENUM('insert', 'update', 'delete', 'select', '*');