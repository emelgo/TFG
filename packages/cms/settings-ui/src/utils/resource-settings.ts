/**
 * Utilidades puras de Ajustes > Recursos (F2.7c): agrupar por área y
 * reordenar las tablas gestionadas, leer la configuración de columnas guardada y calcular
 * qué ha cambiado para enviar a la API solo eso.
 *
 * Son funciones sin React ni red para probarlas con Vitest
 * (`__tests__/resource-settings.test.ts`). Los límites y los tipos de
 * interfaz válidos vienen de `@pymekit/cms-shared/resource-config`, los
 * mismos que aplica el esquema Zod de la API.
 *
 * [TFG] RF-09 · ADR-013.
 */
import * as z from 'zod';

import { RESOURCE_CONFIG_LIMITS as LIMITS } from '@pymekit/cms-shared/resource-config';
import {
  groupByArea,
  normalizeNavigationGroup,
} from '@pymekit/cms-ui-core/resources';

/** Fila del listado de tablas gestionadas. */
export type ManagedTable = {
  schemaName: string;
  tableName: string;
  displayName: string | null;
  isVisible: boolean | null;
  ordering: number | null;
  /** Área de negocio (`ui_config.navigation_group`), si tiene. */
  navigationGroup?: string | null;
};

/**
 * Agrupa las tablas por área de negocio (`ui_config.navigation_group`), con
 * el mismo criterio que la barra lateral (`groupByArea`): áreas por su menor
 * `ordering` y por nombre, tablas por `ordering` y nombre visible, y las que
 * no tienen área al final (`name: null`, «Otros datos»). Aquí se listan
 * también las tablas ocultas, para poder volver a mostrarlas.
 */
export function groupTablesByArea<T extends ManagedTable>(tables: T[]) {
  return groupByArea(tables, {
    area: (table) => normalizeNavigationGroup(table.navigationGroup),
    ordering: (table) => table.ordering,
    label: (table) => table.displayName || table.tableName,
  });
}

/**
 * Mueve una tabla una posición arriba (`-1`) o abajo (`1`) dentro de su área
 * y devuelve el nuevo orden de toda el área, listo para `PUT /v1/tables`.
 * Devuelve `null` si el movimiento no es posible.
 *
 * La numeración parte del menor `ordering` que ya tenía el área (o de 0 si
 * ninguna tabla lo tenía): así reordenar dentro de un área no cambia su
 * posición respecto a las demás, que se ordenan por ese mínimo.
 */
export function moveTable<T extends ManagedTable>(
  ordered: T[],
  index: number,
  direction: -1 | 1,
) {
  const target = index + direction;

  if (index < 0 || index >= ordered.length) return null;
  if (target < 0 || target >= ordered.length) return null;

  const next = [...ordered];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);

  const known = ordered
    .map((table) => table.ordering)
    .filter((value): value is number => value !== null);
  const base = known.length > 0 ? Math.min(...known) : 0;

  return next.map((table, position) => ({
    schema: table.schemaName,
    table: table.tableName,
    ordering: Math.min(base + position, LIMITS.ordering),
  }));
}

/** Configuración de presentación de una columna, tal como la edita la UI. */
export type ColumnSettings = {
  name: string;
  dataType: string;
  isPrimaryKey: boolean;
  displayName: string;
  description: string;
  isVisibleInTable: boolean;
  isVisibleInDetail: boolean;
  isSearchable: boolean;
  isSortable: boolean;
  isFilterable: boolean;
  isEditable: boolean;
  ordering: number | null;
  uiDataType: string;
  /** Tipo enumerado de PostgreSQL y sus valores (vacío si no es enumerado). */
  enumType: string;
  enumValues: string[];
  /** Etiquetas visibles configuradas por valor (`ui_config.value_labels`). */
  valueLabels: Record<string, string>;
};

/** Lee `ui_config.value_labels` descartando lo que no sea texto. */
function readValueLabels(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(asRecord(value)).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function asRecord(value: unknown) {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Lee `columns_config` (JSON guardado por la sincronización y los ajustes)
 * y devuelve las columnas ordenadas por `ordering` y después por nombre.
 */
export function readColumnsSettings(columnsConfig: unknown): ColumnSettings[] {
  return Object.entries(asRecord(columnsConfig))
    .map(([name, raw]) => {
      const column = asRecord(raw);
      const ui = asRecord(column['ui_config']);

      return {
        name,
        dataType: String(ui['data_type'] ?? ''),
        isPrimaryKey: column['is_primary_key'] === true,
        displayName: String(column['display_name'] ?? ''),
        description: String(column['description'] ?? ''),
        isVisibleInTable: column['is_visible_in_table'] !== false,
        isVisibleInDetail: column['is_visible_in_detail'] !== false,
        isSearchable: column['is_searchable'] === true,
        isSortable: column['is_sortable'] === true,
        isFilterable: column['is_filterable'] === true,
        isEditable: column['is_editable'] === true,
        ordering:
          typeof column['ordering'] === 'number' ? column['ordering'] : null,
        uiDataType: String(ui['ui_data_type'] ?? ''),
        enumType: typeof ui['enum_type'] === 'string' ? ui['enum_type'] : '',
        enumValues: Array.isArray(ui['enum_values'])
          ? ui['enum_values'].map(String)
          : [],
        valueLabels: readValueLabels(ui['value_labels']),
      };
    })
    .sort(
      (a, b) =>
        (a.ordering ?? Number.MAX_SAFE_INTEGER) -
          (b.ordering ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name),
    );
}

/** Formulario de una columna (diálogo de edición). */
export const ColumnSettingsFormSchema = z.object({
  displayName: z.string().trim().max(LIMITS.displayName),
  description: z.string().trim().max(LIMITS.description),
  isVisibleInTable: z.boolean(),
  isVisibleInDetail: z.boolean(),
  isSearchable: z.boolean(),
  isSortable: z.boolean(),
  isFilterable: z.boolean(),
  isEditable: z.boolean(),
  uiDataType: z.string(),
  // Texto visible por valor del enumerado; vacío = etiqueta por defecto.
  valueLabels: z.record(z.string(), z.string().trim().max(LIMITS.valueLabel)),
});

export type ColumnSettingsFormValues = z.infer<typeof ColumnSettingsFormSchema>;

/**
 * Cuerpo de `PUT /v1/tables/:schema/:table/columns` para una columna con
 * solo los campos que han cambiado (`null` si no cambia nada).
 */
export function buildColumnUpdate(
  original: ColumnSettings,
  values: ColumnSettingsFormValues,
) {
  const update: Record<string, unknown> = {};

  const text = (value: string) => value.trim();

  if (text(values.displayName) !== original.displayName) {
    update['display_name'] = text(values.displayName);
  }

  if (text(values.description) !== original.description) {
    update['description'] = text(values.description);
  }

  const flags = [
    ['isVisibleInTable', 'is_visible_in_table'],
    ['isVisibleInDetail', 'is_visible_in_detail'],
    ['isSearchable', 'is_searchable'],
    ['isSortable', 'is_sortable'],
    ['isFilterable', 'is_filterable'],
    ['isEditable', 'is_editable'],
  ] as const;

  for (const [key, apiKey] of flags) {
    if (values[key] !== original[key]) {
      update[apiKey] = values[key];
    }
  }

  const ui: Record<string, unknown> = {};

  if (values.uiDataType !== original.uiDataType) {
    ui['ui_data_type'] = values.uiDataType || null;
  }

  // Solo se guardan las etiquetas no vacías de valores que existen en el
  // enumerado; si no queda ninguna se envía `null` para borrarlas.
  const labels = Object.fromEntries(
    original.enumValues
      .map((value) => [value, values.valueLabels[value]?.trim() ?? ''])
      .filter(([, label]) => label !== ''),
  );

  if (!sameLabels(labels, original.valueLabels)) {
    ui['value_labels'] = Object.keys(labels).length > 0 ? labels : null;
  }

  if (Object.keys(ui).length > 0) {
    update['ui_config'] = ui;
  }

  return Object.keys(update).length > 0 ? { [original.name]: update } : null;
}

function sameLabels(a: Record<string, string>, b: Record<string, string>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

  return [...keys].every((key) => a[key] === b[key]);
}

/**
 * Nuevo orden de las columnas tras mover una arriba o abajo: devuelve el
 * cuerpo para la API con `ordering` de todas las columnas (0, 1, 2…), o
 * `null` si el movimiento no es posible.
 */
export function moveColumn(
  ordered: ColumnSettings[],
  index: number,
  direction: -1 | 1,
) {
  const target = index + direction;

  if (index < 0 || index >= ordered.length) return null;
  if (target < 0 || target >= ordered.length) return null;

  const next = [...ordered];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);

  return Object.fromEntries(
    next.map((column, position) => [column.name, { ordering: position }]),
  );
}

/** Formulario del metadato propio de una tabla. */
export const TableSettingsFormSchema = z.object({
  displayName: z.string().trim().max(LIMITS.displayName),
  navigationGroup: z.string().trim().max(LIMITS.navigationGroup),
  description: z.string().trim().max(LIMITS.description),
  displayFormat: z.string().trim().max(LIMITS.displayFormat),
  isVisible: z.boolean(),
  isSearchable: z.boolean(),
});

export type TableSettingsFormValues = z.infer<typeof TableSettingsFormSchema>;

/** Formulario de sincronización (esquema y, opcionalmente, una tabla). */
export const SyncTablesFormSchema = z.object({
  schema: z
    .string()
    .trim()
    .regex(/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/),
  table: z
    .string()
    .trim()
    .regex(/^([A-Za-z_][A-Za-z0-9_$]{0,62})?$/),
});

export type SyncTablesFormValues = z.infer<typeof SyncTablesFormSchema>;

/** Relación con sección configurable en la ficha (uno a muchos). */
export type InlineRelation = {
  source_column: string;
  target_schema: string;
  target_table: string;
  target_column: string;
  type: string;
  enabled: boolean;
  sectionLabel: string;
};

/** Lee las relaciones de `relations_config` para su configuración. */
export function readRelationsSettings(relationsConfig: unknown) {
  if (!Array.isArray(relationsConfig)) {
    return [] as InlineRelation[];
  }

  return relationsConfig.map((raw) => {
    const relation = asRecord(raw);
    const inline = asRecord(relation['inline_config']);

    return {
      source_column: String(relation['source_column'] ?? ''),
      target_schema: String(relation['target_schema'] ?? ''),
      target_table: String(relation['target_table'] ?? ''),
      target_column: String(relation['target_column'] ?? ''),
      type: String(relation['type'] ?? ''),
      enabled: inline['enabled'] !== false,
      sectionLabel: String(inline['section_label'] ?? ''),
    };
  });
}
