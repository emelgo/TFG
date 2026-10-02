import { and, eq } from 'drizzle-orm';

import { getDrizzleSupabaseAdminClient } from '@pymekit/cms-supabase/client';
import { tableMetadataInCms } from '@pymekit/cms-supabase/schema';
import type { ColumnMetadata } from '@pymekit/cms-types';

export type TableMetadataResult = {
  table: typeof tableMetadataInCms.$inferSelect;
  columns: ColumnMetadata[];
};

export function createTableMetadataService() {
  return new TableMetadataService();
}

/**
 * Service to get table metadata (admin access - no permission checks)
 * WARNING: Only use this for internal operations where permissions are checked elsewhere
 */
class TableMetadataService {
  /**
   * Get table metadata without permission validation (admin access)
   * @param params - The parameters for the query
   * @returns The table metadata
   */
  async getTableMetadata(params: {
    schemaName: string;
    tableName: string;
  }): Promise<TableMetadataResult> {
    const adminClient = getDrizzleSupabaseAdminClient();

    const result = await adminClient
      .select()
      .from(tableMetadataInCms)
      .where(
        and(
          eq(tableMetadataInCms.schemaName, params.schemaName),
          eq(tableMetadataInCms.tableName, params.tableName),
        ),
      );

    if (!result || result.length === 0) {
      throw new Error('Table not found');
    }

    const data = result[0]!;

    const columns = Object.values(
      data.columnsConfig as Record<string, ColumnMetadata>,
    );

    return { table: data, columns };
  }
}
