/**
 * Pure query building logic without database dependencies
 * Safe to import in browser environments and tests
 */

export { TableQueryBuilder } from './lib/table-query-builder';
export type {
  TableQueryBuilderParams,
  TableQueryBuilderResult,
} from './lib/table-query-builder';
