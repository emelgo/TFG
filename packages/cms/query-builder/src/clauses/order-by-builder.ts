/**
 * ORDER BY clause builder
 *
 * Handles building ORDER BY clauses for result ordering.
 */
import type { TimeInterval } from '../types/aggregation-types';
import type { OrderByExpression } from '../types/clause-types';

export type OrderDirection = 'ASC' | 'DESC';
export type NullsPosition = 'FIRST' | 'LAST';

export class OrderByBuilder {
  private constructor() {
    // Static class - no instantiation
  }

  /**
   * Create a simple ORDER BY expression
   */
  static column(
    column: string,
    direction: OrderDirection = 'ASC',
    nullsPosition?: NullsPosition,
  ): OrderByExpression {
    return {
      expression: column,
      direction,
      nullsFirst:
        nullsPosition === 'FIRST'
          ? true
          : nullsPosition === 'LAST'
            ? false
            : undefined,
    };
  }

  /**
   * Create ORDER BY for time series (typically ascending by time)
   */
  static forTimeSeries(config: {
    timeColumn: string;
    timeInterval: TimeInterval;
    direction?: OrderDirection;
  }): OrderByExpression {
    const { timeColumn, timeInterval, direction = 'ASC' } = config;
    const timeBucketExpr = `DATE_TRUNC('${timeInterval}', "${timeColumn}")`;

    return {
      expression: timeBucketExpr,
      direction,
    };
  }

  /**
   * Create ORDER BY for aggregated values
   */
  static byAggregation(
    aggregation: string,
    column: string,
    direction: OrderDirection = 'DESC',
  ): OrderByExpression {
    const expression = `${aggregation}(${column})`;
    return {
      expression,
      direction,
    };
  }

  /**
   * Create multiple ORDER BY expressions
   */
  static multiple(
    configs: Array<{
      column: string;
      direction?: OrderDirection;
      nullsPosition?: NullsPosition;
    }>,
  ): OrderByExpression[] {
    return configs.map(({ column, direction = 'ASC', nullsPosition }) =>
      this.column(column, direction, nullsPosition),
    );
  }

  /**
   * Create ORDER BY expressions from column configs (alias for multiple)
   */
  static byColumns(
    configs: Array<{
      column: string;
      direction: OrderDirection;
    }>,
  ): OrderByExpression[] {
    return configs.map(({ column, direction }) => ({
      expression: column,
      direction,
    }));
  }

  /**
   * Create ORDER BY for top N queries (e.g., top 10 by count)
   */
  static topN(
    valueExpression: string,
    _n?: number,
    direction: OrderDirection = 'DESC',
  ): OrderByExpression[] {
    const expressions: OrderByExpression[] = [
      {
        expression: valueExpression,
        direction,
      },
    ];

    // Note: LIMIT should be applied separately, not in ORDER BY
    // This is just for ordering, the actual limit is handled by LIMIT clause
    return expressions;
  }

  /**
   * Create ORDER BY clause for chart widgets
   */
  static forChart(config: {
    hasTimeAggregation: boolean;
    timeColumn?: string;
    timeInterval?: TimeInterval;
    customOrderBy?: Array<{ column: string; direction: 'ASC' | 'DESC' }>;
    multiSeriesColumns?: readonly string[];
    sortByValue?: boolean;
  }): OrderByExpression[] {
    const {
      hasTimeAggregation,
      timeColumn,
      timeInterval,
      customOrderBy,
      multiSeriesColumns,
      sortByValue,
    } = config;
    const expressions: OrderByExpression[] = [];

    // Add custom order by first
    if (customOrderBy) {
      expressions.push(
        ...customOrderBy.map((o) => ({
          expression: o.column,
          direction: o.direction,
        })),
      );
    }

    // Add time ordering for time series
    if (hasTimeAggregation && timeColumn && timeInterval) {
      const timeBucketExpr = `DATE_TRUNC('${timeInterval}', "${timeColumn}")`;
      expressions.push({
        expression: timeBucketExpr,
        direction: 'ASC',
      });
    }

    // Add multi-series columns ordering
    if (multiSeriesColumns) {
      expressions.push(
        ...multiSeriesColumns.map((col) => ({
          expression: col,
          direction: 'ASC' as const,
        })),
      );
    }

    // Add value ordering if requested
    if (sortByValue) {
      expressions.push({
        expression: 'value',
        direction: 'DESC',
      });
    }

    return expressions;
  }

  /**
   * Merge multiple ORDER BY expressions while preserving order
   */
  static merge(...expressions: OrderByExpression[][]): OrderByExpression[] {
    const result: OrderByExpression[] = [];
    const seen = new Set<string>();

    for (const exprArray of expressions) {
      for (const expr of exprArray) {
        // Avoid duplicate expressions
        if (!seen.has(expr.expression)) {
          seen.add(expr.expression);
          result.push(expr);
        }
      }
    }

    return result;
  }
}
