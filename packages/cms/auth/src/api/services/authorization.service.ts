import { type SQL, sql } from 'drizzle-orm';
import type { Context } from 'hono';

// Solo tipos: trae la ampliación de `ContextVariableMap` (`drizzle`,
// `supabase`) que se declara junto al cliente Drizzle del CMS.
import type {} from '@pymekit/cms-supabase/client';

import {
  BulkPermissionBuilder,
  type PermissionCheck,
} from '../utils/bulk-permission-builder';

/**
 * Storage actions that require permission checks
 */
export type StorageAction = 'select' | 'update' | 'delete' | 'insert';

/**
 * System resources for admin permissions
 */
export type SystemResource =
  | 'role'
  | 'permission'
  | 'account'
  | 'system_setting'
  | 'table';

/**
 * System actions for permissions
 */
export type SystemAction = 'select' | 'insert' | 'update' | 'delete' | '*';

declare module 'hono' {
  interface ContextVariableMap {
    authorization: AuthorizationService;
  }
}

/**
 * Create an instance of the AuthorizationService
 * @param context - The Hono context object
 * @returns An instance of the AuthorizationService
 */
export function createAuthorizationService(context: Context) {
  return new AuthorizationService(context);
}

/**
 * Enhanced Authorization service that consolidates all permission checking logic
 * Directly mirrors the RLS functions in the database for consistent permission checks
 */
export class AuthorizationService {
  constructor(private readonly context: Context) {}

  /**
   * Get the current user's account ID
   * @returns The current user's account ID
   */
  private async getCurrentAccountId() {
    const client = this.context.get('drizzle');

    const result = await client.runTransaction(async (tx) => {
      return tx.execute<{ id: string }>(
        sql`SELECT cms.get_current_user_account_id() as id`,
      );
    });

    return result[0]?.id;
  }

  // =============================
  // ADMIN PERMISSION CHECKS
  // =============================

  /**
   * Check if user has admin access - calls cms.verify_admin_access()
   * @returns True if the user has admin access, false otherwise
   */
  async checkAdminAccess() {
    const client = this.context.get('drizzle');

    const result = await client.runTransaction(async (tx) => {
      return tx.execute<{ has_access: boolean }>(
        sql`SELECT cms.verify_admin_access() as has_access`,
      );
    });

    return result[0]?.has_access || false;
  }

  /**
   * Check if user has system resource permission - calls cms.has_admin_permission()
   * Used in multiple RLS policies
   * @param resource - The resource to check
   * @param action - The action to check
   * @returns True if the user has admin permission, false otherwise
   */
  async hasAdminPermission(resource: SystemResource, action: SystemAction) {
    const client = this.context.get('drizzle');

    const result = await client.runTransaction(async (tx) => {
      return tx.execute<{ has_permission: boolean }>(
        sql`SELECT cms.has_admin_permission(
                     ${resource}::cms.system_resource,
                     ${action}::cms.system_action
                   ) as has_permission`,
      );
    });

    return result[0]?.has_permission || false;
  }

  // =============================
  // DATA PERMISSION CHECKS
  // =============================

  /**
   * Check if user has data permission for a specific table and action
   * @param action - The action to check
   * @param schemaName - The schema name
   * @param tableName - The table name
   * @param columnName - Optional column name for column-level permissions
   * @returns True if the user has data permission, false otherwise
   */
  async hasDataPermission(
    action: SystemAction,
    schemaName: string,
    tableName: string,
    columnName?: string,
  ) {
    const client = this.context.get('drizzle');

    const result = await client.runTransaction(async (tx) => {
      // Use different query structure based on whether column is specified
      if (columnName) {
        return tx.execute<{ has_permission: boolean }>(
          sql`SELECT cms.has_data_permission(
                       ${action}::cms.system_action,
                       ${schemaName},
                       ${tableName},
                       ${columnName}
                     ) as has_permission`,
        );
      } else {
        return tx.execute<{ has_permission: boolean }>(
          sql`SELECT cms.has_data_permission(
                       ${action}::cms.system_action,
                       ${schemaName},
                       ${tableName}
                     ) as has_permission`,
        );
      }
    });

    return result[0]?.has_permission || false;
  }

  // =============================
  // STORAGE PERMISSION CHECKS
  // =============================

  /**
   * Check if user has storage permission
   * @param bucketName - The bucket name
   * @param action - The action to perform
   * @param objectPath - The object path
   * @returns True if the user has storage permission, false otherwise
   */
  async hasStoragePermission(
    bucketName: string,
    action: StorageAction,
    objectPath: string,
  ) {
    try {
      const client = this.context.get('drizzle');

      const result = await client.runTransaction(async (tx) => {
        return tx.execute<{ has_permission: boolean }>(
          sql`SELECT cms.has_storage_permission(
                       ${bucketName}, 
                       ${action}::cms.system_action, 
                       ${objectPath}
                     ) as has_permission`,
        );
      });

      return result[0]?.has_permission || false;
    } catch (error) {
      console.error('Error checking storage permission:', error);
      // Fail securely - deny access if permission check fails
      return false;
    }
  }

  // =============================
  // ROLE PERMISSION CHECKS
  // =============================

  /**
   * Check if user can modify a role - calls cms.can_action_role()
   * @param roleId - The role ID
   * @param action - The action to check
   * @returns True if the user can action the role, false otherwise
   */
  async canActionRole(roleId: string, action: 'update' | 'delete' | 'insert') {
    const client = this.context.get('drizzle');

    const result = await client.runTransaction(async (tx) => {
      return tx.execute<{ can_action: boolean }>(
        sql`SELECT cms.can_action_role(${roleId}::uuid, ${action}::cms.system_action) as can_action`,
      );
    });

    return result[0]?.can_action || false;
  }

  /**
   * Check if user can delete a role - calls cms.can_delete_role()
   * @param roleId - The role ID
   * @returns True if the user can delete the role, false otherwise
   */
  async canDeleteRole(roleId: string) {
    const client = this.context.get('drizzle');

    const result = await client.runTransaction(async (tx) => {
      return tx.execute<{ can_delete: boolean }>(
        sql`SELECT cms.can_delete_role(${roleId}::uuid) as can_delete`,
      );
    });

    return result[0]?.can_delete || false;
  }

  // =============================
  // ACCOUNT PERMISSION CHECKS
  // =============================

  /**
   * Check if user can action another account - calls cms.can_action_account()
   * @param targetAccountId - The target account ID
   * @param action - The action to check
   * @returns True if the user can action the account, false otherwise
   */
  async canActionAccount(targetAccountId: string, action: 'update' | 'delete') {
    const client = this.context.get('drizzle');

    const result = await client.runTransaction(async (tx) => {
      return tx.execute<{ can_action: boolean }>(
        sql`SELECT cms.can_action_account(
                     ${targetAccountId}::uuid,
                     ${action}::cms.system_action
                   ) as can_action`,
      );
    });

    return result[0]?.can_action || false;
  }

  /**
   * Check if user can modify an account role - calls cms.can_modify_account_role()
   * @param targetAccountId - The target account ID
   * @param roleId - The role ID
   * @param action - The action to check
   * @returns True if the user can modify the account role, false otherwise
   */
  async canModifyAccountRole(
    targetAccountId: string,
    roleId: string,
    action: 'insert' | 'update' | 'delete',
  ) {
    const accountId = await this.getCurrentAccountId();

    if (!accountId) {
      return false;
    }

    const client = this.context.get('drizzle');

    const result = await client.runTransaction(async (tx) => {
      return tx.execute<{ can_modify: boolean }>(
        sql`SELECT cms.can_modify_account_role(
                     ${accountId},
                     ${targetAccountId},
                     ${roleId},
                     ${action}::cms.system_action
                   ) as can_modify`,
      );
    });

    return result[0]?.can_modify || false;
  }

  // =============================
  // PERMISSION GROUP CHECKS
  // =============================

  /**
   * Check if user can modify a permission group - calls cms.can_modify_permission_group()
   * @param groupId - The group ID
   * @param action - The action to check
   * @returns True if the user can modify the permission group, false otherwise
   */
  async canModifyPermissionGroup(
    groupId: string,
    action: 'update' | 'delete' | 'insert',
  ) {
    const client = this.context.get('drizzle');

    const result = await client.runTransaction(async (tx) => {
      return tx.execute<{ can_modify: boolean }>(
        sql`SELECT cms.can_modify_permission_group(
                     ${groupId},
                     ${action}::cms.system_action
                   ) as can_modify`,
      );
    });

    return result[0]?.can_modify || false;
  }

  // =============================
  // PERMISSION CHECKS
  // =============================

  /**
   * Check if user can modify a permission - calls cms.can_modify_permission()
   * @param permissionId - The permission ID
   * @param action - The action to check
   * @returns True if the user can action the permission, false otherwise
   */
  async canActionPermission(permissionId: string, action: 'update' | 'delete') {
    const client = this.context.get('drizzle');

    const result = await client.runTransaction(async (tx) => {
      return tx.execute<{ can_modify: boolean }>(
        sql`SELECT cms.can_modify_permission(
                     ${permissionId}::uuid,
                     ${action}::cms.system_action
                   ) as can_modify`,
      );
    });

    return result[0]?.can_modify || false;
  }

  // =============================
  // ROLE HIERARCHY UTILITIES
  // =============================

  /**
   * Get user's maximum role rank - calls cms.get_user_max_role_rank()
   * @returns The user's maximum role rank
   */
  async getUserMaxRoleRank() {
    const client = this.context.get('drizzle');

    const result = await client.runTransaction(async (tx) => {
      return tx.execute<{ rank: number }>(
        sql`SELECT cms.get_user_max_role_rank(cms.get_current_user_account_id()) as rank`,
      );
    });

    return result[0]?.rank || 0;
  }

  // =============================
  // ROLE PERMISSION MANAGEMENT
  // =============================

  /**
   * Check if user can manage role permissions
   * @param roleId - The role ID
   * @param action - The action to check
   * @returns True if the user can manage the role permissions, false otherwise
   */
  async canManageRolePermissions(roleId: string, action: 'insert' | 'delete') {
    return this.canActionRole(roleId, action);
  }

  /**
   * Check if user can manage role permission groups
   * @param roleId - The role ID
   * @param action - The action to check
   * @returns True if the user can manage the role permission groups, false otherwise
   */
  async canManageRolePermissionGroups(
    roleId: string,
    action: 'insert' | 'update' | 'delete',
  ) {
    const accountId = await this.getCurrentAccountId();

    if (!accountId) {
      throw new Error('No account ID found');
    }

    const client = this.context.get('drizzle');

    const result = await client.runTransaction(async (tx) => {
      return tx.execute<{ can_modify: boolean }>(
        sql`SELECT cms.can_modify_role_permission_group(
                     ${accountId},
                     ${roleId},
                     ${action}::cms.system_action
                   ) as can_modify`,
      );
    });

    return result[0]?.can_modify || false;
  }

  // =============================
  // CONVENIENCE METHODS
  // =============================

  /**
   * Check if user can create roles
   * @returns True if the user can create roles, false otherwise
   */
  async canCreateRole() {
    return this.hasAdminPermission('role', 'insert');
  }

  /**
   * Check if user can create permissions
   * @returns True if the user can create permissions, false otherwise
   */
  async canCreatePermission() {
    return this.hasAdminPermission('permission', 'insert');
  }

  /**
   * Get comprehensive access rights for UI components
   * @returns Object with common permission flags
   */
  async getAccessRights() {
    const [canCreateRole, canCreatePermission, hasAdminAccess, userRank] =
      await Promise.all([
        this.canCreateRole(),
        this.canCreatePermission(),
        this.checkAdminAccess(),
        this.getUserMaxRoleRank().catch(() => 0),
      ]);

    return {
      canCreateRole,
      canCreatePermission,
      canCreatePermissionGroup: canCreatePermission,
      hasAdminAccess,
      userRank,
      roleRank: userRank, // Backwards compatibility alias
    };
  }

  /**
   * Devuelve qué secciones de la interfaz del CMS puede usar el usuario.
   *
   * La consola de administración lo usa para decidir qué entradas del grupo
   * «CMS» de la barra lateral se muestran (usuarios, almacenamiento y
   * auditoría). Se calcula en UNA sola transacción con las mismas funciones
   * SQL que aplican después las rutas y las políticas RLS, para que la
   * interfaz y la autorización real no puedan divergir:
   *
   *  - `users`: `has_admin_permission('auth_user', 'select')`, la misma
   *    comprobación que hace el explorador de usuarios.
   *  - `auditLogs`: `has_admin_permission('log', 'select')`, requisito previo
   *    de `can_read_audit_log`.
   *  - `storage`: existe algún permiso de datos con ámbito `storage` y acción
   *    `select` (o `*`) concedido a la cuenta. Es una aproximación: el acceso
   *    real a cada bucket y ruta lo decide `has_storage_permission`.
   *  - `members` (pestaña Ajustes > Miembros, F2.7a):
   *    `has_admin_permission('account', 'select')`, lo mismo que exige la
   *    API de miembros.
   *  - `systemSettings` (pestaña Ajustes > Autenticación, F2.7a): permiso
   *    `system_setting` de lectura o de escritura; cambiar la opción exige
   *    además `update` (y, para desactivar el MFA, ser cuenta raíz con aal2).
   *
   * Ocultar una entrada es solo una ayuda de interfaz: si alguien navega a
   * la ruta, la API vuelve a comprobar el permiso concreto.
   *
   * [TFG] RF-09 · ADR-014: la visibilidad de la interfaz se deriva del RBAC
   * del CMS, no de una lista fija por rol.
   */
  async getSectionAccess() {
    const client = this.context.get('drizzle');

    const result = await client.runTransaction(async (tx) => {
      return tx.execute<{
        users: boolean | null;
        audit_logs: boolean | null;
        storage: boolean | null;
        members: boolean | null;
        system_settings: boolean | null;
      }>(
        sql`SELECT
              cms.has_admin_permission('auth_user'::cms.system_resource, 'select'::cms.system_action) as users,
              cms.has_admin_permission('account'::cms.system_resource, 'select'::cms.system_action) as members,
              (
                cms.has_admin_permission('system_setting'::cms.system_resource, 'select'::cms.system_action)
                or cms.has_admin_permission('system_setting'::cms.system_resource, 'update'::cms.system_action)
              ) as system_settings,
              cms.has_admin_permission('log'::cms.system_resource, 'select'::cms.system_action) as audit_logs,
              exists (
                select 1
                from cms.permissions p
                where p.permission_type = 'data'
                  and p.scope = 'storage'
                  and p.action in ('select', '*')
                  and cms.has_permission(cms.get_current_user_account_id(), p.id)
              ) as storage`,
      );
    });

    const row = result[0];

    return {
      users: row?.users === true,
      auditLogs: row?.audit_logs === true,
      storage: row?.storage === true,
      members: row?.members === true,
      systemSettings: row?.system_settings === true,
    };
  }

  /**
   * Get role access rights (backwards compatibility)
   * @param roleId - The role ID
   * @returns The role access rights
   */
  async getRoleAccessRights(roleId: string) {
    const [
      canUpdate,
      canDelete,
      canManagePermissions,
      canManagePermissionGroups,
      maxRank,
    ] = await Promise.all([
      this.canActionRole(roleId, 'update'),
      this.canDeleteRole(roleId),
      this.canManageRolePermissions(roleId, 'insert'),
      this.canManageRolePermissionGroups(roleId, 'insert'),
      this.getUserMaxRoleRank(),
    ]);

    return {
      canUpdate,
      canDelete,
      canManagePermissions,
      canManagePermissionGroups,
      maxRank,
    };
  }

  /**
   * Get permission group access rights (backwards compatibility)
   * @param groupId - The group ID
   * @returns The permission group access rights
   */
  async getPermissionGroupAccessRights(groupId: string) {
    const [canUpdate, canDelete] = await Promise.all([
      this.canModifyPermissionGroup(groupId, 'update'),
      this.canModifyPermissionGroup(groupId, 'delete'),
    ]);

    return {
      canUpdate,
      canDelete,
      canManagePermissions: canUpdate,
    };
  }

  /**
   * Get permission access rights (backwards compatibility)
   * @param permissionId - The permission ID
   * @returns The permission access rights
   */
  async getPermissionAccessRights(permissionId: string) {
    const [canUpdate, canDelete, canCreate] = await Promise.all([
      this.canActionPermission(permissionId, 'update'),
      this.canActionPermission(permissionId, 'delete'),
      this.hasAdminPermission('permission', 'insert'),
    ]);

    return {
      canUpdate,
      canDelete,
      canCreate,
    };
  }

  /**
   * Get entity-specific access rights for a permission in a single transaction
   * @param permissionId - The specific permission ID to check permissions for
   * @returns Access rights for the specific permission
   */
  async getPermissionEntityAccessRights(permissionId: string): Promise<{
    canUpdate: boolean;
    canDelete: boolean;
  }> {
    const [canUpdate, canDelete] = await Promise.all([
      this.canActionPermission(permissionId, 'update'),
      this.canActionPermission(permissionId, 'delete'),
    ]);

    return {
      canUpdate,
      canDelete,
    };
  }

  // =============================
  // BULK PERMISSION CHECKS
  // =============================

  /**
   * Check table CRUD permissions in a single transaction
   * @param schema - The schema name
   * @param table - The table name
   * @returns Promise with CRUD permission results
   */
  async getTableCRUDPermissions(
    schema: string,
    table: string,
  ): Promise<{
    canSelect: boolean;
    canInsert: boolean;
    canUpdate: boolean;
    canDelete: boolean;
  }> {
    const checks = BulkPermissionBuilder.builders.tableCRUD(
      'table',
      schema,
      table,
    );
    const results = await this.checkBulkPermissions(checks);

    return {
      canSelect: Boolean(results['table_select']),
      canInsert: Boolean(results['table_insert']),
      canUpdate: Boolean(results['table_update']),
      canDelete: Boolean(results['table_delete']),
    };
  }

  /**
   * Check multiple data permissions in a single transaction
   * @param dataChecks - Array of data permission checks
   * @returns Promise with data permission results
   */
  async checkBulkDataPermissions(
    dataChecks: Array<{
      key: string;
      action: SystemAction;
      schema: string;
      table: string;
      column?: string;
    }>,
  ): Promise<Record<string, boolean>> {
    const checks: PermissionCheck[] = dataChecks.map((check) => ({
      type: 'data',
      key: check.key,
      action: check.action,
      schema: check.schema,
      table: check.table,
      column: check.column,
    }));

    const results = await this.checkBulkPermissions(checks);

    // Convert to boolean results only
    const booleanResults: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(results)) {
      booleanResults[key] = Boolean(value);
    }

    return booleanResults;
  }

  /**
   * Check multiple admin permissions in a single transaction
   * @param adminChecks - Array of admin permission checks
   * @returns Promise with admin permission results
   */
  async checkBulkAdminPermissions(
    adminChecks: Array<{
      key: string;
      resource: SystemResource;
      action: SystemAction;
    }>,
  ): Promise<Record<string, boolean>> {
    const checks: PermissionCheck[] = adminChecks.map((check) => ({
      type: 'admin',
      key: check.key,
      resource: check.resource,
      action: check.action,
    }));

    const results = await this.checkBulkPermissions(checks);

    // Convert to boolean results only
    const booleanResults: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(results)) {
      booleanResults[key] = Boolean(value);
    }

    return booleanResults;
  }

  /**
   * Core bulk permission checker - handles any type of permission checks
   * @param checks - Array of permission checks to perform
   * @returns Promise with results keyed by check key
   */
  private async checkBulkPermissions(
    checks: PermissionCheck[],
  ): Promise<Record<string, boolean | string | number>> {
    if (checks.length === 0) {
      return {};
    }

    const client = this.context.get('drizzle');

    // Build the UNION ALL query using the comprehensive builder
    const { query, params } = BulkPermissionBuilder.buildQuery(checks);

    // [TFG] RNF-02 · Corrección de seguridad de PymeKit (BITACORA B-24).
    // El código heredado sustituía `$1`, `$2`… a mano dentro del texto SQL,
    // escapando solo las comillas, y lo ejecutaba con `sql.raw`. Un valor que
    // contuviera a su vez la cadena `$2` (un nombre de tabla enviado por el
    // cliente, por ejemplo) recibía la siguiente sustitución dentro de su
    // literal y rompía el entrecomillado: inyección SQL. Ahora cada marcador
    // `$n` se convierte en un parámetro enlazado de Drizzle, de modo que los
    // valores nunca forman parte del texto de la consulta. El texto que queda
    // entre marcadores lo genera `BulkPermissionBuilder` (sin datos del
    // usuario), por eso puede ir con `sql.raw`.
    const statement = buildParameterizedStatement(query, params);

    const result = await client.runTransaction(async (tx) => {
      return tx.execute<{
        key: string;
        type: 'boolean' | 'string' | 'number';
        result: unknown;
      }>(statement);
    });

    // Parse results using the builder's parser
    return BulkPermissionBuilder.parseResults(result);
  }
}

/**
 * Convierte una consulta con marcadores posicionales (`$1`, `$2`…) y su lista
 * de valores en una sentencia de Drizzle con parámetros enlazados.
 *
 * El texto entre marcadores se incluye tal cual (lo genera el propio
 * servidor); cada marcador se sustituye por un parámetro, que el driver envía
 * aparte del texto SQL. Un marcador sin valor correspondiente es un error de
 * programación y se rechaza.
 */
export function buildParameterizedStatement(
  query: string,
  params: ReadonlyArray<unknown>,
) {
  const parts = query.split(/\$(\d+)/);
  const chunks: SQL[] = [];

  parts.forEach((part, index) => {
    // Las posiciones pares son texto; las impares, el número del marcador.
    if (index % 2 === 0) {
      if (part) {
        chunks.push(sql.raw(part));
      }

      return;
    }

    const position = Number(part) - 1;

    if (position < 0 || position >= params.length) {
      throw new Error(`Missing value for placeholder $${part}`);
    }

    chunks.push(sql`${params[position]}`);
  });

  return sql.join(chunks, sql.raw(''));
}
