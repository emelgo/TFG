/**
 * Core SQL query types and structures
 */
import type { SQL } from 'drizzle-orm';

export interface QueryResult {
  readonly sql: SQL;
  readonly metadata: QueryMetadata;
}

export interface QueryMetadata {
  readonly queryType: QueryType;
  readonly hasAggregation: boolean;
  readonly isTimeSeries: boolean;
  readonly estimatedRows?: number;
  readonly cacheKey?: string;
  readonly executionHints?: ExecutionHint[];
}

export type QueryType = 'SELECT' | 'COUNT' | 'AGGREGATE' | 'TIME_SERIES';

export type ExecutionHint =
  | 'USE_INDEX'
  | 'FORCE_SEQUENTIAL_SCAN'
  | 'PREFER_HASH_JOIN'
  | 'ENABLE_PARALLEL';

export interface TableReference {
  readonly schema: string;
  readonly table: string;
  readonly alias?: string;
}

export interface ColumnReference {
  readonly table?: string;
  readonly column: string;
  readonly alias?: string;
}

export interface JoinClause {
  readonly type: JoinType;
  readonly table: TableReference;
  readonly condition: string;
}

export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';

export interface LimitClause {
  readonly limit: number;
  readonly offset?: number;
}

export interface OrderByClause {
  readonly column: string;
  readonly direction: 'ASC' | 'DESC';
  readonly nullsFirst?: boolean;
}
