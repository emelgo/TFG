import { sql } from 'drizzle-orm';
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
  // BULK STORAGE PERMISSIONS
  // =============================

  /**
   * Get user permissions for multiple storage paths in a single optimized query
   * @param bucketName - The bucket name
   * @param objectPaths - Array of object paths
   * @returns Promise with permissions map keyed by path
   */
  async getBulkStoragePermissions(
    bucketName: string,
    objectPaths: string[],
  ): Promise<
    Map<
      string,
      {
        canRead: boolean;
        canUpdate: boolean;
        canDelete: boolean;
        canUpload: boolean;
      }
    >
  > {
    const permissionsMap = new Map<
      string,
      {
        canRead: boolean;
        canUpdate: boolean;
        canDelete: boolean;
        canUpload: boolean;
      }
    >();

    if (objectPaths.length === 0) {
      return permissionsMap;
    }

    try {
      const client = this.context.get('drizzle');

      // Convert paths to proper format (with leading slash)
      const formattedPaths = objectPaths.map((path) => {
        return path.startsWith('/') ? path : `/${path}`;
      });

      const bucketNameParam = bucketName;
      const pathsArrayLiteral = `ARRAY[${formattedPaths.map((p) => `'${p.replace(/'/g, "''")}'`).join(',')}]`;

      const result = await client.runTransaction(async (tx) => {
        return tx.execute(
          sql`
            WITH params AS (
              SELECT 
                ${bucketNameParam} as bucket_name,
                unnest(${sql.raw(pathsArrayLiteral)}) as path
            )
            SELECT 
              path,
              cms.has_storage_permission(bucket_name, 'select'::cms.system_action, path) as can_read,
              cms.has_storage_permission(bucket_name, 'update'::cms.system_action, path) as can_update,
              cms.has_storage_permission(bucket_name, 'delete'::cms.system_action, path) as can_delete,
              cms.has_storage_permission(bucket_name, 'insert'::cms.system_action, path) as can_upload
            FROM params
          `,
        );
      });

      // Process results into the map
      for (const row of result) {
        const path = row['path'] as string;
        const originalPath = path.startsWith('/') ? path.slice(1) : path;

        permissionsMap.set(originalPath, {
          canRead: (row['can_read'] as boolean) || false,
          canUpdate: (row['can_update'] as boolean) || false,
          canDelete: (row['can_delete'] as boolean) || false,
          canUpload: (row['can_upload'] as boolean) || false,
        });
      }

      // Ensure all requested paths have entries
      for (const path of objectPaths) {
        if (!permissionsMap.has(path)) {
          permissionsMap.set(path, {
            canRead: false,
            canUpdate: false,
            canDelete: false,
            canUpload: false,
          });
        }
      }

      return permissionsMap;
    } catch (error) {
      console.error('Error checking bulk storage permissions:', error);

      // Fail securely - return empty permissions for all paths
      for (const path of objectPaths) {
        permissionsMap.set(path, {
          canRead: false,
          canUpdate: false,
          canDelete: false,
          canUpload: false,
        });
      }

      return permissionsMap;
    }
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

    const result = await client.runTransaction(async (tx) => {
      // We need to substitute the parameters into the query
      let substitutedQuery = query;
      for (let i = 0; i < params.length; i++) {
        const placeholder = `$${i + 1}`;
        const value = params[i];
        const escapedValue =
          typeof value === 'string'
            ? `'${value.replace(/'/g, "''")}'`
            : String(value);
        substitutedQuery = substitutedQuery.replace(placeholder, escapedValue);
      }

      return tx.execute<{
        key: string;
        type: 'boolean' | 'string' | 'number';
        result: unknown;
      }>(sql.raw(substitutedQuery));
    });

    // Parse results using the builder's parser
    return BulkPermissionBuilder.parseResults(result);
  }
}
