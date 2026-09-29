import { sql } from 'drizzle-orm';
import type { Context } from 'hono';

// Solo tipos: trae la ampliación de `ContextVariableMap` (`drizzle`).
import type {} from '@pymekit/cms-supabase/client';

/**
 * Storage actions that require permission checks
 */
export type StorageAction = 'select' | 'update' | 'delete' | 'insert';

/**
 * Storage permissions service that validates user permissions
 * using the database-level security functions
 */
class StoragePermissionsService {
  constructor(private readonly context: Context) {}

  /**
   * Check if the current user has permission for a storage action
   * @param bucketName - The bucket name
   * @param action - The action to perform
   * @param objectPath - The object path
   * @returns Promise<boolean> - Whether the user has permission
   */
  async hasStoragePermission(
    bucketName: string,
    action: StorageAction,
    objectPath: string,
  ) {
    try {
      const db = this.context.get('drizzle');

      const result = await db.runTransaction(async (tx) => {
        return tx.execute(
          sql`SELECT cms.has_storage_permission(${bucketName}, ${action}::cms.system_action, ${objectPath}) as has_permission`,
        );
      });

      const hasPermission = result[0]?.['has_permission'] as boolean;

      return hasPermission || false;
    } catch (error) {
      console.error('Error checking storage permission:', error);
      // Fail securely - deny access if permission check fails
      return false;
    }
  }

  /**
   * Check if user can read from a bucket
   * @param bucketName - The bucket name
   * @param objectPath - The object path (default to root)
   * @returns Promise<boolean>
   */
  async canReadBucket(bucketName: string, objectPath = '/'): Promise<boolean> {
    return this.hasStoragePermission(bucketName, 'select', objectPath);
  }

  /**
   * Check if user can update/rename files in a bucket
   * @param bucketName - The bucket name
   * @param objectPath - The object path
   * @returns Promise<boolean>
   */
  async canUpdateFile(
    bucketName: string,
    objectPath: string,
  ): Promise<boolean> {
    return this.hasStoragePermission(bucketName, 'update', objectPath);
  }

  /**
   * Check if user can delete files in a bucket
   * @param bucketName - The bucket name
   * @param objectPath - The object path
   * @returns Promise<boolean>
   */
  async canDeleteFile(
    bucketName: string,
    objectPath: string,
  ): Promise<boolean> {
    return this.hasStoragePermission(bucketName, 'delete', objectPath);
  }

  /**
   * Check if user can upload to a bucket
   * @param bucketName - The bucket name
   * @param objectPath - The object path
   * @returns Promise<boolean>
   */
  async canUploadFile(
    bucketName: string,
    objectPath: string,
  ): Promise<boolean> {
    return this.hasStoragePermission(bucketName, 'insert', objectPath);
  }

  /**
   * Validate that user has permission or throw an error
   * @param bucketName - The bucket name
   * @param action - The action to perform
   * @param objectPath - The object path
   * @throws Error if user doesn't have permission
   */
  async validateStoragePermission(
    bucketName: string,
    action: StorageAction,
    objectPath: string,
  ) {
    const hasPermission = await this.hasStoragePermission(
      bucketName,
      action,
      objectPath,
    );

    if (!hasPermission) {
      throw new Error(
        `Access denied: insufficient permissions for ${action} on ${bucketName}${objectPath}`,
      );
    }
  }

  /**
   * Validate that user has permission for multiple paths or throw an error
   * This is optimized for bulk operations by using a single database query
   * @param bucketName - The bucket name
   * @param action - The action to perform
   * @param objectPaths - Array of object paths to validate
   * @throws Error if user doesn't have permission for any path
   */
  async validateBulkStoragePermission(
    bucketName: string,
    action: StorageAction,
    objectPaths: string[],
  ) {
    if (objectPaths.length === 0) {
      return;
    }

    try {
      const db = this.context.get('drizzle');

      // SECURITY: paths are passed as a bound array parameter (never string
      // interpolation) and use the same slash-less form as the single-object
      // checks and the actual storage object keys, so the permission decision
      // is evaluated against the exact key being operated on.
      const result = await db.runTransaction(async (tx) => {
        return tx.execute(
          sql`
            WITH bucket_param AS (SELECT ${bucketName} as bucket_name),
                 action_param AS (SELECT ${action} as action_name),
                 paths_param AS (SELECT unnest(${objectPaths}::text[]) as path)
            SELECT
              path,
              cms.has_storage_permission(bucket_param.bucket_name, action_param.action_name::cms.system_action, path) as has_permission
            FROM paths_param
            CROSS JOIN bucket_param
            CROSS JOIN action_param
          `,
        );
      });

      // Check if all paths have permission
      const deniedPaths: string[] = [];

      for (const row of result) {
        const path = row['path'] as string;
        const hasPermission = row['has_permission'] as boolean;

        if (!hasPermission) {
          deniedPaths.push(path);
        }
      }

      if (deniedPaths.length > 0) {
        throw new Error(
          `Access denied: insufficient permissions for ${action} on ${bucketName} for paths: ${deniedPaths.slice(0, 5).join(', ')}${deniedPaths.length > 5 ? ` and ${deniedPaths.length - 5} more` : ''}`,
        );
      }
    } catch (error) {
      console.error('Error checking bulk storage permissions:', error);

      // If it's already our custom error, re-throw it
      if (error instanceof Error && error.message.includes('Access denied')) {
        throw error;
      }

      // For other errors, fail securely
      throw new Error(
        `Permission validation failed for ${action} on ${bucketName}`,
      );
    }
  }

  /**
   * Optimized validation for folder deletion - checks parent folder permission
   * If user has delete permission on parent folder, they can delete all contents
   * @param bucketName - The bucket name
   * @param folderPath - The folder path being deleted
   * @param filePaths - Array of file paths within the folder
   * @throws Error if user doesn't have permission
   */
  async validateFolderDeletionPermission(
    bucketName: string,
    folderPath: string,
    filePaths: string[],
  ) {
    // First, check if user has permission to delete the parent folder.
    // Use the slash-less form so the check matches the canonical path_pattern
    // form and the object keys actually removed.
    const hasParentPermission = await this.hasStoragePermission(
      bucketName,
      'delete',
      folderPath,
    );

    if (hasParentPermission) {
      // If user can delete parent folder, they can delete all contents
      return;
    }

    // If no parent permission, validate each file individually using bulk validation
    await this.validateBulkStoragePermission(bucketName, 'delete', filePaths);
  }

  /**
   * Get user permissions for a specific bucket and path
   * This returns an object with booleans for each action
   * @param bucketName - The bucket name
   * @param objectPath - The object path
   * @returns Promise with properly typed permissions
   */
  async getUserStoragePermissions(
    bucketName: string,
    objectPath: string,
  ): Promise<{
    canRead: boolean;
    canUpdate: boolean;
    canDelete: boolean;
    canUpload: boolean;
  }> {
    const [canRead, canUpdate, canDelete, canUpload] = await Promise.all([
      this.hasStoragePermission(bucketName, 'select', objectPath),
      this.hasStoragePermission(bucketName, 'update', objectPath),
      this.hasStoragePermission(bucketName, 'delete', objectPath),
      this.hasStoragePermission(bucketName, 'insert', objectPath),
    ]);

    return {
      canRead,
      canUpdate,
      canDelete,
      canUpload,
    };
  }

  /**
   * Get user permissions for multiple paths in a single optimized query
   * This is much faster than calling getUserStoragePermissions for each path
   * @param bucketName - The bucket name
   * @param objectPaths - Array of object paths
   * @param parentPath - Optional parent path for optimization
   * @returns Promise with permissions map keyed by path
   */
  async getBulkUserStoragePermissions(
    bucketName: string,
    objectPaths: string[],
    parentPath?: string,
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
      // Optimization: Check parent folder permissions first if provided
      let parentPermissions: {
        canRead: boolean;
        canUpdate: boolean;
        canDelete: boolean;
        canUpload: boolean;
      } | null = null;

      if (parentPath) {
        parentPermissions = await this.getUserStoragePermissions(
          bucketName,
          parentPath,
        );

        // If user has full permissions on parent, we can skip individual checks for many operations
        if (
          parentPermissions.canRead &&
          parentPermissions.canUpdate &&
          parentPermissions.canDelete &&
          parentPermissions.canUpload
        ) {
          // User has full access to parent - grant same permissions to all children
          for (const path of objectPaths) {
            permissionsMap.set(path, { ...parentPermissions });
          }
          return permissionsMap;
        }
      }

      const db = this.context.get('drizzle');

      // SECURITY: bind paths as an array parameter (never string interpolation)
      // and keep the slash-less form so each permission decision is evaluated
      // against the exact object key it gates.
      const result = await db.runTransaction(async (tx) => {
        return tx.execute(
          sql`
            WITH params AS (
              SELECT
                ${bucketName} as bucket_name,
                unnest(${objectPaths}::text[]) as path
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

        permissionsMap.set(path, {
          canRead: (row['can_read'] as boolean) || false,
          canUpdate: (row['can_update'] as boolean) || false,
          canDelete: (row['can_delete'] as boolean) || false,
          canUpload: (row['can_upload'] as boolean) || false,
        });
      }

      // Ensure all requested paths have entries (with false permissions if not found)
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
}

/**
 * Factory function to create StoragePermissionsService
 * @param context - Hono context
 * @returns StoragePermissionsService instance
 */
export function createStoragePermissionsService(
  context: Context,
): StoragePermissionsService {
  return new StoragePermissionsService(context);
}
