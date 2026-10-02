/**
 * Utilidades puras de la búsqueda global del CMS (paleta Cmd/Ctrl+K).
 *
 * - `normalizeGlobalSearchQuery`: decide si un texto se busca (de 2 a 100
 *   caracteres, los mismos límites que la API).
 * - `groupGlobalSearchResults`: agrupa los resultados por tabla conservando
 *   el orden de relevancia que devuelve la API (el grupo de la mejor
 *   coincidencia va primero).
 * - `getGlobalSearchResultUrl`: URL de la ficha del registro, con la misma
 *   regla que el resto del explorador (`buildResourceUrl`).
 *
 * Probadas en `__tests__/global-search.test.ts`.
 */
import type { CmsGlobalSearchItem } from '@pymekit/cms-ui-core/api';

import { buildResourceUrl } from './build-resource-url';

/** Espera tras la última pulsación antes de buscar. */
export const GLOBAL_SEARCH_DEBOUNCE_MS = 300;

/** Longitud mínima y máxima del texto buscado (las mismas que la API). */
export const GLOBAL_SEARCH_MIN_LENGTH = 2;
export const GLOBAL_SEARCH_MAX_LENGTH = 100;

/** Resultados de una tabla. */
export type GlobalSearchGroup = {
  /** `esquema.tabla`. */
  key: string;
  schemaName: string;
  tableName: string;
  tableDisplay: string;
  items: CmsGlobalSearchItem[];
};

/**
 * Devuelve el texto que se debe buscar o `null` si es demasiado corto. Un
 * texto demasiado largo se recorta (la API lo rechazaría con un 400).
 */
export function normalizeGlobalSearchQuery(text: string) {
  const query = text.trim().slice(0, GLOBAL_SEARCH_MAX_LENGTH).trim();

  return query.length >= GLOBAL_SEARCH_MIN_LENGTH ? query : null;
}

/** Agrupa los resultados por tabla en orden de primera aparición. */
export function groupGlobalSearchResults(
  results: CmsGlobalSearchItem[],
): GlobalSearchGroup[] {
  const groups = new Map<string, GlobalSearchGroup>();

  for (const item of results) {
    const key = `${item.schemaName}.${item.tableName}`;
    const group = groups.get(key);

    if (group) {
      group.items.push(item);
    } else {
      groups.set(key, {
        key,
        schemaName: item.schemaName,
        tableName: item.tableName,
        tableDisplay: item.tableDisplay || item.tableName,
        items: [item],
      });
    }
  }

  return [...groups.values()];
}

/**
 * URL de la ficha de un resultado: `/record/<valor>` con una columna de
 * clave y `/record?col=valor&…` con una compuesta. Cadena vacía si no hay
 * clave (la API ya descarta esos resultados).
 */
export function getGlobalSearchResultUrl(item: CmsGlobalSearchItem) {
  return buildResourceUrl({
    // Los nombres vienen de la base de datos: se codifican para que un
    // identificador con `/`, `?` o `#` no cambie la ruta de destino.
    schema: encodeURIComponent(item.schemaName),
    table: encodeURIComponent(item.tableName),
    record: item.keys,
    tableMetadata: {
      primary_keys: Object.keys(item.keys).map((column_name) => ({
        column_name,
      })),
      unique_constraints: [],
    },
  });
}
