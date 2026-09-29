/**
 * Shared `validateSearch` readers for the auth routes.
 *
 * The router's default search parser runs `JSON.parse` on each value, so a
 * value like `locked=true` arrives as a boolean rather than a string. Keep
 * these helpers colocated so the auth routes normalize search params the same
 * way.
 */

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Normalize a boolean-ish flag to `true | undefined`.
 *
 * Keep it a boolean (not the string `'true'`): the router serializes search
 * values with `JSON.stringify`, so a boolean stays a clean `locked=true` while
 * a string becomes a quoted `locked=%22true%22`.
 */
export function readFlag(value: unknown): true | undefined {
  return value === true || value === 'true' ? true : undefined;
}
