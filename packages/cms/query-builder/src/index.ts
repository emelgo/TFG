// Core exports
export { QueryBuilder } from './core/query-builder';

// Clause builders
export { WhereBuilder } from './clauses/where-builder';
export { SelectBuilder } from './clauses/select-builder';
export { GroupByBuilder } from './clauses/group-by-builder';
export { OrderByBuilder } from './clauses/order-by-builder';
export { JoinBuilder } from './clauses/join-builder';

// Type exports - Query types
export type {
  QueryResult,
  QueryMetadata,
  TableReference,
} from './types/query-types';

// Type exports - Clause types
export type {
  SelectClause,
  SelectColumn,
  WhereClause,
  OrderByExpression,
  GroupByClause,
  JoinClause,
  HavingClause,
  LimitClause,
} from './types/clause-types';

// Type exports - Aggregation types
export type {
  AggregationType,
  AggregationTypeUpper,
  AggregationTypeCompat,
  TimeInterval,
  AggregationConfig,
  TimeBucketConfig,
  MultiSeriesConfig,
} from './types/aggregation-types';

// Type exports - Join types
export type { JoinType, JoinConfig } from './clauses/join-builder';

// Type exports - Order types
export type { OrderDirection, NullsPosition } from './clauses/order-by-builder';

// Error handling exports
export {
  QueryBuilderError,
  QueryBuilderErrorCode,
} from './errors/query-builder-errors';

// Validation exports
export { QueryValidator } from './validation/query-validator';
export type { ValidationResult } from './validation/query-validator';

// Utility exports
export {
  isAggregationColumn,
  getAggregationTypeFromColumn,
  isTimeBucketColumn,
} from './utils/column-utils';
