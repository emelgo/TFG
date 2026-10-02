/**
 * Forma de un UUID en los parámetros de las rutas del CMS.
 *
 * Las fichas (`.../$id`) lo comprueban en su `loader` antes de llamar a la
 * API: un id mal formado se muestra como «no encontrado» sin hacer la
 * petición (la API lo rechazaría igualmente con 400).
 */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
