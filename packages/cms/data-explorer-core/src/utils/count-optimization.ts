import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

/**
 * Enhanced fast approximate count with accuracy & freshness guards.
 * - O(1) path via pg_stat_all_tables.n_live_tup / pg_class.reltuples
 * - Falls back to exact COUNT(*) for small tables or stale stats
 * - Works for plain ('r'/'m') and partitioned ('p') tables
 */
export function buildApproximateCountQuery(
  schema: string,
  table: string,
  threshold = 100_000, // use approximate at/above this
  staleSeconds = 900, // stats considered stale after 15 minutes
): SQL {
  return sql`
    WITH target AS (
      SELECT c.oid, c.relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ${schema} AND c.relname = ${table}
      LIMIT 1
    ),
    rels AS (
      -- include the table itself; if partitioned, include children too
      SELECT t.oid
      FROM target t
      UNION ALL
      SELECT i.inhrelid
      FROM pg_inherits i
      JOIN target t ON t.oid = i.inhparent
    ),
    stats AS (
      SELECT
        COALESCE(SUM(COALESCE(s.n_live_tup::bigint, c.reltuples::bigint)), 0) AS instant_estimate,
        COALESCE(SUM(c.relpages)::bigint, 0)                                  AS pages_sum,
        COALESCE(MAX(
          GREATEST(
            COALESCE(EXTRACT(EPOCH FROM (now() - s.last_analyze)), 1),
            COALESCE(EXTRACT(EPOCH FROM (now() - s.last_autoanalyze)), 1)
          )
        ), 1e9)                                                                AS worst_analyze_age_s,
        MAX(c.relkind)                                                         AS relkind
      FROM rels r
      JOIN pg_class c ON c.oid = r.oid
      LEFT JOIN pg_stat_all_tables s ON s.relid = c.oid
    ),
    choice AS (
      SELECT
        instant_estimate,
        pages_sum,
        worst_analyze_age_s,
        relkind,
        CASE
          WHEN instant_estimate >= ${threshold}
           AND worst_analyze_age_s <= ${staleSeconds}
           AND pages_sum > 0
          THEN instant_estimate
          ELSE NULL
        END AS optimized_count
      FROM stats
    )
    SELECT COALESCE(
      optimized_count,
      (SELECT COUNT(*)::bigint FROM ${sql.identifier(schema)}.${sql.identifier(table)})
    ) AS __cms_total_count
    FROM choice;
  `;
}
