/**
 * Estado de la ficha de un registro en la URL (*search params*).
 *
 * La ficha tiene dos rutas (ver `apps/web/src/routes/admin/cms/resources/
 * $schema/$table/record/`):
 *
 *  - `.../record/$id`: clave de una sola columna, en la ruta.
 *  - `.../record?col1=a&col2=b`: clave compuesta; cada columna de la clave
 *    es un parámetro de la URL, igual que genera `buildResourceUrl`.
 *
 * En ambas, la página visible de cada sección de registros relacionados
 * (uno a muchos) también vive en la URL, en `relatedPages`
 * (`{"public.accounts_memberships.account_id": 2}`), para que «atrás» y los
 * enlaces compartidos conserven la paginación. Por eso `relatedPages` es un
 * nombre reservado: no se interpreta como columna de la clave.
 *
 * TanStack Router interpreta cada parámetro como JSON, así que `?id=123`
 * llega como número y aquí se vuelve a convertir a texto: la API compara
 * con el tipo real de la columna. (Un texto con forma de número, como
 * `1e3`, se normalizaría; en claves primarias es un caso muy raro.)
 */
import * as z from 'zod';

/** Parámetro reservado con la página de cada sección relacionada. */
export const RELATED_PAGES_PARAM = 'relatedPages';

export const RecordSearchSchema = z.object({
  relatedPages: z
    .record(z.string(), z.number().int().min(1))
    .optional()
    .catch(undefined),
});

export type RecordSearch = z.output<typeof RecordSearchSchema>;

/** URL de la ficha por clave compuesta: columnas de la clave + `relatedPages`. */
export type RecordKeysSearch = RecordSearch & { [column: string]: unknown };

/**
 * Extrae las columnas de la clave de los parámetros de la URL, como texto.
 * Se descartan `relatedPages` y los valores que no son escalares (un objeto
 * no puede ser el valor de una clave).
 */
export function getRecordKeysFromSearch(search: Record<string, unknown>) {
  const keys: Record<string, string> = {};

  for (const [column, value] of Object.entries(search)) {
    if (column === RELATED_PAGES_PARAM) {
      continue;
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      keys[column] = String(value);
    }
  }

  return keys;
}

/**
 * Valida la URL de la ficha por clave compuesta (`validateSearch`): conserva
 * las columnas de la clave como texto y valida `relatedPages` con Zod.
 */
export function parseRecordKeysSearch(
  raw: Record<string, unknown>,
): RecordKeysSearch {
  const { relatedPages } = RecordSearchSchema.parse(raw);
  const keys = getRecordKeysFromSearch(raw);

  return relatedPages ? { ...keys, relatedPages } : keys;
}

/** Página (desde 1) de una sección relacionada. */
export function getRelatedPage(search: RecordSearch, relationKey: string) {
  return search.relatedPages?.[relationKey] ?? 1;
}

/**
 * Devuelve la URL con otra página para una sección relacionada. La página 1
 * es la de por defecto y no se escribe, para que la URL quede limpia.
 */
export function withRelatedPage<T extends RecordSearch>(
  search: T,
  relationKey: string,
  page: number,
): T {
  const { [relationKey]: _previous, ...others } = search.relatedPages ?? {};
  const relatedPages = page > 1 ? { ...others, [relationKey]: page } : others;

  return {
    ...search,
    relatedPages:
      Object.keys(relatedPages).length > 0 ? relatedPages : undefined,
  };
}
