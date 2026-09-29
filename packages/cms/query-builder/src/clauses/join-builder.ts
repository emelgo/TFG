/**
 * JOIN clause builder
 *
 * Handles building JOIN clauses for table relationships.
 */
import type { JoinClause } from '../types/clause-types';

export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';

export interface JoinConfig {
  type: JoinType;
  schema?: string;
  table: string;
  alias?: string;
  condition: string;
}

export class JoinBuilder {
  private constructor() {
    // Static class - no instantiation
  }

  /**
   * Create a single JOIN clause
   */
  static create(config: JoinConfig): JoinClause {
    const { type, schema, table, alias, condition } = config;

    return {
      type,
      table: {
        schema: schema || 'public',
        table,
        alias,
      },
      condition,
    };
  }

  /**
   * Create an INNER JOIN
   */
  static inner(
    table: string,
    condition: string,
    options?: { schema?: string; alias?: string },
  ): JoinClause {
    return this.create({
      type: 'INNER',
      table,
      condition,
      ...options,
    });
  }

  /**
   * Create a LEFT JOIN
   */
  static left(
    table: string,
    condition: string,
    options?: { schema?: string; alias?: string },
  ): JoinClause {
    return this.create({
      type: 'LEFT',
      table,
      condition,
      ...options,
    });
  }

  /**
   * Create a RIGHT JOIN
   */
  static right(
    table: string,
    condition: string,
    options?: { schema?: string; alias?: string },
  ): JoinClause {
    return this.create({
      type: 'RIGHT',
      table,
      condition,
      ...options,
    });
  }

  /**
   * Create a FULL OUTER JOIN
   */
  static full(
    table: string,
    condition: string,
    options?: { schema?: string; alias?: string },
  ): JoinClause {
    return this.create({
      type: 'FULL',
      table,
      condition,
      ...options,
    });
  }

  /**
   * Create multiple JOIN clauses from configs
   */
  static fromConfigs(configs: JoinConfig[]): JoinClause[] {
    return configs.map((config) => this.create(config));
  }

  /**
   * Create a JOIN using foreign key relationship
   */
  static byForeignKey(config: {
    type?: JoinType;
    fromTable: string;
    fromColumn: string;
    toTable: string;
    toColumn: string;
    toSchema?: string;
    toAlias?: string;
  }): JoinClause {
    const {
      type = 'INNER',
      fromTable,
      fromColumn,
      toTable,
      toColumn,
      toSchema,
      toAlias,
    } = config;

    const condition = `${fromTable}.${fromColumn} = ${toAlias || toTable}.${toColumn}`;

    return this.create({
      type,
      schema: toSchema,
      table: toTable,
      alias: toAlias,
      condition,
    });
  }

  /**
   * Validate JOIN condition for SQL injection prevention
   */
  static validateCondition(condition: string): boolean {
    // Basic validation - should not contain dangerous SQL keywords
    const dangerousPatterns = [
      /;\s*DELETE/i,
      /;\s*DROP/i,
      /;\s*UPDATE/i,
      /;\s*INSERT/i,
      /;\s*CREATE/i,
      /;\s*ALTER/i,
      /;\s*EXEC/i,
      /;\s*EXECUTE/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(condition)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Merge JOIN clauses while avoiding duplicates
   */
  static merge(...joinArrays: JoinClause[][]): JoinClause[] {
    const result: JoinClause[] = [];
    const seen = new Set<string>();

    for (const joins of joinArrays) {
      for (const join of joins) {
        // Create a unique key for the join
        const key = `${join.type}-${join.table.schema}-${join.table.table}-${join.condition}`;

        if (!seen.has(key)) {
          seen.add(key);
          result.push(join);
        }
      }
    }

    return result;
  }
}
