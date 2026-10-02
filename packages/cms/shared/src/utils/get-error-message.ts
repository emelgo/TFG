/**
 * @name getErrorMessage
 * @description Get the error message from an error
 * @param error - The error to get the message from
 * @returns The error message
 */
export function getErrorMessage(error: unknown) {
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else {
    message = String(error);
  }

  // check if message is an RLS error and return a more user friendly message
  if (message.includes('new row violates row-level security policy')) {
    message =
      'The database business rule disallows this action. Please contact the administrator.';
  }

  return message;
}

/**
 * Markers that indicate a database/internal error whose raw text would leak
 * implementation details (SQLSTATE codes, schema/table/column existence, types,
 * internal SQL, search_path, catalog names) to the client.
 */
const DB_INTERNAL_MARKERS = [
  'SQLSTATE',
  'search_path',
  'pg_catalog',
  'information_schema',
  'syntax error',
  'does not exist',
  'at character',
  'LINE ',
];

const GENERIC_PUBLIC_ERROR_MESSAGE =
  'An unexpected error occurred while processing your request. Please try again or contact your administrator.';

/**
 * @name getPublicErrorMessage
 * @description Like {@link getErrorMessage}, but safe to return to untrusted
 * clients: error text that exposes database internals (DB structure, types,
 * SQLSTATE, internal SQL) is replaced with a generic message. Callers should log
 * the original error separately for debugging.
 * @param error - The error to get a client-safe message from
 */
export function getPublicErrorMessage(error: unknown) {
  const message = getErrorMessage(error);

  const leaksInternals = DB_INTERNAL_MARKERS.some((marker) =>
    message.includes(marker),
  );

  return leaksInternals ? GENERIC_PUBLIC_ERROR_MESSAGE : message;
}
