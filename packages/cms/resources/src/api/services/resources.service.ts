import { and, asc, eq } from 'drizzle-orm';
import { Context } from 'hono';

import { tableMetadataInCms } from '@pymekit/cms-supabase/schema';

import type { ReadableResource } from '../../types';

type ManagedTable = typeof tableMetadataInCms.$inferSelect;

/**
 * Create a new resources service
 * @param context
 */
export function createResourcesService(context: Context) {
  return new ResourcesService(context);
}

/**
 * Service to load readable resources from the database
 * This service fetches all table metadata that the current user has permission to read
 */
class ResourcesService {
  constructor(private readonly context: Context) {}

  /**
   * Get all readable resources for the current user
   * Resources are tables that the user has 'select' permission for
   * @returns Array of readable resources
   */
  async getReadableResources(): Promise<ReadableResource[]> {
    const client = this.context.get('drizzle');

    // Load resources from table_metadata with RLS filtering
    // The RLS policies will automatically filter to only show tables
    // the user has permission to read
    const resources = await client.runTransaction(async (tx) => {
      return tx
        .select()
        .from(tableMetadataInCms)
        .orderBy(asc(tableMetadataInCms.ordering));
    });

    // Transform to readable resource format
    return resources.map((resource: ManagedTable): ReadableResource => {
      return {
        schemaName: resource.schemaName,
        tableName: resource.tableName,
        displayName: resource.displayName || resource.tableName,
        metadata: resource,
      };
    });
  }

  /**
   * Get metadata for a specific resource
   * @param schemaName - Schema name
   * @param tableName - Table name
   * @returns Resource metadata if user has access
   */
  async getResourceMetadata(
    schemaName: string,
    tableName: string,
  ): Promise<ReadableResource | null> {
    const client = this.context.get('drizzle');

    try {
      const resource = await client.runTransaction(async (tx) => {
        return tx
          .select()
          .from(tableMetadataInCms)
          .where(
            and(
              eq(tableMetadataInCms.schemaName, schemaName),
              eq(tableMetadataInCms.tableName, tableName),
            ),
          )
          .limit(1);
      });

      if (resource.length === 0) {
        return null;
      }

      const resourceData = resource[0]!;

      return {
        schemaName: resourceData.schemaName,
        tableName: resourceData.tableName,
        displayName: resourceData.displayName || resourceData.tableName,
        metadata: resourceData,
      };
    } catch {
      // RLS will throw an error if user doesn't have permission
      return null;
    }
  }

  /**
   * Check if user has access to a specific resource
   * @param schemaName - Schema name
   * @param tableName - Table name
   * @returns True if user can access the resource
   */
  async checkResourceAccess(
    schemaName: string,
    tableName: string,
  ): Promise<boolean> {
    const resource = await this.getResourceMetadata(schemaName, tableName);
    return resource !== null;
  }
}
