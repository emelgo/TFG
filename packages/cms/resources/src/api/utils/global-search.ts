/**
 * Utilidades puras de la búsqueda global del CMS (`GET /v1/resources/search`).
 *
 * `cms.global_search` devuelve, por cada coincidencia, la fila completa
 * (`record`). La paleta de búsqueda solo necesita el título, la tabla y la
 * clave para enlazar a la ficha, así que la API recorta cada resultado a eso
 * (`toGlobalSearchResponse`): minimizar lo que viaja reduce lo que podría
 * filtrarse si algún día una columna sensible entra en una tabla legible.
 *
 * También fija los límites que la API acepta (`GlobalSearchQuerySchema`):
 * texto de 2 a 100 caracteres, como mucho 20 resultados y 5 s de consulta.
 * La función SQL vuelve a acotar texto y resultados por su cuenta (defensa
 * en profundidad).
 *
 * [TFG] RNF-02 · RF-09.
 */
import * as z from 'zod';

import type { GlobalSearchResponse } from '../../types';

/** Longitud máxima del texto buscado. */
export const GLOBAL_SEARCH_MAX_QUERY_LENGTH = 100;

/** Resultados máximos por petición. */
export const GLOBAL_SEARCH_MAX_LIMIT = 20;

/**
 * Tiempo máximo de una búsqueda (ms). Lo aplica el servicio a su transacción
 * con `statement_timeout` antes de llamar a `cms.global_search`; si se supera,
 * PostgreSQL cancela la consulta y la ruta responde `GLOBAL_SEARCH_FAILED`.
 * Es menor que el tope de 15 s de la función: la paleta de búsqueda es
 * interactiva y no merece la pena esperar más.
 */
export const GLOBAL_SEARCH_STATEMENT_TIMEOUT_MS = 5000;

/** Parámetros de `GET /v1/resources/search`. */
export const GlobalSearchQuerySchema = z.object({
  query: z.string().trim().min(2).max(GLOBAL_SEARCH_MAX_QUERY_LENGTH),
  limit: z.coerce.number().int().min(1).max(GLOBAL_SEARCH_MAX_LIMIT).optional(),
  offset: z.coerce.number().int().min(0).max(200).optional(),
});

/** Un resultado tal como llega a la interfaz. */
export type GlobalSearchItem = {
  schemaName: string;
  tableName: string;
  tableDisplay: string;
  title: string;
  /** Columnas de la clave primaria y su valor como texto (para el enlace). */
  keys: Record<string, string>;
};

/**
 * Recorta la respuesta de `cms.global_search` a lo que usa la interfaz.
 *
 * - Se descarta la fila completa: solo se conservan los valores de las
 *   columnas de la clave primaria.
 * - Un resultado sin todos los valores de su clave no se puede abrir, así
 *   que se omite.
 *
 * @throws Error si la función SQL informa de un fallo (`error`): la ruta lo
 *   traduce a un código estable sin su texto.
 */
export function toGlobalSearchResponse(
  response: GlobalSearchResponse | null | undefined,
) {
  if (!response) {
    return { results: [] as GlobalSearchItem[], hasMore: false };
  }

  if (response.error) {
    throw new Error(`global_search failed: ${response.error}`);
  }

  const results: GlobalSearchItem[] = [];

  for (const result of response.results ?? []) {
    const keys: Record<string, string> = {};
    // Sin repetidos: el metadato de algunas tablas lista dos veces la misma.
    const keyColumns = [...new Set(result.primary_keys ?? [])];

    for (const column of keyColumns) {
      const value = result.record?.[column];

      if (value !== null && value !== undefined) {
        keys[column] = String(value);
      }
    }

    if (
      keyColumns.length === 0 ||
      Object.keys(keys).length !== keyColumns.length
    ) {
      continue;
    }

    results.push({
      schemaName: result.schema_name,
      tableName: result.table_name,
      tableDisplay: result.table_display,
      title: result.title ?? '',
      keys,
    });
  }

  return { results, hasMore: response.has_more === true };
}
