import { sql } from 'drizzle-orm';
import { Context } from 'hono';

import { createAuthorizationService } from '@pymekit/cms-auth/services';
import {
  createFieldValuesService,
  createTableMetadataService,
  createTableViewService,
} from '@pymekit/cms-data-explorer-core';
import { formatRecord } from '@pymekit/cms-formatters';

import { CrudOperationError, classifyCrudError } from '../utils/crud-errors';

/** `meta` de la respuesta de las funciones SQL de escritura. */
type CrudResponseMeta = { sqlstate?: string };

/**
 * Convierte la respuesta fallida de una función SQL de escritura en un
 * `CrudOperationError`, conservando su SQLSTATE para clasificarlo después.
 */
function toCrudOperationError(response: {
  error: string;
  meta?: CrudResponseMeta;
}) {
  return new CrudOperationError(
    response.error ?? 'Unknown error',
    response.meta?.sqlstate,
  );
}

/**
 * Create a database editor service
 * @param context
 */
export function createDataExplorerService(context: Context) {
  return new DataExplorerService(context);
}

/**
 * Service class for managing the interaction with a database editor component.
 */
class DataExplorerService {
  constructor(private readonly context: Context) {}

  /**
   * Query a table data based on the provided parameters
   *
   * @param params
   */
  async queryTableData(params: {
    schemaName: string;
    tableName: string;
    page: number;
    pageSize: number;
    properties:
      | Record<string, string | number | boolean | string[] | null>
      | undefined;
    search?: string;
    sortColumn?: string;
    sortDirection?: 'asc' | 'desc';
    /** Skip permission check if already verified upstream (e.g., in route handler). Defaults to false. */
    skipPermissionCheck?: boolean;
  }) {
    const tableView = createTableViewService(this.context);

    return tableView.queryTableView({
      schemaName: params.schemaName,
      tableName: params.tableName,
      page: params.page,
      pageSize: params.pageSize,
      properties: params.properties,
      search: params.search,
      sortColumn: params.sortColumn,
      sortDirection: params.sortDirection,
      displayFormatter: formatRecord,
      skipPermissionCheck: params.skipPermissionCheck,
    });
  }

  /**
   * Get a table metadata
   *
   * @param params
   */
  async getTableMetadata(params: { schemaName: string; tableName: string }) {
    const service = createTableMetadataService();

    return service.getTableMetadata(params);
  }

  /**
   * Get a record by keys.
   * @param params
   */
  getRecordByKeys(params: {
    schemaName: string;
    tableName: string;
    keyValues: Record<string, unknown>;
  }) {
    const tableView = createTableViewService(this.context);

    return tableView.getRecordByKeys(params);
  }

  /**
   * Insert a record
   * @param params
   */
  async insertRecord(params: {
    schemaName: string;
    tableName: string;
    data: Record<string, unknown>;
  }) {
    const { schemaName, tableName, data } = params;
    const client = this.context.get('drizzle');

    // Execute the query using the get_record_by_keys function
    return client.runTransaction(async (tx) => {
      const result = await tx
        .execute<{
          insert_record: {
            success: boolean;
            error: string;
            meta?: CrudResponseMeta;
            data: Record<string, unknown>;
          };
        }>(
          sql`
        SELECT cms.insert_record(
          ${schemaName}::text,
          ${tableName}::text,
          ${JSON.stringify(data)}::jsonb
        )
      `,
        )
        .then((data) => data[0]);

      if (!result) {
        throw new Error('No result from insert_record');
      }

      if (!result.insert_record.success) {
        throw toCrudOperationError(result.insert_record);
      }

      return result.insert_record;
    });
  }

  /**
   * Update a record
   * @param params
   */
  async updateRecord(params: {
    schemaName: string;
    tableName: string;
    id: string;
    data: Record<string, unknown>;
  }) {
    const { schemaName, tableName, id, data } = params;
    const client = this.context.get('drizzle');

    // Execute the query using the get_record_by_keys function
    return client.runTransaction(async (tx) => {
      const result = await tx
        .execute<{
          update_record: {
            success: boolean;
            error: string;
            data?: Record<string, unknown>;
            meta?: CrudResponseMeta;
          };
        }>(
          sql`
        SELECT cms.update_record(
          ${schemaName}::text,
          ${tableName}::text,
          ${id}::text,
          ${JSON.stringify(data)}::jsonb
        )
      `,
        )
        .then((data) => data[0]);

      if (!result) {
        throw new Error('No result from update_record');
      }

      if (!result.update_record.success) {
        throw toCrudOperationError(result.update_record);
      }

      return result.update_record;
    });
  }

  /**
   * @name deleteRecordById
   * Delete a record
   * @param params
   */
  async deleteRecordById(params: {
    schemaName: string;
    tableName: string;
    id: string;
  }) {
    const { schemaName, tableName, id } = params;
    const client = this.context.get('drizzle');

    // Execute the query using the get_record_by_keys function
    return await client.runTransaction(async (tx) => {
      const result = await tx
        .execute<{
          delete_record: {
            success: boolean;
            error: string;
            meta?: CrudResponseMeta;
          };
        }>(
          sql`
        SELECT cms.delete_record(
          ${schemaName}::text,
          ${tableName}::text,
          ${id}::text
        )
      `,
        )
        .then((data) => data[0]);

      if (!result) {
        throw new Error('No result from delete_record');
      }

      if (!result.delete_record.success) {
        throw toCrudOperationError(result.delete_record);
      }

      return result.delete_record;
    });
  }

  /**
   * Update a record by conditions
   * @param params
   */
  async updateRecordByConditions(params: {
    schemaName: string;
    tableName: string;
    conditions: Record<string, unknown>;
    data: Record<string, unknown>;
  }) {
    const { schemaName, tableName, conditions, data } = params;
    const client = this.context.get('drizzle');

    // Execute the query using the get_record_by_keys function
    return client.runTransaction(async (tx) => {
      const result = await tx
        .execute<{
          update_record_by_conditions: {
            success: boolean;
            error: string;
            meta?: CrudResponseMeta;
            data: Record<string, unknown>;
          };
        }>(
          sql`
        SELECT cms.update_record_by_conditions(
          ${schemaName}::text,
          ${tableName}::text,
          ${JSON.stringify(conditions)}::jsonb,
          ${JSON.stringify(data)}::jsonb
        )
      `,
        )
        .then((data) => data[0]);

      if (!result) {
        throw new Error('No result from update_record_by_conditions');
      }

      if (!result.update_record_by_conditions.success) {
        throw toCrudOperationError(result.update_record_by_conditions);
      }

      return result.update_record_by_conditions;
    });
  }

  /**
   * Delete a record by conditions
   * @param params
   */
  async deleteRecordByConditions(params: {
    schemaName: string;
    tableName: string;
    conditions: Record<string, unknown>;
  }) {
    const { schemaName, tableName, conditions } = params;
    const client = this.context.get('drizzle');

    // Execute the query using the get_record_by_keys function
    return client.runTransaction(async (tx) => {
      const result = await tx
        .execute<{
          delete_record_by_conditions: {
            success: boolean;
            error: string;
            meta?: CrudResponseMeta;
          };
        }>(
          sql`
        SELECT cms.delete_record_by_conditions(
          ${schemaName}::text,
          ${tableName}::text,
          ${JSON.stringify(conditions)}::jsonb
        )
      `,
        )
        .then((data) => data[0]);

      if (!result) {
        throw new Error('No result from delete_record_by_conditions');
      }

      if (!result.delete_record_by_conditions.success) {
        throw toCrudOperationError(result.delete_record_by_conditions);
      }

      return result.delete_record_by_conditions;
    });
  }

  /**
   * Batch delete records using a combination of IDs and conditions
   * @param params
   */
  async batchDeleteRecords(params: {
    schemaName: string;
    tableName: string;
    items: Array<Record<string, unknown>>;
  }) {
    const { schemaName, tableName, items } = params;
    const client = this.context.get('drizzle');

    return client.runTransaction(async (tx) => {
      // Cada registro se borra con su propia llamada a la función SQL, que
      // atrapa sus errores dentro de un bloque `EXCEPTION` (un
      // «subtransaction»): un fallo en uno (por ejemplo, porque otros
      // registros apuntan a él) no deshace los ya borrados. Por eso el
      // resultado es parcial y se informa de cuántos fallaron.
      //
      // Seguridad: por cada fallo solo se devuelve su código estable; el
      // texto de PostgreSQL (nombres de columnas y restricciones) no sale del
      // servidor.
      const results: Array<{
        success: boolean;
        condition: Record<string, unknown>;
        errorCode?: string;
      }> = [];

      for (const condition of items) {
        const response = await tx
          .execute<{
            delete_record_by_conditions: {
              success: boolean;
              error: string;
              meta?: CrudResponseMeta;
            };
          }>(
            sql`
            SELECT cms.delete_record_by_conditions(
              ${schemaName}::text,
              ${tableName}::text,
              ${JSON.stringify(condition)}::jsonb
            )
          `,
          )
          .then((data) => data[0]);

        if (response?.delete_record_by_conditions.success) {
          results.push({ success: true, condition });
          continue;
        }

        results.push({
          success: false,
          condition,
          errorCode: classifyCrudError(
            response
              ? toCrudOperationError(response.delete_record_by_conditions)
              : new Error('No result from delete_record_by_conditions'),
          ).errorCode,
        });
      }

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.length - successCount;

      return {
        success: failureCount === 0,
        total: results.length,
        successCount,
        failureCount,
        results,
      };
    });
  }

  /**
   * Get the data permissions for a record
   * @param params
   * @returns the data permissions for the record
   */
  async getDataPermissions(params: { schemaName: string; tableName: string }) {
    // Use centralized authorization service for bulk permission checks
    const authorizationService = createAuthorizationService(this.context);

    const permissions = await authorizationService.getTableCRUDPermissions(
      params.schemaName,
      params.tableName,
    );

    const { canSelect, canInsert, canUpdate, canDelete } = permissions;

    return {
      canSelect,
      canInsert,
      canUpdate,
      canDelete,
    };
  }

  /**
   * Get unique field values for a specific column
   * @param params
   * @returns array of unique field values with optional top hits
   */
  async getFieldValues(params: {
    schemaName: string;
    tableName: string;
    fieldName: string;
    search?: string;
    limit?: number;
    includeTopHits?: boolean;
  }) {
    const service = createFieldValuesService(this.context);

    return service.getFieldValues(params);
  }
}
