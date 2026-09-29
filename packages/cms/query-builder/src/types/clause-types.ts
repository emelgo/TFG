// Re-export types from other files to avoid circular dependencies
import type { SQL } from 'drizzle-orm';

import type { AggregationClause } from './aggregation-types';
import type { JoinType, TableReference } from './query-types';

/**
 * SQL clause building block types
 */

export interface SelectClause {
  readonly columns: readonly SelectColumn[];
  readonly distinct?: boolean;
}

export interface SelectColumn {
  readonly expression: string;
  readonly alias?: string;
  readonly aggregation?: AggregationClause;
}

export interface FromClause {
  readonly table: TableReference;
  readonly alias?: string;
}

export interface WhereClause {
  readonly conditions: readonly SQL[];
  readonly combineWith: 'AND' | 'OR';
}

export interface JoinClause {
  readonly type: JoinType;
  readonly table: TableReference;
  readonly condition: string;
  readonly alias?: string;
}

export interface GroupByClause {
  readonly expressions: readonly string[];
  readonly rollup?: boolean;
  readonly cube?: boolean;
}

export interface HavingClause {
  readonly conditions: readonly SQL[];
  readonly combineWith: 'AND' | 'OR';
}

export interface OrderByClause {
  readonly expressions: readonly OrderByExpression[];
}

export interface OrderByExpression {
  readonly expression: string;
  readonly direction: 'ASC' | 'DESC';
  readonly nullsFirst?: boolean;
}

export interface LimitClause {
  readonly limit: number;
  readonly offset?: number;
}
