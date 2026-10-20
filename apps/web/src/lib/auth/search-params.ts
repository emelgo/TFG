/**
 * Lectores comunes de parámetros de búsqueda para `validateSearch` en las
 * rutas de autenticación.
 *
 * El analizador por defecto del *router* aplica `JSON.parse` a cada valor, así
 * que `locked=true` llega como booleano y no como texto. Se agrupan aquí para
 * que todas las rutas de autenticación los normalicen igual.
 */

/** Devuelve el valor si es un texto no vacío; si no, `undefined`. */
export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Normaliza un indicador a `true | undefined`.
 *
 * Se devuelve un booleano (no el texto `'true'`) porque el *router* serializa
 * los parámetros con `JSON.stringify`: un booleano queda como `locked=true` y
 * un texto, entre comillas (`locked=%22true%22`).
 */
export function readFlag(value: unknown): true | undefined {
  return value === true || value === 'true' ? true : undefined;
}
