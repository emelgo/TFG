/**
 * Construcción de la URL de la ficha de un registro y de su identificador.
 *
 * Un registro se identifica por su clave primaria; si no la tiene, por una
 * restricción `unique` con todas sus columnas presentes. Con una sola columna
 * la URL es `/record/<valor>`; con varias (clave compuesta), los valores van
 * como parámetros: `/record?col1=a&col2=b`. Si la tabla no tiene nada que
 * identifique la fila de forma inequívoca no se genera enlace: abrir «la
 * primera fila que coincida» podría mostrar (o, más adelante, editar) otra.
 */
import { DATA_EXPLORER_BASE_PATH } from './paths';

/**
 * Devuelve la URL de la ficha del registro, o una cadena vacía si no se
 * puede identificar.
 */
export function buildResourceUrl<
  Config extends {
    primary_keys: Array<{ column_name: string }>;
    unique_constraints: Array<{
      constraint_name: string;
      columns?: string[];
    }>;
  },
>(params: {
  schema: string;
  table: string;
  record: Record<string, unknown>;
  tableMetadata: Config;
}) {
  const { schema, table, record, tableMetadata } = params;
  const base = `${DATA_EXPLORER_BASE_PATH}/${schema}/${table}/record`;

  const primaryKeys = Array.from(
    new Set(
      (tableMetadata.primary_keys ?? [])
        .map((pk) => pk.column_name)
        .filter(Boolean),
    ),
  );

  if (primaryKeys.length === 1) {
    const pkValue = record[primaryKeys[0]!];

    // `0` y `''` son claves válidas: solo se descarta la ausencia de valor.
    if (pkValue === undefined || pkValue === null) {
      return '';
    }

    // Se codifica para que una `/`, `#` o `?` del valor no cambie la ruta.
    return `${base}/${encodeURIComponent(String(pkValue))}`;
  }

  if (primaryKeys.length > 1) {
    const search = new URLSearchParams();

    for (const pk of primaryKeys) {
      search.append(pk, String(record[pk]));
    }

    return `${base}?${search.toString()}`;
  }

  // Sin clave primaria: la primera restricción `unique` con valores en todas
  // sus columnas. Solo se usan las que declaran sus columnas explícitamente.
  for (const constraint of tableMetadata.unique_constraints ?? []) {
    const columns = (constraint.columns ?? []).filter(Boolean);

    if (columns.length === 0 || !columns.every((col) => record[col] != null)) {
      continue;
    }

    if (columns.length === 1) {
      return `${base}/${encodeURIComponent(String(record[columns[0]!]))}`;
    }

    const search = new URLSearchParams();

    for (const col of columns) {
      search.append(col, String(record[col]));
    }

    return `${base}?${search.toString()}`;
  }

  return '';
}
