/**
 * @name PROTECTED_SCHEMAS
 * @description Schemas managed by Supabase/CMS that must never be browsed
 * through generic table access (data explorer, dashboard widgets, widget
 * preview). Mirrors `cms.validate_schema_access` in the database (which
 * only guards writes), closing the read-side gap where a wildcard data
 * permission could otherwise expose `auth.*`, `cms.*`, `vault.*`, etc. on
 * the RLS-off admin client. Dedicated explorers (users, storage) provide the
 * supported, permission-checked access to those surfaces.
 *
 * This is the single source of truth: every generic-read entry point and the
 * shared `TableQueryService` chokepoint enforce it.
 */
export const PROTECTED_SCHEMAS = new Set([
  'auth',
  'cron',
  'extensions',
  'information_schema',
  'net',
  'pgsodium',
  'pgsodium_masks',
  'pgbouncer',
  'pgtle',
  'realtime',
  'storage',
  'supabase_functions',
  'supabase_migrations',
  'vault',
  'graphql',
  'graphql_public',
  'pgmq_public',
  'cms',
]);

/**
 * @name isProtectedSchema
 * @description Returns true if the schema must not be accessed via generic
 * table reads/writes.
 */
export function isProtectedSchema(schema: string): boolean {
  const normalized = schema.toLowerCase().trim();

  // [TFG] RNF-02 (F2.7c): igual que `cms.validate_schema_access`, cualquier
  // esquema `pg_*` (catálogos de PostgreSQL) también es protegido.
  return PROTECTED_SCHEMAS.has(normalized) || normalized.startsWith('pg_');
}
