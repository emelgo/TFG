import { SQL, sql } from 'drizzle-orm';

export interface FieldValuesQueryConfig {
  schemaName: string;
  tableName: string;
  fieldName: string;
  conditions: SQL[];
  limit: number;
}

export interface TopHitsQueryConfig extends FieldValuesQueryConfig {
  tableSize: number;
}

/**
 * The maximum table size for sampling.
 * If the table size is greater than this value, we will use sampling to get the top hits.
 */
const MAX_TABLE_SIZE_FOR_SAMPLING = 100000;

/**
 * Builds SQL queries for field values using Drizzle SQL template literals
 */
export class FieldValuesQueryBuilder {
  /**
   * Build query for getting unique field values
   */
  static buildUniqueValuesQuery(config: FieldValuesQueryConfig): SQL {
    const { schemaName, tableName, fieldName, conditions, limit } = config;

    const whereClause =
      conditions.length > 0
        ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
        : sql``;

    return sql`
      SELECT DISTINCT ${sql.identifier(fieldName)}::text as value
      FROM ${sql.identifier(schemaName)}.${sql.identifier(tableName)}
      ${whereClause}
      ORDER BY ${sql.identifier(fieldName)}::text
      LIMIT ${limit}
    `;
  }

  /**
   * Build fallback query for unique values (simpler conditions)
   */
  static buildUniqueValuesFallbackQuery(config: FieldValuesQueryConfig): SQL {
    const { schemaName, tableName, fieldName, conditions, limit } = config;

    // Use only IS NOT NULL and search conditions (skip empty string check)
    const fallbackConditions = [conditions[0]]; // IS NOT NULL

    if (conditions.length > 2) {
      fallbackConditions.push(conditions[2]); // Search condition if present
    }

    const whereClause = sql`WHERE ${sql.join(fallbackConditions, sql` AND `)}`;

    return sql`
      SELECT DISTINCT ${sql.identifier(fieldName)}::text as value
      FROM ${sql.identifier(schemaName)}.${sql.identifier(tableName)}
      ${whereClause}
      ORDER BY ${sql.identifier(fieldName)}::text
      LIMIT ${limit}
    `;
  }

  /**
   * Build query for getting top hits (most frequent values)
   */
  static buildTopHitsQuery(config: TopHitsQueryConfig): SQL {
    const { schemaName, tableName, fieldName, conditions, limit, tableSize } =
      config;

    const whereClause =
      conditions.length > 0
        ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
        : sql``;

    // For large tables (>100k rows), use sampling for better performance
    if (tableSize > MAX_TABLE_SIZE_FOR_SAMPLING) {
      return sql`
        SELECT ${sql.identifier(fieldName)}::text as value, COUNT(*) as count
        FROM (
          SELECT ${sql.identifier(fieldName)}
          FROM ${sql.identifier(schemaName)}.${sql.identifier(tableName)}
          ${whereClause}
          ORDER BY RANDOM()
          LIMIT 10000
        ) sampled
        GROUP BY ${sql.identifier(fieldName)}
        ORDER BY COUNT(*) DESC, ${sql.identifier(fieldName)}::text
        LIMIT ${Math.min(limit, 5)}
      `;
    }

    // For smaller tables, use full scan
    return sql`
      SELECT ${sql.identifier(fieldName)}::text as value, COUNT(*) as count
      FROM ${sql.identifier(schemaName)}.${sql.identifier(tableName)}
      ${whereClause}
      GROUP BY ${sql.identifier(fieldName)}
      ORDER BY COUNT(*) DESC, ${sql.identifier(fieldName)}::text
      LIMIT ${Math.min(limit, 5)}
    `;
  }

  /**
   * Build fallback query for top hits (simpler conditions)
   */
  static buildTopHitsFallbackQuery(config: TopHitsQueryConfig): SQL {
    const { schemaName, tableName, fieldName, conditions, limit } = config;

    // Use only IS NOT NULL condition
    const fallbackConditions = [conditions[0]];
    const whereClause = sql`WHERE ${sql.join(fallbackConditions, sql` AND `)}`;

    return sql`
      SELECT ${sql.identifier(fieldName)}::text as value, COUNT(*) as count
      FROM ${sql.identifier(schemaName)}.${sql.identifier(tableName)}
      ${whereClause}
      GROUP BY ${sql.identifier(fieldName)}
      ORDER BY COUNT(*) DESC, ${sql.identifier(fieldName)}::text
      LIMIT ${Math.min(limit, 5)}
    `;
  }

  /**
   * Build query for estimating table size
   */
  static buildTableSizeQuery(schemaName: string, tableName: string): SQL {
    return sql`
      SELECT reltuples::BIGINT as estimate
      FROM pg_class
      WHERE relname = ${tableName} 
        AND relnamespace = (
          SELECT oid FROM pg_namespace WHERE nspname = ${schemaName}
        )
    `;
  }

  /**
   * Build WHERE conditions for field queries
   */
  static buildWhereConditions(params: {
    fieldName: string;
    includeNotNull?: boolean;
    includeNotEmpty?: boolean;
    searchPattern?: string;
  }): SQL[] {
    const {
      fieldName,
      includeNotNull = true,
      includeNotEmpty = false,
      searchPattern,
    } = params;
    const conditions: SQL[] = [];

    if (includeNotNull) {
      conditions.push(sql`${sql.identifier(fieldName)} IS NOT NULL`);
    }

    if (includeNotEmpty) {
      conditions.push(sql`${sql.identifier(fieldName)} != ''`);
    }

    if (searchPattern) {
      conditions.push(
        sql`${sql.identifier(fieldName)}::text ILIKE ${searchPattern}`,
      );
    }

    return conditions;
  }
}
