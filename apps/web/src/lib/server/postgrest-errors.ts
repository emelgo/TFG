/**
 * Indica si un error de PostgREST es el caso "ninguna fila": una consulta
 * `.single()`/`.maybeSingle()` que no encontró nada (código `PGRST116`).
 *
 * Sirve para distinguir una fila que de verdad no existe (cuenta borrada o
 * JWT obsoleto, que lleva a la portada) de un fallo transitorio de la base de
 * datos o de la RLS, que debe relanzarse para que lo muestre el límite de
 * errores en lugar de disfrazarlo de redirección.
 */
export function isNoRowsError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'PGRST116'
  );
}
