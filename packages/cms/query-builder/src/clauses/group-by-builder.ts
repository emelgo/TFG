/**
 * GROUP BY clause builder
 *
 * Handles building GROUP BY clauses for aggregation queries.
 */
import type { TimeInterval } from '../types/aggregation-types';
import type { GroupByClause } from '../types/clause-types';

export class GroupByBuilder {
  private constructor() {
    // Static class - no instantiation
  }

  /**
   * Create a simple GROUP BY clause with column expressions
   */
  static fromColumns(columns: string[]): GroupByClause {
    return {
      expressions: columns,
      rollup: false,
      cube: false,
    };
  }

  /**
   * Create GROUP BY clause for time series with optional additional grouping
   */
  static forTimeSeries(config: {
    timeColumn: string;
    timeInterval: TimeInterval;
    additionalGroupBy?: string[];
  }): GroupByClause {
    const { timeColumn, timeInterval, additionalGroupBy = [] } = config;

    const timeBucketExpr = `DATE_TRUNC('${timeInterval}', ${timeColumn})`;
    const expressions = [timeBucketExpr, ...additionalGroupBy];

    return {
      expressions,
      rollup: false,
      cube: false,
    };
  }

  /**
   * Create GROUP BY with ROLLUP for hierarchical aggregation
   */
  static withRollup(columns: string[]): GroupByClause {
    return {
      expressions: columns,
      rollup: true,
      cube: false,
    };
  }

  /**
   * Create GROUP BY with CUBE for all combinations
   */
  static withCube(columns: string[]): GroupByClause {
    return {
      expressions: columns,
      rollup: false,
      cube: true,
    };
  }

  /**
   * Merge multiple GROUP BY clauses
   */
  static merge(...clauses: GroupByClause[]): GroupByClause {
    const expressions: string[] = [];
    let rollup = false;
    let cube = false;

    for (const clause of clauses) {
      expressions.push(...clause.expressions);
      rollup = rollup || (clause.rollup ?? false);
      cube = cube || (clause.cube ?? false);
    }

    // Can't have both ROLLUP and CUBE
    if (rollup && cube) {
      throw new Error(
        'Cannot use both ROLLUP and CUBE in the same GROUP BY clause',
      );
    }

    return {
      expressions: [...new Set(expressions)], // Remove duplicates
      rollup,
      cube,
    };
  }

  /**
   * Create GROUP BY clause for chart widgets
   */
  static forChart(config: {
    hasTimeAggregation: boolean;
    timeColumn?: string;
    timeInterval?: TimeInterval;
    groupByColumns: string[];
    multiSeriesColumns?: readonly string[];
  }): GroupByClause | null {
    const {
      hasTimeAggregation,
      timeColumn,
      timeInterval,
      groupByColumns,
      multiSeriesColumns,
    } = config;
    const expressions: string[] = [];

    // Add time bucket if time aggregation is used
    if (hasTimeAggregation && timeColumn && timeInterval) {
      const timeBucketExpr = `DATE_TRUNC('${timeInterval}', "${timeColumn}")`;
      expressions.push(timeBucketExpr);
    }

    // Add regular groupBy columns (quoted)
    expressions.push(...groupByColumns.map((col) => `"${col}"`));

    // Add multi-series columns (quoted)
    if (multiSeriesColumns) {
      expressions.push(...multiSeriesColumns.map((col) => `"${col}"`));
    }

    // Return null if no grouping is needed
    if (expressions.length === 0) {
      return null;
    }

    return {
      expressions,
      rollup: false,
      cube: false,
    };
  }

  /**
   * Check if a GROUP BY clause is needed based on SELECT columns
   */
  static isRequired(
    hasAggregation: boolean,
    nonAggregatedColumns: string[],
  ): boolean {
    return hasAggregation && nonAggregatedColumns.length > 0;
  }
}
