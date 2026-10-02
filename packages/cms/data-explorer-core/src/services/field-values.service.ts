import type { SQL } from 'drizzle-orm';
import type { Context } from 'hono';

import { getDrizzleSupabaseAdminClient } from '@pymekit/cms-supabase/client';

import { FieldValuesQueryBuilder } from '../lib/field-values-query-builder';
import { createTableMetadataService } from './table-metadata-service';

export interface FieldValuesParams {
  schemaName: string;
  tableName: string;
  fieldName: string;
  search?: string;
  limit?: number;
  includeTopHits?: boolean;
}

export interface FieldValuesResult {
  values: Array<{ value: string; count?: number }>;
  topHits?: Array<{ value: string; count: number }>;
}

export function createFieldValuesService(context: Context) {
  return new FieldValuesService(context);
}

/**
 * Service for getting unique field values and top hits for autocomplete functionality
 */
class FieldValuesService {
  constructor(_context: Context) {}

  /**
   * Check if a data type should not have empty string checks
   */
  private isTypeWithoutEmptyStrings(dataType: string): boolean {
    const normalizedType = dataType.toLowerCase().trim();

    // UUID types (including variations)
    if (normalizedType === 'uuid' || normalizedType.includes('uuid')) {
      return true;
    }

    // Boolean types
    if (normalizedType === 'boolean' || normalizedType === 'bool') {
      return true;
    }

    // JSON types
    if (normalizedType === 'json' || normalizedType === 'jsonb') {
      return true;
    }

    // Numeric types
    if (
      normalizedType.includes('int') ||
      normalizedType.includes('numeric') ||
      normalizedType.includes('decimal') ||
      normalizedType.includes('float') ||
      normalizedType.includes('real') ||
      normalizedType.includes('double')
    ) {
      return true;
    }

    // Date/time types
    if (
      normalizedType.includes('timestamp') ||
      normalizedType.includes('date') ||
      normalizedType.includes('time')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Validate field exists and get its metadata
   */
  private async validateAndGetFieldMetadata(params: {
    schemaName: string;
    tableName: string;
    fieldName: string;
  }) {
    const { schemaName, tableName, fieldName } = params;
    const tableMetadataService = createTableMetadataService();

    const tableMetadata = await tableMetadataService.getTableMetadata({
      schemaName,
      tableName,
    });

    if (!tableMetadata) {
      throw new Error(
        `Table '${tableName}' not found in schema '${schemaName}'`,
      );
    }

    if (!tableMetadata.columns) {
      throw new Error(
        `Table '${tableName}' in schema '${schemaName}' has no columns`,
      );
    }

    const fieldMetadata = tableMetadata.columns.find(
      (col) => col.name === fieldName,
    );

    if (!fieldMetadata) {
      throw new Error(`Field '${fieldName}' not found in table '${tableName}'`);
    }

    return fieldMetadata;
  }

  /**
   * Build WHERE clause conditions using the query builder
   */
  private buildWhereConditions(params: {
    fieldName: string;
    dataType: string;
    search?: string;
  }): SQL[] {
    const { fieldName, dataType, search } = params;
    const canHaveEmptyStrings = !this.isTypeWithoutEmptyStrings(dataType);

    return FieldValuesQueryBuilder.buildWhereConditions({
      fieldName,
      includeNotNull: true,
      includeNotEmpty: canHaveEmptyStrings,
      searchPattern: search && search.trim() ? `%${search.trim()}%` : undefined,
    });
  }

  /**
   * Get estimated table size for optimization decisions
   */
  private async getTableSize(
    schemaName: string,
    tableName: string,
  ): Promise<number> {
    const admin = getDrizzleSupabaseAdminClient();

    const query = FieldValuesQueryBuilder.buildTableSizeQuery(
      schemaName,
      tableName,
    );

    const result = await admin.execute(query);

    return (result[0]?.['estimate'] as number) || 0;
  }

  /**
   * Get unique values for the field
   */
  private async getUniqueValues(params: {
    schemaName: string;
    tableName: string;
    fieldName: string;
    conditions: SQL[];
    limit: number;
  }): Promise<Array<{ value: string }>> {
    const admin = getDrizzleSupabaseAdminClient();
    const query = FieldValuesQueryBuilder.buildUniqueValuesQuery(params);

    try {
      const result = await admin.execute(query);

      return result.map((row) => ({ value: row['value'] as string }));
    } catch {
      // Fallback for problematic data types - use simpler conditions
      const fallbackQuery =
        FieldValuesQueryBuilder.buildUniqueValuesFallbackQuery(params);

      const fallbackResult = await admin.execute(fallbackQuery);
      return fallbackResult.map((row) => ({ value: row['value'] as string }));
    }
  }

  /**
   * Get top hits (most frequent values) for the field
   */
  private async getTopHitsValues(params: {
    schemaName: string;
    tableName: string;
    fieldName: string;
    conditions: SQL[];
    limit: number;
    tableSize: number;
  }): Promise<Array<{ value: string; count: number }>> {
    const { fieldName } = params;

    const admin = getDrizzleSupabaseAdminClient();
    const query = FieldValuesQueryBuilder.buildTopHitsQuery(params);

    try {
      const result = await admin.execute(query);

      return result.map((row) => ({
        value: row['value'] as string,
        count: Number(row['count']),
      }));
    } catch (error) {
      console.error(
        `[ERROR] Failed to execute top hits query for ${fieldName}:`,
        error,
      );

      // Fallback for problematic data types
      const fallbackQuery =
        FieldValuesQueryBuilder.buildTopHitsFallbackQuery(params);

      try {
        const fallbackResult = await admin.execute(fallbackQuery);

        return fallbackResult.map((row) => ({
          value: row['value'] as string,
          count: Number(row['count']),
        }));
      } catch {
        return [];
      }
    }
  }

  /**
   * Get unique field values for a specific column
   * @param params
   * @returns array of unique field values with optional top hits
   */
  async getFieldValues(params: FieldValuesParams): Promise<FieldValuesResult> {
    const {
      schemaName,
      tableName,
      fieldName,
      search,
      limit = 10,
      includeTopHits = false,
    } = params;

    // Step 1: Validate field and get metadata
    const fieldMetadata = await this.validateAndGetFieldMetadata({
      schemaName,
      tableName,
      fieldName,
    });

    const dataType = fieldMetadata.ui_config?.data_type?.toLowerCase() || '';

    // Step 2: Build WHERE conditions
    const conditions = this.buildWhereConditions({
      fieldName,
      dataType,
      search,
    });

    // Step 3: Get unique values
    const values = await this.getUniqueValues({
      schemaName,
      tableName,
      fieldName,
      conditions,
      limit,
    });

    // Step 4: Get top hits if requested
    let topHits: Array<{ value: string; count: number }> | undefined;

    if (includeTopHits) {
      const tableSize = await this.getTableSize(schemaName, tableName);

      topHits = await this.getTopHitsValues({
        schemaName,
        tableName,
        fieldName,
        conditions,
        limit,
        tableSize,
      });
    }

    return {
      values,
      topHits,
    };
  }
}
