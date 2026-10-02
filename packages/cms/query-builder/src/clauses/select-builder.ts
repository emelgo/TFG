/**
 * SELECT clause builder
 *
 * Handles building SELECT clauses with support for aggregation and complex expressions.
 */
import type {
  AggregationType,
  AggregationTypeCompat,
  TimeInterval,
} from '../types/aggregation-types';
import type { SelectClause, SelectColumn } from '../types/clause-types';

export class SelectBuilder {
  private constructor() {
    // Static class - no instantiation
  }

  /**
   * Create a simple SELECT clause with columns
   */
  static columns(columns: string[]): SelectClause {
    return {
      columns: columns.map((col) => ({ expression: col })),
      distinct: false,
    };
  }

  /**
   * Create SELECT clause with aggregation
   */
  static withAggregation(config: {
    column: string;
    aggregation: AggregationTypeCompat;
    alias?: string;
  }): SelectClause {
    const { column, aggregation, alias } = config;
    const expression = this.buildAggregationExpression(aggregation, column);

    return {
      columns: [{ expression, alias }],
      distinct: false,
    };
  }

  /**
   * Create SELECT clause for time series aggregation
   */
  static forTimeSeries(config: {
    timeColumn: string;
    valueColumn?: string;
    aggregation: AggregationTypeCompat;
    timeInterval: TimeInterval;
    groupBy?: string;
  }): SelectClause {
    const { timeColumn, aggregation, timeInterval, groupBy } = config;
    const valueColumn = config.valueColumn || '*';

    const columns: SelectColumn[] = [];

    // Add time bucket column
    const timeBucketExpr = `DATE_TRUNC('${timeInterval}', "${timeColumn}")`;
    columns.push({
      expression: timeBucketExpr,
      alias: 'time_bucket',
    });

    // Add groupBy column if specified (quoted)
    if (groupBy) {
      columns.push({
        expression: `"${groupBy}"`,
      });
    }

    // Add aggregated value column
    const aggregationExpr = this.buildAggregationExpression(
      aggregation,
      valueColumn,
    );
    columns.push({
      expression: aggregationExpr,
      alias: 'value',
    });

    return {
      columns,
      distinct: false,
    };
  }

  /**
   * Build aggregation expression
   */
  static buildAggregationExpression(
    aggregation: AggregationTypeCompat,
    column: string,
  ): string {
    // Special case: When column is '*' and aggregation is not COUNT,
    // default to COUNT(*) since other aggregations don't work with *
    if (column === '*' && aggregation.toLowerCase() !== 'count') {
      return '(COUNT(*))::numeric';
    }

    const col = column === '*' ? '*' : `"${column}"`;

    // Normalize to lowercase for consistent processing
    const normalizedAgg = aggregation.toLowerCase() as AggregationType;

    switch (normalizedAgg) {
      case 'count':
        return `(COUNT(${col}))::numeric`;
      case 'sum':
        return `(SUM(${col}))::numeric`;
      case 'avg':
        return `(AVG(${col}))::numeric`;
      case 'min':
        return `(MIN(${col}))::numeric`;
      case 'max':
        return `(MAX(${col}))::numeric`;
      default:
        // Fallback to COUNT for invalid aggregation types
        console.warn(
          `Unsupported aggregation type '${aggregation}', falling back to COUNT`,
        );
        return `COUNT(*)`;
    }
  }

  /**
   * Create SELECT clause for multi-series charts
   */
  static forMultiSeriesChart(config: {
    xAxis: string;
    yAxis: string;
    aggregation: AggregationTypeCompat;
    groupByColumns: readonly string[];
    timeInterval?: TimeInterval;
  }): SelectClause {
    const { xAxis, yAxis, aggregation, groupByColumns } = config;
    const columns: SelectColumn[] = [];

    // Add xAxis column (quoted)
    columns.push({ expression: `"${xAxis}"` });

    // Add groupBy columns (quoted)
    for (const col of groupByColumns) {
      columns.push({ expression: `"${col}"` });
    }

    // Add aggregated value column
    const aggregationExpr = this.buildAggregationExpression(aggregation, yAxis);
    columns.push({
      expression: aggregationExpr,
      alias: 'value',
    });

    return { columns, distinct: false };
  }

  /**
   * Create SELECT clause for time series charts
   */
  static forTimeSeriesChart(config: {
    xAxis: string;
    yAxis: string;
    aggregation: AggregationTypeCompat;
    timeInterval: TimeInterval;
    groupBy?: string;
  }): SelectClause {
    return this.forTimeSeries({
      timeColumn: config.xAxis,
      valueColumn: config.yAxis,
      aggregation: config.aggregation,
      timeInterval: config.timeInterval,
      groupBy: config.groupBy,
    });
  }

  /**
   * Create SELECT clause for regular charts
   */
  static forRegularChart(config: {
    xAxis: string;
    yAxis: string;
    aggregation?: AggregationTypeCompat;
    groupBy?: string;
  }): SelectClause {
    const { xAxis, yAxis, aggregation } = config;
    const columns: SelectColumn[] = [];

    // Add xAxis column (quoted)
    columns.push({ expression: `"${xAxis}"` });

    if (aggregation) {
      // Add aggregated value column
      const aggregationExpr = this.buildAggregationExpression(
        aggregation,
        yAxis,
      );
      columns.push({
        expression: aggregationExpr,
        alias: 'value',
      });
    } else {
      // No aggregation - just select the column (quoted)
      columns.push({ expression: `"${yAxis}"` });
    }

    return { columns, distinct: false };
  }

  /**
   * Create SELECT clause for metric widgets
   */
  static forMetric(config: {
    metric?: string;
    aggregation: AggregationTypeCompat;
  }): SelectClause {
    const { aggregation } = config;
    const metric = config.metric || '*';

    const aggregationExpr = this.buildAggregationExpression(
      aggregation,
      metric,
    );

    return {
      columns: [{ expression: aggregationExpr, alias: 'value' }],
      distinct: false,
    };
  }

  /**
   * Create SELECT clause for table widgets
   */
  static forTable(
    config: {
      columns?: string[];
    } = {},
  ): SelectClause {
    const { columns = [] } = config;

    if (columns.length === 0) {
      return {
        columns: [{ expression: '*' }],
        distinct: false,
      };
    }

    return {
      columns: columns.map((col) => ({ expression: col })),
      distinct: false,
    };
  }

  /**
   * Merge multiple SELECT clauses
   */
  static merge(...clauses: SelectClause[]): SelectClause {
    const columns: SelectColumn[] = [];
    let distinct = false;

    for (const clause of clauses) {
      columns.push(...clause.columns);
      distinct = distinct || (clause.distinct ?? false);
    }

    return { columns, distinct };
  }
}
