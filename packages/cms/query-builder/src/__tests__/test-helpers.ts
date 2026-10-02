/**
 * Test helper utilities for working with Drizzle SQL objects
 */
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

const pgDialect = new PgDialect();

/**
 * Convert a Drizzle SQL object to string and params for testing
 * Since we don't have access to a dialect in tests, we'll extract what we can
 * @param sqlObject - The SQL object from query builder
 * @returns Object with sql string and params array
 */
export function sqlToString(sqlObject: SQL): {
  sql: string;
  params: unknown[];
} {
  try {
    // Try the toSQL method first (might work if dialect is available)
    const result = pgDialect.sqlToQuery(sqlObject);

    return result;
  } catch (error) {
    // toSQL method not available or failed
  }

  // Fallback: construct a debug representation from query chunks
  try {
    const chunks = (sqlObject as any).queryChunks || [];
    let sqlString = '';
    const params: unknown[] = [];

    for (const chunk of chunks) {
      if (typeof chunk === 'string') {
        sqlString += chunk;
      } else if (chunk && typeof chunk === 'object') {
        // Handle different chunk types
        if ('value' in chunk && Array.isArray((chunk as any).value)) {
          sqlString += (chunk as any).value.join('');
        } else if ('value' in chunk) {
          sqlString += String((chunk as any).value);
        } else if ((chunk as any).queryChunks) {
          // Nested SQL object
          const nested = sqlToString(chunk as SQL);
          sqlString += nested.sql;
          params.push(...nested.params);
        } else {
          sqlString += '[SQL_CHUNK]';
        }
      }
    }

    return {
      sql: sqlString || '[SQL Object]',
      params,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Could not parse SQL object:', error);
    return {
      sql: '[SQL Object - parsing failed]',
      params: [],
    };
  }
}

/**
 * Helper to test SQL object content by checking its structure
 * @param sqlObject - The SQL object to analyze
 * @returns Analysis object with extracted information
 */
export function analyzeSqlObject(sqlObject: SQL) {
  const anySql = sqlObject as any;
  return {
    hasChunks: anySql.queryChunks && anySql.queryChunks.length > 0,
    isParameterized: anySql.shouldInlineParams === false,
    chunkCount: anySql.queryChunks?.length || 0,
    // Extract some basic info from chunks for testing
    containsSelect:
      anySql.queryChunks?.some(
        (chunk: any) =>
          chunk?.toString?.()?.includes?.('SELECT') ||
          chunk?.value?.includes?.('SELECT'),
      ) || false,
    containsFrom:
      anySql.queryChunks?.some(
        (chunk: any) =>
          chunk?.toString?.()?.includes?.('FROM') ||
          chunk?.value?.includes?.('FROM'),
      ) || false,
  };
}
