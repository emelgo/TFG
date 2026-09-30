import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { authUsers } from 'drizzle-orm/supabase';

const users = authUsers;
export const usersInAuth = authUsers;

export const cms = pgSchema('cms');
export const auditLogSeverityInCms = cms.enum('audit_log_severity', [
  'info',
  'warning',
  'error',
]);
export const dashboardPermissionLevelInCms = cms.enum(
  'dashboard_permission_level',
  ['owner', 'view', 'edit'],
);
export const dashboardWidgetTypeInCms = cms.enum('dashboard_widget_type', [
  'chart',
  'metric',
  'table',
]);
export const permissionScopeInCms = cms.enum('permission_scope', [
  'table',
  'column',
  'storage',
]);
export const permissionTypeInCms = cms.enum('permission_type', [
  'system',
  'data',
]);
export const systemActionInCms = cms.enum('system_action', [
  'insert',
  'update',
  'delete',
  'select',
  '*',
]);
export const systemResourceInCms = cms.enum('system_resource', [
  'account',
  'role',
  'permission',
  'log',
  'table',
  'auth_user',
  'system_setting',
]);

export const rolesInCms = cms.table(
  'roles',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: varchar({ length: 50 }).notNull(),
    description: varchar({ length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    metadata: jsonb().default({}),
    rank: integer().default(0).notNull(),
    validFrom: timestamp('valid_from', {
      withTimezone: true,
      mode: 'string',
    }).defaultNow(),
    validUntil: timestamp('valid_until', {
      withTimezone: true,
      mode: 'string',
    }),
  },
  (table) => [
    unique('roles_name_key').on(table.name),
    unique('roles_rank_unique').on(table.rank),
    pgPolicy('view_roles', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
      using: sql`cms.verify_admin_access()`,
    }),
    pgPolicy('update_roles', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
    pgPolicy('delete_roles', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
    }),
    pgPolicy('insert_roles', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('restrict_mfa_roles', {
      as: 'restrictive',
      for: 'all',
      to: ['authenticated'],
    }),
    check('roles_metadata_check', sql`jsonb_typeof(metadata) = 'object'::text`),
    check('roles_rank_check', sql`rank >= 0`),
    check('roles_rank_check1', sql`rank <= 100`),
    check(
      'valid_time_range',
      sql`(valid_from IS NULL) OR (valid_until IS NULL) OR (valid_from < valid_until)`,
    ),
  ],
);

export const accountsInCms = cms.table(
  'accounts',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    authUserId: uuid('auth_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    metadata: jsonb().default({ username: '', picture_url: '' }).notNull(),
    preferences: jsonb().default({ language: 'en-US', timezone: '' }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.authUserId],
      foreignColumns: [users.id],
      name: 'accounts_auth_user_id_fkey',
    }).onDelete('cascade'),
    unique('accounts_auth_user_id_key').on(table.authUserId),
    pgPolicy('select_accounts', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
      using: sql`cms.verify_admin_access()`,
    }),
    pgPolicy('update_accounts', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
    pgPolicy('delete_accounts', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
    }),
    pgPolicy('restrict_mfa_accounts', {
      as: 'restrictive',
      for: 'all',
      to: ['authenticated'],
    }),
    check(
      'accounts_metadata_check',
      sql`jsonb_typeof(metadata) = 'object'::text`,
    ),
    check(
      'accounts_preferences_check',
      sql`jsonb_typeof(preferences) = 'object'::text`,
    ),
  ],
);

export const permissionGroupsInCms = cms.table(
  'permission_groups',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: varchar({ length: 100 }).notNull(),
    description: text(),
    metadata: jsonb().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    createdBy: uuid('created_by').default(
      sql`cms.get_current_user_account_id()`,
    ),
    validFrom: timestamp('valid_from', {
      withTimezone: true,
      mode: 'string',
    }).defaultNow(),
    validUntil: timestamp('valid_until', {
      withTimezone: true,
      mode: 'string',
    }),
  },
  (table) => [
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [accountsInCms.id],
      name: 'permission_groups_created_by_fkey',
    }),
    unique('permission_groups_name_key').on(table.name),
    pgPolicy('view_permissions_groups', {
      as: 'permissive',
      for: 'select',
      to: ['public'],
      using: sql`cms.can_view_permission_group(cms.get_current_user_account_id(), id)`,
    }),
    pgPolicy('update_permissions_groups', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
    pgPolicy('delete_permissions_groups', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
    }),
    pgPolicy('insert_permission_groups', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('restrict_mfa_permission_groups', {
      as: 'restrictive',
      for: 'all',
      to: ['authenticated'],
    }),
    check(
      'permission_groups_metadata_check',
      sql`jsonb_typeof(metadata) = 'object'::text`,
    ),
    check(
      'valid_time_range',
      sql`(valid_from IS NULL) OR (valid_until IS NULL) OR (valid_from < valid_until)`,
    ),
  ],
);

export const permissionsInCms = cms.table(
  'permissions',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: varchar({ length: 100 }).notNull(),
    description: varchar({ length: 500 }),
    permissionType: permissionTypeInCms('permission_type').notNull(),
    systemResource: systemResourceInCms('system_resource'),
    scope: permissionScopeInCms(),
    schemaName: varchar('schema_name', { length: 64 }),
    tableName: varchar('table_name', { length: 64 }),
    columnName: varchar('column_name', { length: 64 }),
    action: systemActionInCms().notNull(),
    constraints: jsonb(),
    conditions: jsonb(),
    metadata: jsonb().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_permissions_scope_schema_table').using(
      'btree',
      table.scope.asc().nullsLast().op('text_ops'),
      table.schemaName.asc().nullsLast().op('enum_ops'),
      table.tableName.asc().nullsLast().op('enum_ops'),
    ),
    index('idx_permissions_type_resource').using(
      'btree',
      table.permissionType.asc().nullsLast().op('enum_ops'),
      table.systemResource.asc().nullsLast().op('enum_ops'),
    ),
    unique('permissions_name_unique').on(table.name),
    pgPolicy('view_permissions', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
      using: sql`cms.verify_admin_access()`,
    }),
    pgPolicy('insert_permissions', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('update_permissions', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
    pgPolicy('delete_permissions', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
    }),
    pgPolicy('restrict_mfa_permissions', {
      as: 'restrictive',
      for: 'all',
      to: ['authenticated'],
    }),
    check(
      'valid_permission_type',
      sql`((permission_type = 'system'::cms.permission_type) AND (system_resource IS NOT NULL) AND (scope IS NULL) AND (schema_name IS NULL) AND (table_name IS NULL) AND (column_name IS NULL)) OR ((permission_type = 'data'::cms.permission_type) AND (scope IS NOT NULL) AND (((scope = 'table'::cms.permission_scope) AND (schema_name IS NOT NULL) AND (table_name IS NOT NULL) AND (column_name IS NULL)) OR ((scope = 'column'::cms.permission_scope) AND (schema_name IS NOT NULL) AND (table_name IS NOT NULL) AND (column_name IS NOT NULL)))) OR ((scope = 'storage'::cms.permission_scope) AND ((metadata ->> 'bucket_name'::text) IS NOT NULL) AND ((metadata ->> 'path_pattern'::text) IS NOT NULL))`,
    ),
    check(
      'permissions_schema_name_check',
      sql`(scope = 'storage'::cms.permission_scope) OR ((schema_name)::text ~ '^[a-zA-Z_][a-zA-Z0-9_]*$'::text) OR ((schema_name)::text = '*'::text)`,
    ),
    check(
      'permissions_column_name_check',
      sql`(scope = 'storage'::cms.permission_scope) OR ((column_name)::text ~ '^[a-zA-Z_][a-zA-Z0-9_]*$'::text) OR ((column_name)::text = '*'::text)`,
    ),
  ],
);

export const savedViewsInCms = cms.table(
  'saved_views',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    description: varchar({ length: 500 }),
    viewType: varchar('view_type', { length: 50 }).notNull(),
    config: jsonb().notNull(),
    createdBy: uuid('created_by').default(
      sql`cms.get_current_user_account_id()`,
    ),
    schemaName: varchar('schema_name', { length: 64 }).notNull(),
    tableName: varchar('table_name', { length: 64 }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [accountsInCms.id],
      name: 'saved_views_created_by_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.schemaName, table.tableName],
      foreignColumns: [
        tableMetadataInCms.schemaName,
        tableMetadataInCms.tableName,
      ],
      name: 'saved_views_schema_name_table_name_fkey',
    }).onDelete('cascade'),
    pgPolicy('insert_saved_views', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
      withCheck: sql`(created_by = cms.get_current_user_account_id())`,
    }),
    pgPolicy('update_saved_views', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
    pgPolicy('delete_saved_views', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
    }),
    pgPolicy('view_personal_saved_views', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('view_shared_saved_views', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
    }),
    pgPolicy('restrict_mfa_saved_views', {
      as: 'restrictive',
      for: 'all',
      to: ['authenticated'],
    }),
    check(
      'saved_views_schema_name_check',
      sql`(schema_name)::text ~ '^[a-zA-Z_][a-zA-Z0-9_]*$'::text`,
    ),
    check(
      'saved_views_table_name_check',
      sql`(table_name)::text ~ '^[a-zA-Z_][a-zA-Z0-9_]*$'::text`,
    ),
  ],
);

export const auditLogsInCms = cms.table(
  'audit_logs',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    accountId: uuid('account_id'),
    userId: uuid('user_id').default(sql`auth.uid()`),
    operation: text().notNull(),
    schemaName: text('schema_name').notNull(),
    tableName: text('table_name').notNull(),
    recordId: text('record_id'),
    oldData: jsonb('old_data'),
    newData: jsonb('new_data'),
    severity: auditLogSeverityInCms().notNull(),
    metadata: jsonb(),
    // Instantánea del autor (F2.7a): sin FK, sobrevive al borrado del
    // miembro. La rellena un *trigger*; `actor_email` no es legible
    // directamente por `authenticated` (se lee por la vista).
    actorUserId: uuid('actor_user_id'),
    actorAccountId: uuid('actor_account_id'),
    actorEmail: text('actor_email'),
  },
  (table) => [
    index('idx_audit_logs_account_id').using(
      'btree',
      table.accountId.asc().nullsLast().op('uuid_ops'),
    ),
    index('idx_audit_logs_created_at').using(
      'btree',
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    index('idx_audit_logs_operation').using(
      'btree',
      table.operation.asc().nullsLast().op('text_ops'),
    ),
    index('idx_audit_logs_schema_table').using(
      'btree',
      table.schemaName.asc().nullsLast().op('text_ops'),
      table.tableName.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.accountId],
      foreignColumns: [accountsInCms.id],
      name: 'audit_logs_account_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'audit_logs_user_id_fkey',
    }).onDelete('set null'),
    pgPolicy('select_cms_audit_logs', {
      as: 'permissive',
      for: 'select',
      to: ['public'],
      using: sql`cms.can_read_audit_log(account_id)`,
    }),
    // Sin política de INSERT: solo las funciones del sistema escriben en la
    // auditoría (ver `47-cms-audit-logs.sql`, F2.6).
    pgPolicy('restrict_mfa_audit_logs', {
      as: 'restrictive',
      for: 'all',
      to: ['authenticated'],
    }),
  ],
);

/**
 * Vista de lectura del registro de auditoría (`cms.audit_logs_readable`,
 * endurecimiento F2.6).
 *
 * `authenticated` no puede leer `record_id`, `old_data` ni `new_data`
 * directamente de `cms.audit_logs` (SELECT por columnas): la vista los
 * devuelve ya redactados por la base de datos (`null` y
 * `dataRedacted = true` si el lector no puede consultar la tabla auditada).
 * Es `security_invoker`, así que las políticas RLS de la tabla siguen
 * filtrando las entradas. Se declara con `.existing()` porque la define el
 * esquema SQL (`47-cms-audit-logs.sql`), no Drizzle.
 */
export const auditLogsReadableInCms = cms
  .view('audit_logs_readable', {
    id: uuid().notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    accountId: uuid('account_id'),
    userId: uuid('user_id'),
    operation: text().notNull(),
    schemaName: text('schema_name').notNull(),
    tableName: text('table_name').notNull(),
    recordId: text('record_id'),
    oldData: jsonb('old_data'),
    newData: jsonb('new_data'),
    dataRedacted: boolean('data_redacted').notNull(),
    severity: auditLogSeverityInCms().notNull(),
    metadata: jsonb(),
    // Instantánea del autor (F2.7a). `actor_email` llega a `null` si el
    // lector no puede ver miembros ni usuarios
    // (`cms.get_audit_log_actor_email`).
    actorUserId: uuid('actor_user_id'),
    actorAccountId: uuid('actor_account_id'),
    actorEmail: text('actor_email'),
  })
  .existing();

export const configurationInCms = cms.table(
  'configuration',
  {
    key: varchar({ length: 100 }).primaryKey().notNull(),
    value: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  () => [
    pgPolicy('read_configuration_value', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
      using: sql`cms.account_has_admin_access()`,
    }),
    pgPolicy('update_configuration_value', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
    pgPolicy('delete_configuration_value', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
    }),
    pgPolicy('insert_configuration_value', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('restrict_mfa_configuration', {
      as: 'restrictive',
      for: 'all',
      to: ['authenticated'],
    }),
  ],
);

export const dashboardsInCms = cms.table(
  'dashboards',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    createdBy: uuid('created_by')
      .default(sql`cms.get_current_user_account_id()`)
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_dashboards_created_by').using(
      'btree',
      table.createdBy.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [accountsInCms.id],
      name: 'dashboards_created_by_fkey',
    }).onDelete('cascade'),
    pgPolicy('delete_dashboards', {
      as: 'permissive',
      for: 'delete',
      to: ['public'],
      using: sql`(created_by = cms.get_current_user_account_id())`,
    }),
    pgPolicy('select_dashboards', {
      as: 'permissive',
      for: 'select',
      to: ['public'],
    }),
    pgPolicy('insert_dashboards', {
      as: 'permissive',
      for: 'insert',
      to: ['public'],
    }),
    pgPolicy('update_dashboards', {
      as: 'permissive',
      for: 'update',
      to: ['public'],
    }),
    check('dashboards_name_check', sql`length(TRIM(BOTH FROM name)) >= 3`),
  ],
);

export const dashboardWidgetsInCms = cms.table(
  'dashboard_widgets',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    dashboardId: uuid('dashboard_id').notNull(),
    widgetType: dashboardWidgetTypeInCms('widget_type').notNull(),
    title: varchar({ length: 255 }).notNull(),
    config: jsonb().default({}).notNull(),
    position: jsonb().notNull(),
    schemaName: varchar('schema_name', { length: 64 }).notNull(),
    tableName: varchar('table_name', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_dashboard_widgets_dashboard').using(
      'btree',
      table.dashboardId.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.dashboardId],
      foreignColumns: [dashboardsInCms.id],
      name: 'dashboard_widgets_dashboard_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.schemaName, table.tableName],
      foreignColumns: [
        tableMetadataInCms.schemaName,
        tableMetadataInCms.tableName,
      ],
      name: 'dashboard_widgets_schema_name_table_name_fkey',
    }).onDelete('cascade'),
    pgPolicy('select_widgets', {
      as: 'permissive',
      for: 'select',
      to: ['public'],
      using: sql`cms.can_access_dashboard(dashboard_id)`,
    }),
    pgPolicy('insert_widgets', {
      as: 'permissive',
      for: 'insert',
      to: ['public'],
    }),
    pgPolicy('update_widgets', {
      as: 'permissive',
      for: 'update',
      to: ['public'],
    }),
    pgPolicy('delete_widgets', {
      as: 'permissive',
      for: 'delete',
      to: ['public'],
    }),
    check(
      'position_valid',
      sql`("position" ? 'x'::text) AND ("position" ? 'y'::text) AND ("position" ? 'w'::text) AND ("position" ? 'h'::text) AND ((("position" -> 'x'::text))::numeric >= (0)::numeric) AND ((("position" -> 'y'::text))::numeric >= (0)::numeric) AND ((("position" -> 'w'::text))::numeric > (0)::numeric) AND ((("position" -> 'h'::text))::numeric > (0)::numeric)`,
    ),
  ],
);

export const savedViewRolesInCms = cms.table(
  'saved_view_roles',
  {
    viewId: uuid('view_id').notNull(),
    roleId: uuid('role_id').notNull(),
  },
  (table) => [
    index('idx_saved_view_roles_role_id').using(
      'btree',
      table.roleId.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.viewId],
      foreignColumns: [savedViewsInCms.id],
      name: 'saved_view_roles_view_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [rolesInCms.id],
      name: 'saved_view_roles_role_id_fkey',
    }).onDelete('cascade'),
    primaryKey({
      columns: [table.viewId, table.roleId],
      name: 'saved_view_roles_pkey',
    }),
    pgPolicy('view_personal_saved_view_roles', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
      using: sql`cms.account_has_role(cms.get_current_user_account_id(), role_id)`,
    }),
    pgPolicy('insert_shared_saved_views', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('restrict_mfa_saved_view_roles', {
      as: 'restrictive',
      for: 'all',
      to: ['authenticated'],
    }),
  ],
);

export const dashboardRoleSharesInCms = cms.table(
  'dashboard_role_shares',
  {
    dashboardId: uuid('dashboard_id').notNull(),
    roleId: uuid('role_id').notNull(),
    permissionLevel: dashboardPermissionLevelInCms('permission_level')
      .default('view')
      .notNull(),
    grantedBy: uuid('granted_by').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_dashboard_role_shares_dashboard').using(
      'btree',
      table.dashboardId.asc().nullsLast().op('uuid_ops'),
    ),
    index('idx_dashboard_role_shares_role').using(
      'btree',
      table.roleId.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.dashboardId],
      foreignColumns: [dashboardsInCms.id],
      name: 'dashboard_role_shares_dashboard_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [rolesInCms.id],
      name: 'dashboard_role_shares_role_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.grantedBy],
      foreignColumns: [accountsInCms.id],
      name: 'dashboard_role_shares_granted_by_fkey',
    }),
    primaryKey({
      columns: [table.dashboardId, table.roleId],
      name: 'dashboard_role_shares_pkey',
    }),
    pgPolicy('manage_shares', {
      as: 'permissive',
      for: 'all',
      to: ['public'],
      using: sql`(EXISTS ( SELECT 1
   FROM cms.dashboards d
  WHERE ((d.id = dashboard_role_shares.dashboard_id) AND (d.created_by = cms.get_current_user_account_id()))))`,
    }),
  ],
);

export const permissionGroupPermissionsInCms = cms.table(
  'permission_group_permissions',
  {
    groupId: uuid('group_id').notNull(),
    permissionId: uuid('permission_id').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    addedBy: uuid('added_by'),
    conditions: jsonb(),
    metadata: jsonb().default({}),
  },
  (table) => [
    index('idx_permission_group_permissions_group').using(
      'btree',
      table.groupId.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.groupId],
      foreignColumns: [permissionGroupsInCms.id],
      name: 'permission_group_permissions_group_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.permissionId],
      foreignColumns: [permissionsInCms.id],
      name: 'permission_group_permissions_permission_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.addedBy],
      foreignColumns: [accountsInCms.id],
      name: 'permission_group_permissions_added_by_fkey',
    }),
    primaryKey({
      columns: [table.groupId, table.permissionId],
      name: 'permission_group_permissions_pkey',
    }),
    pgPolicy('view_permission_group_permissions', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
      using: sql`cms.can_view_permission_group(cms.get_current_user_account_id(), group_id)`,
    }),
    pgPolicy('insert_permission_group_permissions', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('update_permission_group_permissions', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
    pgPolicy('delete_permission_group_permissions', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
    }),
    pgPolicy('restrict_mfa_permission_groups_permissions', {
      as: 'restrictive',
      for: 'all',
      to: ['authenticated'],
    }),
  ],
);

export const accountRolesInCms = cms.table(
  'account_roles',
  {
    accountId: uuid('account_id').notNull(),
    roleId: uuid('role_id').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    assignedBy: uuid('assigned_by'),
    validFrom: timestamp('valid_from', {
      withTimezone: true,
      mode: 'string',
    }).defaultNow(),
    validUntil: timestamp('valid_until', {
      withTimezone: true,
      mode: 'string',
    }),
    metadata: jsonb().default({}),
  },
  (table) => [
    index('idx_account_roles_account_id').using(
      'btree',
      table.accountId.asc().nullsLast().op('uuid_ops'),
    ),
    index('idx_account_roles_role_id').using(
      'btree',
      table.roleId.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.accountId],
      foreignColumns: [accountsInCms.id],
      name: 'account_roles_account_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [rolesInCms.id],
      name: 'account_roles_role_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.assignedBy],
      foreignColumns: [accountsInCms.id],
      name: 'account_roles_assigned_by_fkey',
    }),
    primaryKey({
      columns: [table.accountId, table.roleId],
      name: 'account_roles_pkey',
    }),
    unique('account_roles_account_id_key').on(table.accountId),
    pgPolicy('view_account_roles', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
      using: sql`cms.verify_admin_access()`,
    }),
    pgPolicy('insert_account_roles', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('update_account_roles', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
    pgPolicy('delete_account_roles', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
    }),
    pgPolicy('restrict_mfa_account_roles', {
      as: 'restrictive',
      for: 'all',
      to: ['authenticated'],
    }),
    check(
      'valid_time_range',
      sql`(valid_from IS NULL) OR (valid_until IS NULL) OR (valid_from < valid_until)`,
    ),
  ],
);

export const rolePermissionGroupsInCms = cms.table(
  'role_permission_groups',
  {
    roleId: uuid('role_id').notNull(),
    groupId: uuid('group_id').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    assignedBy: uuid('assigned_by'),
    validFrom: timestamp('valid_from', {
      withTimezone: true,
      mode: 'string',
    }).defaultNow(),
    validUntil: timestamp('valid_until', {
      withTimezone: true,
      mode: 'string',
    }),
    metadata: jsonb().default({}),
  },
  (table) => [
    index('idx_role_permission_groups_valid')
      .using('btree', table.validUntil.asc().nullsLast().op('timestamptz_ops'))
      .where(sql`(valid_until IS NOT NULL)`),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [rolesInCms.id],
      name: 'role_permission_groups_role_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.groupId],
      foreignColumns: [permissionGroupsInCms.id],
      name: 'role_permission_groups_group_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.assignedBy],
      foreignColumns: [accountsInCms.id],
      name: 'role_permission_groups_assigned_by_fkey',
    }),
    primaryKey({
      columns: [table.roleId, table.groupId],
      name: 'role_permission_groups_pkey',
    }),
    pgPolicy('view_role_permission_groups', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
      using: sql`cms.can_view_role_permission_group(cms.get_current_user_account_id(), role_id)`,
    }),
    pgPolicy('insert_role_permission_groups', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('update_role_permission_groups', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
    pgPolicy('delete_role_permission_groups', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
    }),
    pgPolicy('restrict_mfa_role_permission_groups', {
      as: 'restrictive',
      for: 'all',
      to: ['authenticated'],
    }),
    check(
      'valid_time_range',
      sql`(valid_from IS NULL) OR (valid_until IS NULL) OR (valid_from < valid_until)`,
    ),
  ],
);

export const accountPermissionsInCms = cms.table(
  'account_permissions',
  {
    accountId: uuid('account_id').notNull(),
    permissionId: uuid('permission_id').notNull(),
    isGrant: boolean('is_grant').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    grantedBy: uuid('granted_by'),
    validFrom: timestamp('valid_from', {
      withTimezone: true,
      mode: 'string',
    }).defaultNow(),
    validUntil: timestamp('valid_until', {
      withTimezone: true,
      mode: 'string',
    }),
    metadata: jsonb().default({}),
  },
  (table) => [
    foreignKey({
      columns: [table.accountId],
      foreignColumns: [accountsInCms.id],
      name: 'account_permissions_account_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.permissionId],
      foreignColumns: [permissionsInCms.id],
      name: 'account_permissions_permission_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.grantedBy],
      foreignColumns: [accountsInCms.id],
      name: 'account_permissions_granted_by_fkey',
    }),
    primaryKey({
      columns: [table.accountId, table.permissionId],
      name: 'account_permissions_pkey',
    }),
    pgPolicy('view_account_permissions', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
      using: sql`((account_id = cms.get_current_user_account_id()) OR (cms.has_admin_permission('permission'::cms.system_resource, 'select'::cms.system_action) AND (cms.get_user_max_role_rank(cms.get_current_user_account_id()) > cms.get_user_max_role_rank(account_id))))`,
    }),
    pgPolicy('insert_account_permissions', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('update_account_permissions', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
    pgPolicy('delete_account_permissions', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
    }),
    pgPolicy('restrict_mfa_account_permissions', {
      as: 'restrictive',
      for: 'all',
      to: ['authenticated'],
    }),
    check(
      'valid_time_range',
      sql`(valid_from IS NULL) OR (valid_until IS NULL) OR (valid_from < valid_until)`,
    ),
  ],
);

export const rolePermissionsInCms = cms.table(
  'role_permissions',
  {
    roleId: uuid('role_id').notNull(),
    permissionId: uuid('permission_id').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    grantedBy: uuid('granted_by'),
    validFrom: timestamp('valid_from', {
      withTimezone: true,
      mode: 'string',
    }).defaultNow(),
    validUntil: timestamp('valid_until', {
      withTimezone: true,
      mode: 'string',
    }),
    conditions: jsonb(),
    metadata: jsonb().default({}),
  },
  (table) => [
    index('idx_role_permissions_permission_id').using(
      'btree',
      table.permissionId.asc().nullsLast().op('uuid_ops'),
    ),
    index('idx_role_permissions_role_id').using(
      'btree',
      table.roleId.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [rolesInCms.id],
      name: 'role_permissions_role_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.permissionId],
      foreignColumns: [permissionsInCms.id],
      name: 'role_permissions_permission_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.grantedBy],
      foreignColumns: [accountsInCms.id],
      name: 'role_permissions_granted_by_fkey',
    }),
    primaryKey({
      columns: [table.roleId, table.permissionId],
      name: 'role_permissions_pkey',
    }),
    pgPolicy('view_role_permissions', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
      using: sql`(EXISTS ( SELECT 1
   FROM cms.account_roles ar
  WHERE ((ar.account_id = cms.get_current_user_account_id()) AND (ar.role_id = ar.role_id))))`,
    }),
    pgPolicy('insert_role_permissions', {
      as: 'permissive',
      for: 'insert',
      to: ['authenticated'],
    }),
    pgPolicy('update_role_permissions', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
    pgPolicy('delete_role_permissions', {
      as: 'permissive',
      for: 'delete',
      to: ['authenticated'],
    }),
    pgPolicy('restrict_mfa_role_permissions', {
      as: 'restrictive',
      for: 'all',
      to: ['authenticated'],
    }),
    check(
      'valid_time_range',
      sql`(valid_from IS NULL) OR (valid_until IS NULL) OR (valid_from < valid_until)`,
    ),
  ],
);

export const tableMetadataInCms = cms.table(
  'table_metadata',
  {
    schemaName: varchar('schema_name', { length: 64 }).notNull(),
    tableName: varchar('table_name', { length: 64 }).notNull(),
    displayName: varchar('display_name', { length: 255 }),
    description: text(),
    displayFormat: text('display_format'),
    isVisible: boolean('is_visible').default(true),
    ordering: integer(),
    keysConfig: jsonb('keys_config').default({}),
    columnsConfig: jsonb('columns_config').default({}),
    relationsConfig: jsonb('relations_config').default([]),
    uiConfig: jsonb('ui_config').default({}),
    isSearchable: boolean('is_searchable').default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.schemaName, table.tableName],
      name: 'table_metadata_pkey',
    }),
    pgPolicy('view_table_metadata', {
      as: 'permissive',
      for: 'select',
      to: ['authenticated'],
      using: sql`cms.has_data_permission('select'::cms.system_action, schema_name, table_name)`,
    }),
    pgPolicy('update_table_metadata', {
      as: 'permissive',
      for: 'update',
      to: ['authenticated'],
    }),
    pgPolicy('restrict_mfa_table_metadata', {
      as: 'restrictive',
      for: 'all',
      to: ['authenticated'],
    }),
  ],
);
