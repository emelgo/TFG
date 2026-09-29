/**
 * Selección de filas del listado para el borrado múltiple.
 *
 * Para borrar un registro hay que poder identificarlo sin ambigüedad: por su
 * clave primaria (de una o varias columnas) o, si la tabla no tiene, por una
 * restricción `unique` con valor en todas sus columnas. Es el mismo criterio
 * que decide si una fila enlaza con su ficha (`buildResourceUrl`): una fila
 * que no se puede identificar tampoco se puede seleccionar, porque borrar
 * «la primera que coincida» podría borrar otra.
 *
 * La selección se guarda como un `Map` inmutable (identificador → condiciones
 * y fila) que sobrevive al cambio de página: se puede seleccionar en varias
 * páginas y borrarlo todo de una vez. Las funciones devuelven siempre un
 * `Map` nuevo, para usarlas directamente con `useState`.
 */
import type { TableKeysConfig } from './record-keys';

type RecordData = Record<string, unknown>;

/** Condiciones que identifican un registro: `{ columna: valor }`. */
export type RecordKeyConditions = Record<string, unknown>;

/** Fila seleccionada: sus condiciones (para la API) y la fila (para mostrarla). */
export type SelectedRecord = {
  conditions: RecordKeyConditions;
  record: RecordData;
};

export type RecordSelection = ReadonlyMap<string, SelectedRecord>;

/** Estado de la casilla de la cabecera para la página visible. */
export type PageSelectionState = 'none' | 'some' | 'all';

/**
 * Devuelve las condiciones que identifican la fila, o `null` si no se puede
 * identificar de forma única.
 */
export function getRecordKeyConditions(
  record: RecordData,
  config: TableKeysConfig,
): RecordKeyConditions | null {
  const primaryKeys = Array.from(
    new Set(config.primary_keys.map((pk) => pk.column_name).filter(Boolean)),
  );

  const hasValue = (column: string) =>
    record[column] !== null && record[column] !== undefined;

  if (primaryKeys.length > 0) {
    return primaryKeys.every(hasValue) ? pick(record, primaryKeys) : null;
  }

  for (const constraint of config.unique_constraints) {
    const columns = (constraint.columns ?? []).filter(Boolean);

    if (columns.length > 0 && columns.every(hasValue)) {
      return pick(record, columns);
    }
  }

  return null;
}

/**
 * Identificador estable de un registro a partir de sus condiciones (las
 * columnas se ordenan para que el orden no cree dos entradas).
 */
export function getSelectionId(conditions: RecordKeyConditions) {
  return JSON.stringify(
    Object.entries(conditions)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([column, value]) => [column, String(value)]),
  );
}

/**
 * Convierte las condiciones en las claves de la ficha (`{ columna: texto }`),
 * que es como las espera la API de la ficha y de la edición.
 */
export function toRecordKeys(conditions: RecordKeyConditions) {
  return Object.fromEntries(
    Object.entries(conditions).map(([column, value]) => [
      column,
      String(value),
    ]),
  );
}

/** Añade la fila a la selección, o la quita si ya estaba. */
export function toggleRecordSelection(
  selection: RecordSelection,
  record: RecordData,
  config: TableKeysConfig,
): RecordSelection {
  const conditions = getRecordKeyConditions(record, config);

  if (!conditions) {
    return selection;
  }

  const id = getSelectionId(conditions);
  const next = new Map(selection);

  if (next.has(id)) {
    next.delete(id);
  } else {
    next.set(id, { conditions, record });
  }

  return next;
}

/**
 * Selecciona (o deselecciona) todas las filas identificables de la página
 * visible, sin tocar las seleccionadas en otras páginas.
 */
export function setPageSelection(
  selection: RecordSelection,
  records: RecordData[],
  config: TableKeysConfig,
  selected: boolean,
): RecordSelection {
  const next = new Map(selection);

  for (const record of records) {
    const conditions = getRecordKeyConditions(record, config);

    if (!conditions) {
      continue;
    }

    const id = getSelectionId(conditions);

    if (selected) {
      next.set(id, { conditions, record });
    } else {
      next.delete(id);
    }
  }

  return next;
}

/** `true` si la fila está seleccionada. */
export function isRecordSelected(
  selection: RecordSelection,
  record: RecordData,
  config: TableKeysConfig,
) {
  const conditions = getRecordKeyConditions(record, config);

  return conditions ? selection.has(getSelectionId(conditions)) : false;
}

/** Estado de la selección de la página visible (casilla de la cabecera). */
export function getPageSelectionState(
  selection: RecordSelection,
  records: RecordData[],
  config: TableKeysConfig,
): PageSelectionState {
  const selectable = records.filter(
    (record) => getRecordKeyConditions(record, config) !== null,
  );

  const selectedCount = selectable.filter((record) =>
    isRecordSelected(selection, record, config),
  ).length;

  if (selectedCount === 0) {
    return 'none';
  }

  return selectedCount === selectable.length ? 'all' : 'some';
}

function pick(record: RecordData, columns: string[]) {
  return Object.fromEntries(columns.map((column) => [column, record[column]]));
}
