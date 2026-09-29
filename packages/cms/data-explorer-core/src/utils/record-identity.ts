/**
 * ¿Identifican unas condiciones un único registro?
 *
 * Las escrituras de un registro concreto (editarlo, borrarlo) lo localizan
 * con condiciones `{ columna: valor }`. Las funciones SQL aceptan cualquier
 * columna y solo limitan el daño a 25 filas; si las condiciones no incluyen
 * una clave (por ejemplo, `?type=info` escrito a mano en la URL de edición),
 * una sola petición «de un registro» cambiaría o borraría varios.
 *
 * Por eso tanto la API como la interfaz exigen que las columnas de las
 * condiciones contengan todas las de la clave primaria o todas las de alguna
 * restricción `unique` (según `cms.table_metadata.ui_config`). Es una función
 * pura y sin dependencias para poder usarla en el servidor y en el navegador.
 *
 * [TFG] RNF-02: una edición o un borrado nunca afecta a más de un registro.
 */

/** Claves de una tabla tal como las guarda `ui_config`. */
export type RecordIdentityConfig = {
  primary_keys?: Array<{ column_name?: string | null }> | null;
  unique_constraints?: Array<{ columns?: string[] | null }> | null;
};

/**
 * Devuelve `true` si las columnas `conditionColumns` contienen la clave
 * primaria completa o todas las columnas de una restricción `unique`.
 */
export function conditionsIdentifyOneRecord(
  conditionColumns: string[],
  uiConfig: unknown,
) {
  const config = (uiConfig ?? {}) as RecordIdentityConfig;
  const columns = new Set(conditionColumns);

  const primaryKey = (config.primary_keys ?? [])
    .map((pk) => pk?.column_name)
    .filter((name): name is string => Boolean(name));

  if (primaryKey.length > 0 && primaryKey.every((col) => columns.has(col))) {
    return true;
  }

  return (config.unique_constraints ?? []).some((constraint) => {
    const unique = (constraint?.columns ?? []).filter(Boolean);

    return unique.length > 0 && unique.every((col) => columns.has(col));
  });
}
