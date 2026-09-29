import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

/**
 * Builds a batch SELECT query for fetching records by primary key values
 * @param schema - Database schema name
 * @param table - Table name
 * @param column - Column to filter by (usually primary key)
 * @param values - Values to filter for
 * @param selectColumns - Optional array of specific columns to select (defaults to *)
 */
export function buildBatchSelectQuery(
  schema: string,
  table: string,
  column: string,
  values: unknown[],
  selectColumns?: string[],
): SQL {
  if (values.length === 0) {
    throw new Error('Cannot build batch query with empty values array');
  }

  // Build the SELECT clause
  const selectClause =
    selectColumns && selectColumns.length > 0
      ? sql.join(
          selectColumns.map((col) => sql.identifier(col)),
          sql`, `,
        )
      : sql`*`;

  return sql`
    SELECT ${selectClause} FROM ${sql.identifier(schema)}.${sql.identifier(table)} 
    WHERE ${sql.identifier(column)} IN (${sql.join(
      values.map((v) => sql`${v}`),
      sql`, `,
    )})
  `;
}

/**
 * Validates parameters for batch query building
 */
export function validateBatchQueryParams(
  schema: string,
  table: string,
  column: string,
  values: unknown[],
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!schema || typeof schema !== 'string') {
    errors.push('Schema must be a non-empty string');
  }

  if (!table || typeof table !== 'string') {
    errors.push('Table must be a non-empty string');
  }

  if (!column || typeof column !== 'string') {
    errors.push('Column must be a non-empty string');
  }

  if (!Array.isArray(values)) {
    errors.push('Values must be an array');
  } else if (values.length === 0) {
    errors.push('Values array cannot be empty');
  }

  // Check for SQL injection patterns in identifiers
  const sqlInjectionPattern = /[';-]/;
  if (sqlInjectionPattern.test(schema)) {
    errors.push('Schema contains potentially unsafe characters');
  }
  if (sqlInjectionPattern.test(table)) {
    errors.push('Table contains potentially unsafe characters');
  }
  if (sqlInjectionPattern.test(column)) {
    errors.push('Column contains potentially unsafe characters');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Groups unique target tables for efficient permission checking
 */
export function extractUniqueTargets(
  batchGroups: Array<{ schema: string; table: string; column: string }>,
): Array<{ schema: string; table: string; key: string }> {
  const uniqueTargets = new Map<string, { schema: string; table: string }>();

  batchGroups.forEach((group) => {
    const key = `${group.schema}.${group.table}`;
    if (!uniqueTargets.has(key)) {
      uniqueTargets.set(key, { schema: group.schema, table: group.table });
    }
  });

  return Array.from(uniqueTargets.entries()).map(([key, target]) => ({
    ...target,
    key,
  }));
}

/**
 * Filters batch groups based on permission results
 */
export function filterAllowedGroups<
  T extends { schema: string; table: string },
>(batchGroups: T[], permissionsMap: Map<string, boolean>): T[] {
  return batchGroups.filter((group) => {
    const key = `${group.schema}.${group.table}`;
    return permissionsMap.get(key) === true;
  });
}

/**
 * Creates denied results for groups without permission
 */
export function createDeniedResults<
  T extends { schema: string; table: string; column: string },
>(
  batchGroups: T[],
  permissionsMap: Map<string, boolean>,
): Array<{ schema: string; table: string; column: string; records: [] }> {
  const deniedGroups = batchGroups.filter((group) => {
    const key = `${group.schema}.${group.table}`;
    return permissionsMap.get(key) !== true;
  });

  return deniedGroups.map((group) => ({
    schema: group.schema,
    table: group.table,
    column: group.column,
    records: [],
  }));
}
