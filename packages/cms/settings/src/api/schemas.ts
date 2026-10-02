/**
 * Esquemas Zod de Ajustes > Recursos del CMS (F2.7c).
 *
 * Los esquemas heredados aceptaban casi cualquier JSON: `ui_data_type_config`
 * era un `record(any)`, cada campo de la distribución admitía `metadata: any`
 * y una columna se podía reescribir entera (incluidos `is_primary_key` o
 * `data_type`, que el explorador usa para decidir qué condiciones
 * identifican un registro). Ahora todos son estrictos (`.strict()` rechaza
 * claves desconocidas), tienen límites de tamaño
 * (`RESOURCE_CONFIG_LIMITS`) y solo dejan cambiar lo que es presentación:
 * etiquetas, visibilidad, orden, editable y formateador. Lo estructural
 * (tipo, clave primaria, enumerados…) solo lo escribe
 * `cms.sync_managed_tables` a partir del catálogo de PostgreSQL.
 *
 * [TFG] RF-09 · RNF-02 (bitácora: endurecimiento de F2.7c).
 */
import * as z from 'zod';

import {
  PG_IDENTIFIER_PATTERN,
  RESOURCE_CONFIG_LIMITS as LIMITS,
  UI_DATA_TYPES,
} from '@pymekit/cms-shared/resource-config';

/** Esquema, tabla o columna de PostgreSQL. */
export const PgIdentifierSchema = z.string().regex(PG_IDENTIFIER_PATTERN);

/** Parámetros `:schema/:table` de las rutas de un recurso. */
export const ResourceParamsSchema = z
  .object({ schema: PgIdentifierSchema, table: PgIdentifierSchema })
  .strict();

/** Texto opcional que se puede vaciar: `''` se guarda como `null`. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === '' ? null : value))
    .optional();
}

const Ordering = z.number().int().min(0).max(LIMITS.ordering);

/** Metadato propio de una tabla (nombre visible, descripción, formato…). */
export const TableMetadataSchema = z
  .object({
    display_name: optionalText(LIMITS.displayName),
    description: optionalText(LIMITS.description),
    display_format: optionalText(LIMITS.displayFormat),
    is_visible: z.boolean().optional(),
    is_searchable: z.boolean().optional(),
    ordering: Ordering.nullable().optional(),
  })
  .strict();

export type TableMetadataSchemaType = z.infer<typeof TableMetadataSchema>;

/** Visibilidad y orden de varias tablas a la vez (listado de recursos). */
export const UpdateTablesMetadataSchema = z
  .array(
    z
      .object({
        schema: PgIdentifierSchema,
        table: PgIdentifierSchema,
        ordering: Ordering.nullable().optional(),
        isVisible: z.boolean().optional(),
      })
      .strict(),
  )
  .min(1)
  .max(LIMITS.tablesPerUpdate);

export type UpdateTablesMetadataSchemaType = z.infer<
  typeof UpdateTablesMetadataSchema
>;

/** Sincronizar las tablas de un esquema (o solo una) con el catálogo. */
export const SyncTablesSchema = z
  .object({
    schema: PgIdentifierSchema,
    table: PgIdentifierSchema.optional(),
  })
  .strict();

export type SyncTablesSchemaType = z.infer<typeof SyncTablesSchema>;

const UiConfigValue = z.union([
  z.string().max(LIMITS.uiConfigValue),
  z.number(),
  z.boolean(),
  z.null(),
]);

/** Parte editable de `ui_config` de una columna (formateador y etiquetas). */
const ColumnUiConfigUpdateSchema = z
  .object({
    ui_data_type: z.enum(UI_DATA_TYPES).nullable().optional(),
    ui_data_type_config: z
      .record(z.string().max(64), UiConfigValue)
      .refine((value) => Object.keys(value).length <= LIMITS.uiConfigEntries)
      .nullable()
      .optional(),
    boolean_labels: z
      .object({
        true_label: z.string().trim().max(LIMITS.booleanLabel).optional(),
        false_label: z.string().trim().max(LIMITS.booleanLabel).optional(),
      })
      .strict()
      .optional(),
    enum_badges: z
      .record(
        z.string().max(LIMITS.displayName),
        z
          .object({
            variant: z
              .enum([
                'default',
                'secondary',
                'destructive',
                'outline',
                'success',
                'warning',
                'info',
              ])
              .nullish(),
          })
          .strict(),
      )
      .refine((value) => Object.keys(value).length <= LIMITS.enumBadges)
      .nullable()
      .optional(),
    // Etiqueta visible por valor de un enumerado (F3b). Clave = valor real
    // del enumerado, valor = texto que se muestra; tamaño acotado igual que
    // `enum_badges` para no admitir JSON arbitrario.
    value_labels: z
      .record(
        z.string().min(1).max(LIMITS.displayName),
        z.string().trim().min(1).max(LIMITS.valueLabel),
      )
      .refine((value) => Object.keys(value).length <= LIMITS.enumBadges)
      .nullable()
      .optional(),
  })
  .strict();

/** Cambios de presentación de una columna. */
export const ColumnConfigUpdateSchema = z
  .object({
    display_name: optionalText(LIMITS.displayName),
    description: optionalText(LIMITS.description),
    display_format: optionalText(LIMITS.displayFormat),
    is_visible_in_table: z.boolean().optional(),
    is_visible_in_detail: z.boolean().optional(),
    is_searchable: z.boolean().optional(),
    is_sortable: z.boolean().optional(),
    is_filterable: z.boolean().optional(),
    is_editable: z.boolean().optional(),
    ordering: Ordering.nullable().optional(),
    ui_config: ColumnUiConfigUpdateSchema.optional(),
  })
  .strict();

export type ColumnConfigUpdate = z.infer<typeof ColumnConfigUpdateSchema>;

/** Cambios de varias columnas, indexados por el nombre de la columna. */
export const UpdateTableColumnsConfigSchema = z
  .record(PgIdentifierSchema, ColumnConfigUpdateSchema)
  .refine((value) => {
    const count = Object.keys(value).length;

    return count > 0 && count <= LIMITS.columnsPerUpdate;
  });

export type UpdateTableColumnsConfigSchemaType = z.infer<
  typeof UpdateTableColumnsConfigSchema
>;

/** Sección de registros relacionados en la ficha (uno a muchos). */
export const InlineRelationConfigSchema = z
  .object({
    enabled: z.boolean(),
    section_label: z.string().trim().max(LIMITS.sectionLabel).optional(),
  })
  .strict();

export type InlineRelationConfigSchemaType = z.infer<
  typeof InlineRelationConfigSchema
>;

/** Activar o etiquetar secciones de relaciones existentes. */
export const UpdateRelationsConfigSchema = z
  .object({
    updates: z
      .array(
        z
          .object({
            source_column: PgIdentifierSchema,
            target_schema: PgIdentifierSchema,
            target_table: PgIdentifierSchema,
            target_column: PgIdentifierSchema,
            inline_config: InlineRelationConfigSchema,
          })
          .strict(),
      )
      .min(1)
      .max(LIMITS.relationsPerUpdate),
  })
  .strict();

export type UpdateRelationsConfigSchemaType = z.infer<
  typeof UpdateRelationsConfigSchema
>;

const LayoutId = z.string().min(1).max(LIMITS.layoutId);

const LayoutGroupSchema = z
  .object({
    id: LayoutId,
    label: z.string().trim().max(LIMITS.layoutLabel),
    rows: z
      .array(
        z
          .object({
            id: LayoutId,
            columns: z
              .array(
                z
                  .object({
                    id: LayoutId,
                    fieldName: PgIdentifierSchema,
                    size: z.union([
                      z.literal(1),
                      z.literal(2),
                      z.literal(3),
                      z.literal(4),
                    ]),
                  })
                  .strict(),
              )
              .max(LIMITS.layoutColumnsPerRow),
          })
          .strict(),
      )
      .max(LIMITS.layoutRowsPerGroup),
    isCollapsed: z.boolean().optional(),
  })
  .strict();

/**
 * Distribución de la ficha de un registro (`ui_config.recordLayout`); `null`
 * vuelve a la distribución por defecto.
 */
export const SaveLayoutSchema = z
  .object({
    layout: z
      .object({
        id: LayoutId,
        name: z.string().trim().max(LIMITS.layoutLabel),
        display: z.array(LayoutGroupSchema).max(LIMITS.layoutGroups),
        edit: z.array(LayoutGroupSchema).max(LIMITS.layoutGroups),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type SaveLayoutSchemaType = z.infer<typeof SaveLayoutSchema>;

/** Nombres de columna que usa una distribución (modo ficha y edición). */
export function getLayoutFieldNames(layout: SaveLayoutSchemaType['layout']) {
  const names = new Set<string>();

  for (const group of [...(layout?.display ?? []), ...(layout?.edit ?? [])]) {
    for (const row of group.rows) {
      for (const column of row.columns) {
        names.add(column.fieldName);
      }
    }
  }

  return names;
}

/**
 * Aplica los cambios de presentación a la configuración guardada de las
 * columnas. Solo toca las columnas que ya existen (las crea
 * `sync_managed_tables`) y, dentro de cada una, los campos enviados: el
 * resto (tipo, clave primaria, enumerados…) se conserva tal cual.
 *
 * @returns La configuración resultante, o `null` si alguna columna no existe.
 */
export function mergeColumnsConfig(
  current: Record<string, Record<string, unknown>>,
  updates: UpdateTableColumnsConfigSchemaType,
) {
  const next: Record<string, Record<string, unknown>> = { ...current };

  for (const [name, update] of Object.entries(updates)) {
    const existing = current[name];

    if (!existing || typeof existing !== 'object') {
      return null;
    }

    const { ui_config: uiUpdate, ...fields } = update;

    const definedFields = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    );

    const merged: Record<string, unknown> = { ...existing, ...definedFields };

    if (uiUpdate) {
      const existingUi =
        existing['ui_config'] && typeof existing['ui_config'] === 'object'
          ? (existing['ui_config'] as Record<string, unknown>)
          : {};

      merged['ui_config'] = {
        ...existingUi,
        ...Object.fromEntries(
          Object.entries(uiUpdate).filter(([, value]) => value !== undefined),
        ),
      };
    }

    next[name] = merged;
  }

  return next;
}
