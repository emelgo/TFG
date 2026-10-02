/**
 * Core QueryBuilder orchestrator class
 *
 * This class provides a fluent interface for building SQL queries
 * with immutable operations and strong type safety.
 */
import { type SQL, sql } from 'drizzle-orm';

import type { FilterCondition } from '@pymekit/cms-filters-core';

import { WhereBuilder } from '../clauses/where-builder';
import type {
  GroupByClause,
  HavingClause,
  JoinClause,
  LimitClause,
  OrderByExpression,
  SelectClause,
  WhereClause,
} from '../types/clause-types';
import type {
  QueryMetadata,
  QueryResult,
  TableReference,
} from '../types/query-types';

type QueryBuilderState = {
  _select: SelectClause | null;
  _joins: readonly JoinClause[];
  _where: WhereClause | null;
  _groupBy: GroupByClause | null;
  _having: HavingClause | null;
  _orderBy: readonly OrderByExpression[];
  _limit: LimitClause | null;
};

export interface QueryBuilderOptions {
  readonly escapeIdentifiers?: boolean;
  readonly validateSql?: boolean;
  readonly generateParameters?: boolean;
}

export class QueryBuilder {
  private readonly _table: TableReference;
  private readonly _select: SelectClause | null = null;
  private readonly _joins: readonly JoinClause[] = [];
  private readonly _where: WhereClause | null = null;
  private readonly _groupBy: GroupByClause | null = null;
  private readonly _having: HavingClause | null = null;
  private readonly _orderBy: readonly OrderByExpression[] = [];
  private readonly _limit: LimitClause | null = null;
  private readonly _options: QueryBuilderOptions;

  private constructor(
    table: TableReference,
    options: QueryBuilderOptions = {},
    state: Partial<QueryBuilderState> = {},
  ) {
    this._table = table;
    this._options = { escapeIdentifiers: true, validateSql: true, ...options };

    // Copy state from previous builder (for immutability)
    this._select = state._select ?? null;
    this._joins = state._joins ?? [];
    this._where = state._where ?? null;
    this._groupBy = state._groupBy ?? null;
    this._having = state._having ?? null;
    this._orderBy = state._orderBy ?? [];
    this._limit = state._limit ?? null;
  }

  /**
   * Create a new QueryBuilder for a table
   */
  static from(schema: string, table: string, alias?: string): QueryBuilder {
    return new QueryBuilder({ schema, table, alias });
  }

  /**
   * Create a new QueryBuilder with table reference
   */
  static fromTable(table: TableReference): QueryBuilder {
    return new QueryBuilder(table);
  }

  /**
   * Add SELECT clause (immutable)
   */
  select(selectClause: SelectClause): QueryBuilder {
    return this.clone({ _select: selectClause });
  }

  /**
   * Add JOIN clause (immutable)
   */
  join(joinClause: JoinClause): QueryBuilder {
    return this.clone({ _joins: [...this._joins, joinClause] });
  }

  /**
   * Add multiple JOINs (immutable)
   */
  joins(joinClauses: readonly JoinClause[]): QueryBuilder {
    return this.clone({ _joins: [...this._joins, ...joinClauses] });
  }

  /**
   * Add WHERE clause (immutable)
   */
  where(whereClause: WhereClause): QueryBuilder {
    return this.clone({ _where: whereClause });
  }

  /**
   * Add WHERE conditions from filters (immutable)
   * Uses WhereBuilder with filters-core integration for comprehensive filter support
   */
  whereFilters(filters: readonly FilterCondition[]): QueryBuilder {
    if (filters.length === 0) return this.clone(); // Create new instance even with empty filters

    // Delegate to WhereBuilder for comprehensive filter processing including relative dates
    const whereClause = WhereBuilder.fromFilters(filters as FilterCondition[]);

    return whereClause ? this.where(whereClause) : this.clone();
  }

  /**
   * Add GROUP BY clause (immutable)
   */
  groupBy(groupByClause: GroupByClause): QueryBuilder {
    return this.clone({ _groupBy: groupByClause });
  }

  /**
   * Add HAVING clause (immutable)
   */
  having(havingClause: HavingClause): QueryBuilder {
    return this.clone({ _having: havingClause });
  }

  /**
   * Add ORDER BY expressions (immutable)
   */
  orderBy(expressions: readonly OrderByExpression[]): QueryBuilder {
    return this.clone({ _orderBy: [...this._orderBy, ...expressions] });
  }

  /**
   * Add single ORDER BY expression (immutable)
   */
  orderByExpression(expression: OrderByExpression): QueryBuilder {
    return this.orderBy([expression]);
  }

  /**
   * Add LIMIT clause (immutable)
   */
  limit(limit: number, offset?: number): QueryBuilder {
    return this.clone({ _limit: { limit, offset } });
  }

  /**
   * Build the final SQL query
   */
  build(): QueryResult {
    const sqlQuery = this.buildSql();
    const metadata = this.buildMetadata();

    return { sql: sqlQuery, metadata };
  }

  /**
   * Create a copy with modified state (immutability helper)
   */
  private clone(state: Partial<QueryBuilderState> = {}): QueryBuilder {
    return new QueryBuilder(this._table, this._options, {
      _select: this._select,
      _joins: this._joins,
      _where: this._where,
      _groupBy: this._groupBy,
      _having: this._having,
      _orderBy: this._orderBy,
      _limit: this._limit,
      ...state,
    });
  }

  /**
   * Build the SQL query using Drizzle's SQL template
   */
  private buildSql(): SQL {
    const query = sql.empty();

    // SELECT clause
    if (this._select) {
      query.append(this.buildSelectSql(this._select));
    } else {
      query.append(sql`SELECT *`);
    }

    // FROM clause
    query.append(sql` `);
    query.append(this.buildFromSql());

    // JOIN clauses
    if (this._joins.length > 0) {
      for (const join of this._joins) {
        query.append(sql` `);
        query.append(this.buildJoinSql(join));
      }
    }

    // WHERE clause
    if (this._where) {
      query.append(sql` `);
      query.append(this.buildWhereSql(this._where));
    }

    // GROUP BY clause
    if (this._groupBy) {
      query.append(sql` `);
      query.append(this.buildGroupBySql(this._groupBy));
    }

    // HAVING clause
    if (this._having) {
      query.append(sql` `);
      query.append(this.buildHavingSql(this._having));
    }

    // ORDER BY clause
    if (this._orderBy.length > 0) {
      query.append(sql` `);
      query.append(this.buildOrderBySql(this._orderBy));
    }

    // LIMIT clause
    if (this._limit) {
      query.append(sql` `);
      query.append(this.buildLimitSql(this._limit));
    }

    return query;
  }

  /**
   * Build the SELECT clause
   */
  private buildSelectSql(select: SelectClause): SQL {
    const columns = select.columns.map((col) => {
      const expr = col.aggregation
        ? sql`${sql.raw(col.aggregation.type)}(${sql.raw(col.expression)})`
        : sql.raw(col.expression);

      return col.alias ? sql`${expr} AS ${sql.identifier(col.alias)}` : expr;
    });

    if (select.distinct) {
      return sql`SELECT DISTINCT ${sql.join(columns, sql`, `)}`;
    } else {
      return sql`SELECT ${sql.join(columns, sql`, `)}`;
    }
  }

  /**
   * Build the FROM clause
   */
  private buildFromSql(): SQL {
    // Default to 'public' schema when schema is empty or undefined
    const schema = this._table.schema || 'public';
    const schemaId = sql.identifier(schema);
    const tableId = sql.identifier(this._table.table);
    const tableName = sql`${schemaId}.${tableId}`;

    return this._table.alias
      ? sql`FROM ${tableName} ${sql.identifier(this._table.alias)}`
      : sql`FROM ${tableName}`;
  }

  /**
   * Build the JOIN clause
   */
  private buildJoinSql(join: JoinClause): SQL {
    // Default to 'public' schema when schema is empty or undefined
    const schema = join.table.schema || 'public';
    const schemaId = sql.identifier(schema);
    const tableId = sql.identifier(join.table.table);
    const tableName = sql`${schemaId}.${tableId}`;

    if (join.table.alias) {
      return sql`${sql.raw(join.type)} JOIN ${tableName} ${sql.identifier(join.table.alias)} ON ${sql.raw(join.condition)}`;
    } else {
      return sql`${sql.raw(join.type)} JOIN ${tableName} ON ${sql.raw(join.condition)}`;
    }
  }

  /**
   * Build the WHERE clause
   */
  private buildWhereSql(where: WhereClause): SQL {
    if (where.conditions.length === 0) return sql``;

    const connector = where.combineWith === 'AND' ? sql` AND ` : sql` OR `;
    const combined = sql.join([...where.conditions], connector);

    return sql`WHERE ${combined}`;
  }

  /**
   * Build the GROUP BY clause
   */
  private buildGroupBySql(groupBy: GroupByClause): SQL {
    const expressions = groupBy.expressions.map((expr) => sql.raw(expr));

    if (groupBy.rollup) {
      return sql`GROUP BY ROLLUP(${sql.join(expressions, sql`, `)})`;
    }

    if (groupBy.cube) {
      return sql`GROUP BY CUBE(${sql.join(expressions, sql`, `)})`;
    }

    return sql`GROUP BY ${sql.join(expressions, sql`, `)}`;
  }

  /**
   * Build the HAVING clause
   */
  private buildHavingSql(having: HavingClause): SQL {
    if (having.conditions.length === 0) return sql``;

    const connector = having.combineWith === 'AND' ? sql` AND ` : sql` OR `;
    const combined = sql.join([...having.conditions], connector);
    return sql`HAVING ${combined}`;
  }

  /**
   * Build the ORDER BY clause
   */
  private buildOrderBySql(orderBy: readonly OrderByExpression[]): SQL {
    const expressions = orderBy.map((expr) => {
      const orderExpr = sql.raw(expr.expression);
      const base = sql`${orderExpr} ${sql.raw(expr.direction)}`;

      if (expr.nullsFirst !== undefined) {
        const nullsClause = expr.nullsFirst ? 'FIRST' : 'LAST';
        return sql`${base} NULLS ${sql.raw(nullsClause)}`;
      }
      return base;
    });

    return sql`ORDER BY ${sql.join(expressions, sql`, `)}`;
  }

  /**
   * Build the LIMIT clause
   */
  private buildLimitSql(limit: LimitClause): SQL {
    if (limit.offset && limit.offset > 0) {
      return sql`LIMIT ${limit.limit} OFFSET ${limit.offset}`;
    } else {
      return sql`LIMIT ${limit.limit}`;
    }
  }

  /**
   * Build the metadata for the query
   */
  private buildMetadata(): QueryMetadata {
    // Check for aggregation functions
    const hasAggregation =
      this._select?.columns.some((col) =>
        col.expression?.match(/^(COUNT|SUM|AVG|MIN|MAX)\s*\(/i),
      ) ?? false;

    // Check for time series pattern
    const isTimeSeries =
      this._select?.columns.some((col) =>
        col.expression?.includes('DATE_TRUNC'),
      ) ||
      this._groupBy?.expressions.some((expr) => expr?.includes('DATE_TRUNC')) ||
      false;

    // Determine query type
    let queryType: QueryMetadata['queryType'] = 'SELECT';
    if (isTimeSeries) {
      queryType = 'TIME_SERIES';
    } else if (hasAggregation) {
      queryType = 'AGGREGATE';
    }

    return {
      queryType,
      hasAggregation,
      isTimeSeries,
    };
  }
}
