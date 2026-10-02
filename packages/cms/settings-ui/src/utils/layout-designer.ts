/**
 * Lógica pura del diseñador de la ficha de un registro (F2.7c).
 *
 * Una distribución (`ui_config.recordLayout`) tiene dos modos —`display`
 * (ficha) y `edit` (formulario)— y cada uno es una lista de **grupos** con
 * título, formados por **filas** de hasta cuatro **campos**; cada campo
 * ocupa de 1 a 4 cuartos de la fila (`size`). La ficha de F2.4b
 * (`RecordView`, `getCustomRecordLayout`) y el formulario de F2.4c la usan
 * si tiene algún campo que se pueda mostrar.
 *
 * Todas las operaciones son inmutables y devuelven `null` cuando no se
 * pueden aplicar (por ejemplo, un campo no cabe en la fila), para que el
 * componente simplemente ignore el gesto. Los identificadores nuevos los
 * pasa quien llama, así los tests son deterministas
 * (`__tests__/layout-designer.test.ts`).
 *
 * [TFG] RF-09 · ADR-013.
 */
import type { LayoutGroup, RecordLayoutConfig } from '@pymekit/cms-types';

export type LayoutMode = 'display' | 'edit';
export type FieldSize = 1 | 2 | 3 | 4;

/** Ancho total de una fila, en cuartos. */
export const ROW_CAPACITY = 4;

/** Columna disponible para el diseñador. */
export type DesignerColumn = {
  name: string;
  isVisibleInDetail: boolean;
  isEditable: boolean;
};

/** Destino de un campo: una fila de un grupo y, opcionalmente, su posición. */
export type FieldTarget = { groupId: string; rowId: string; index?: number };

/** Indica si una columna se puede colocar en el modo indicado. */
export function isFieldAllowed(column: DesignerColumn, mode: LayoutMode) {
  return mode === 'display' ? column.isVisibleInDetail : column.isEditable;
}

/**
 * Distribución inicial: un solo grupo con los campos permitidos de cada
 * modo, dos por fila (mitad de ancho cada uno).
 */
export function createDefaultRecordLayout(
  columns: DesignerColumn[],
  labels: { layout: string; group: string },
): RecordLayoutConfig {
  const build = (mode: LayoutMode): LayoutGroup[] => {
    const fields = columns.filter((column) => isFieldAllowed(column, mode));
    const rows = [];

    for (let index = 0; index < fields.length; index += 2) {
      rows.push({
        id: `row-${mode}-${index / 2}`,
        columns: fields.slice(index, index + 2).map((column) => ({
          id: `field-${mode}-${column.name}`,
          fieldName: column.name,
          size: 2 as FieldSize,
        })),
      });
    }

    return [{ id: `group-${mode}-0`, label: labels.group, rows }];
  };

  return {
    id: 'record-layout',
    name: labels.layout,
    display: build('display'),
    edit: build('edit'),
  };
}

/**
 * Devuelve la distribución guardada sin los campos que ya no existen o que
 * no se pueden mostrar en su modo (columnas borradas u ocultadas después),
 * o `null` si la tabla no tiene ninguna guardada.
 */
export function readRecordLayout(
  uiConfig: unknown,
  columns: DesignerColumn[],
): RecordLayoutConfig | null {
  const layout = (uiConfig as { recordLayout?: RecordLayoutConfig | null })
    ?.recordLayout;

  if (!layout || typeof layout !== 'object') {
    return null;
  }

  const byName = new Map(columns.map((column) => [column.name, column]));

  const clean = (groups: unknown, mode: LayoutMode): LayoutGroup[] =>
    (Array.isArray(groups) ? (groups as LayoutGroup[]) : []).map((group) => ({
      id: String(group.id),
      label: String(group.label ?? ''),
      rows: (group.rows ?? []).map((row) => ({
        id: String(row.id),
        columns: (row.columns ?? [])
          .filter((field) => {
            const column = byName.get(field.fieldName);

            return column ? isFieldAllowed(column, mode) : false;
          })
          .map((field) => ({
            id: String(field.id),
            fieldName: field.fieldName,
            size: clampSize(field.size),
          })),
      })),
    }));

  return {
    id: String(layout.id ?? 'record-layout'),
    name: String(layout.name ?? ''),
    display: clean(layout.display, 'display'),
    edit: clean(layout.edit, 'edit'),
  };
}

function clampSize(size: unknown): FieldSize {
  const value = Math.round(Number(size) || 1);

  return Math.min(Math.max(value, 1), ROW_CAPACITY) as FieldSize;
}

/** Cuartos ocupados en una fila. */
export function rowUsedSize(row: LayoutGroup['rows'][number]) {
  return row.columns.reduce((total, column) => total + column.size, 0);
}

/** Columnas permitidas en el modo que aún no están en la distribución. */
export function getUnplacedFields(
  groups: LayoutGroup[],
  columns: DesignerColumn[],
  mode: LayoutMode,
) {
  const placed = new Set(
    groups.flatMap((group) =>
      group.rows.flatMap((row) => row.columns.map((field) => field.fieldName)),
    ),
  );

  return columns.filter(
    (column) => isFieldAllowed(column, mode) && !placed.has(column.name),
  );
}

/** Añade un grupo vacío con una fila al final. */
export function addGroup(
  groups: LayoutGroup[],
  ids: { groupId: string; rowId: string },
  label: string,
) {
  return [
    ...groups,
    { id: ids.groupId, label, rows: [{ id: ids.rowId, columns: [] }] },
  ];
}

/** Quita un grupo (sus campos vuelven a la lista de disponibles). */
export function removeGroup(groups: LayoutGroup[], groupId: string) {
  return groups.filter((group) => group.id !== groupId);
}

/** Cambia el título de un grupo. */
export function renameGroup(
  groups: LayoutGroup[],
  groupId: string,
  label: string,
) {
  return groups.map((group) =>
    group.id === groupId ? { ...group, label } : group,
  );
}

/** Mueve un grupo una posición arriba (`-1`) o abajo (`1`). */
export function moveGroup(
  groups: LayoutGroup[],
  groupId: string,
  direction: -1 | 1,
) {
  const index = groups.findIndex((group) => group.id === groupId);
  const target = index + direction;

  if (index < 0 || target < 0 || target >= groups.length) {
    return null;
  }

  const next = [...groups];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);

  return next;
}

/** Añade una fila vacía al final de un grupo. */
export function addRow(groups: LayoutGroup[], groupId: string, rowId: string) {
  return groups.map((group) =>
    group.id === groupId
      ? { ...group, rows: [...group.rows, { id: rowId, columns: [] }] }
      : group,
  );
}

/** Quita una fila (sus campos vuelven a la lista de disponibles). */
export function removeRow(
  groups: LayoutGroup[],
  groupId: string,
  rowId: string,
) {
  return groups.map((group) =>
    group.id === groupId
      ? { ...group, rows: group.rows.filter((row) => row.id !== rowId) }
      : group,
  );
}

/** Busca un campo por su id. */
export function findField(groups: LayoutGroup[], fieldId: string) {
  for (const group of groups) {
    for (const row of group.rows) {
      const field = row.columns.find((column) => column.id === fieldId);

      if (field) {
        return { groupId: group.id, rowId: row.id, field };
      }
    }
  }

  return null;
}

/** Quita un campo de la distribución. */
export function removeField(groups: LayoutGroup[], fieldId: string) {
  return groups.map((group) => ({
    ...group,
    rows: group.rows.map((row) => ({
      ...row,
      columns: row.columns.filter((column) => column.id !== fieldId),
    })),
  }));
}

function insertIntoRow(
  groups: LayoutGroup[],
  target: FieldTarget,
  field: LayoutGroup['rows'][number]['columns'][number],
) {
  let inserted = false;

  const next = groups.map((group) => {
    if (group.id !== target.groupId) return group;

    return {
      ...group,
      rows: group.rows.map((row) => {
        if (row.id !== target.rowId) return row;

        if (
          row.columns.length >= ROW_CAPACITY ||
          rowUsedSize(row) + field.size > ROW_CAPACITY
        ) {
          return row;
        }

        const columns = [...row.columns];
        const index = Math.min(
          Math.max(target.index ?? columns.length, 0),
          columns.length,
        );

        columns.splice(index, 0, field);
        inserted = true;

        return { ...row, columns };
      }),
    };
  });

  return inserted ? next : null;
}

/**
 * Coloca una columna disponible en una fila. Si no cabe entera, se intenta
 * con el ancho que quede libre; si la fila está llena, `null`.
 */
export function placeField(
  groups: LayoutGroup[],
  fieldName: string,
  target: FieldTarget,
  fieldId: string,
  size: FieldSize = 2,
) {
  const row = groups
    .find((group) => group.id === target.groupId)
    ?.rows.find((candidate) => candidate.id === target.rowId);

  if (!row) return null;

  const free = ROW_CAPACITY - rowUsedSize(row);
  const fitted = Math.min(size, free);

  if (fitted < 1) return null;

  return insertIntoRow(groups, target, {
    id: fieldId,
    fieldName,
    size: fitted as FieldSize,
  });
}

/**
 * Mueve un campo a otra fila (o a otra posición de la misma). Si no cabe en
 * el destino, la distribución no cambia (`null`).
 */
export function moveField(
  groups: LayoutGroup[],
  fieldId: string,
  target: FieldTarget,
) {
  const found = findField(groups, fieldId);

  if (!found) return null;

  return insertIntoRow(removeField(groups, fieldId), target, found.field);
}

/** Cambia el ancho de un campo si cabe en su fila. */
export function setFieldSize(
  groups: LayoutGroup[],
  fieldId: string,
  size: FieldSize,
) {
  const found = findField(groups, fieldId);

  if (!found) return null;

  const row = groups
    .find((group) => group.id === found.groupId)!
    .rows.find((candidate) => candidate.id === found.rowId)!;

  if (rowUsedSize(row) - found.field.size + size > ROW_CAPACITY) {
    return null;
  }

  return groups.map((group) => ({
    ...group,
    rows: group.rows.map((candidate) => ({
      ...candidate,
      columns: candidate.columns.map((column) =>
        column.id === fieldId ? { ...column, size } : column,
      ),
    })),
  }));
}

/**
 * Prepara la distribución para guardarla: quita las filas vacías y los
 * grupos que se quedan sin filas, que no aportan nada a la ficha.
 */
export function prepareLayoutForSave(
  layout: RecordLayoutConfig,
): RecordLayoutConfig {
  const clean = (groups: LayoutGroup[]) =>
    groups
      .map((group) => ({
        id: group.id,
        label: group.label.trim(),
        rows: group.rows
          .filter((row) => row.columns.length > 0)
          .map((row) => ({
            id: row.id,
            columns: row.columns.map((column) => ({
              id: column.id,
              fieldName: column.fieldName,
              size: column.size,
            })),
          })),
      }))
      .filter((group) => group.rows.length > 0);

  return {
    id: layout.id,
    name: layout.name.trim(),
    display: clean(layout.display),
    edit: clean(layout.edit),
  };
}
