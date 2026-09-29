/**
 * Identificación de un registro por su clave.
 *
 * La URL `.../record/$id` solo lleva el valor, no el nombre de la columna:
 * `buildResourceUrl` la genera cuando la tabla se identifica con una sola
 * columna (su clave primaria o, si no tiene, una restricción `unique` de una
 * columna), y la API la genera para las claves foráneas. Para pedir la fila
 * hay que saber qué columna es, y se deduce del metadato de la tabla con el
 * mismo criterio que usa `buildResourceUrl`, para que ida y vuelta coincidan.
 */

/** Claves primarias y únicas de una tabla (`cms.table_metadata.ui_config`). */
export type TableKeysConfig = {
  primary_keys: Array<{ column_name: string }>;
  unique_constraints: Array<{ constraint_name: string; columns?: string[] }>;
};

/**
 * Normaliza el `ui_config` de una tabla (que llega como `unknown` desde la
 * API) a las listas de claves que necesitan los enlaces a las fichas.
 */
export function toTableKeysConfig(uiConfig: unknown): TableKeysConfig {
  const config = (uiConfig ?? {}) as Partial<TableKeysConfig>;

  return {
    primary_keys: Array.isArray(config.primary_keys) ? config.primary_keys : [],
    unique_constraints: Array.isArray(config.unique_constraints)
      ? config.unique_constraints.map((constraint) => ({
          constraint_name: constraint.constraint_name ?? '',
          columns: constraint.columns ?? [],
        }))
      : [],
  };
}

/**
 * Devuelve la columna a la que corresponde el valor de `.../record/$id`: la
 * clave primaria si es de una columna; si la tabla no tiene clave primaria,
 * la primera restricción `unique` de una columna; en otro caso, `id`.
 */
export function resolveSingleKeyColumn(uiConfig: unknown) {
  const config = toTableKeysConfig(uiConfig);

  const primaryKeys = Array.from(
    new Set(config.primary_keys.map((pk) => pk.column_name).filter(Boolean)),
  );

  if (primaryKeys.length === 1) {
    return primaryKeys[0]!;
  }

  if (primaryKeys.length === 0) {
    const unique = config.unique_constraints.find(
      (constraint) => (constraint.columns ?? []).filter(Boolean).length === 1,
    );

    if (unique?.columns?.[0]) {
      return unique.columns[0];
    }
  }

  return 'id';
}
