/**
 * True when a PostgREST error is the "no rows returned" case — i.e. a
 * `.single()`/`.maybeSingle()` query that matched nothing (code `PGRST116`).
 *
 * Used to distinguish a genuinely-missing row (deleted account / stale JWT →
 * redirect home) from a transient DB or RLS failure, which must be re-thrown so
 * the error boundary surfaces it instead of masking it as a not-found redirect.
 */
export function isNoRowsError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'PGRST116'
  );
}
