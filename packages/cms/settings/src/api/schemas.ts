import * as z from 'zod';

export const RelationConfigSchema = z.object({
  type: z.enum(['one_to_one', 'one_to_many', 'many_to_one', 'many_to_many']),
  source_column: z.string(),
  target_column: z.string(),
  target_table: z.string(),
  target_schema: z.string(),
});

export const TableMetadataSchema = z.object({
  name: z.string().min(1),
  display_name: z.string().optional(),
  description: z.string().optional(),
  is_visible: z.boolean(),
  is_searchable: z.boolean().optional(),
  display_format: z.string().optional(),
  ordering: z.number().optional(),
  updated_at: z.string().optional(),
});

const EnumBadges = z
  .record(
    z.string(),
    z.object({
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
    }),
  )
  .nullish()
  .default({});

export const FullColumnMetadataSchema = z.object({
  name: z.string().min(1),
  display_name: z.string().nullish(),
  description: z.string().nullish(),
  is_visible_in_table: z.boolean(),
  is_visible_in_detail: z.boolean(),
  is_searchable: z.boolean(),
  is_required: z.boolean().default(true),
  is_sortable: z.boolean(),
  is_primary_key: z.boolean(),
  is_filterable: z.boolean(),
  is_editable: z.boolean(),
  default_value: z.string().nullish(),
  ordering: z.number().nullish(),
  display_format: z.string().nullish(),
  ui_config: z
    .object({
      max_length: z.number().nullish(),
      is_enum: z.boolean().nullish(),
      enum_type: z.string().nullish(),
      enum_values: z.array(z.string()).nullish(),
      enum_badges: EnumBadges,
      data_type: z.string(),
      ui_data_type: z.string().nullish(),
      ui_data_type_config: z.record(z.any(), z.any()).nullish(),
      boolean_labels: z
        .object({
          true_label: z.string().optional(),
          false_label: z.string().optional(),
        })
        .optional(),
      enable_smart_suggestions: z.boolean().optional().default(true),
    })
    .nullish(),
  relations: z.array(RelationConfigSchema).default([]),
});

/**
 * Type for configuring a single table metadata
 */
export type FullColumnMetadataSchemaType = z.infer<
  typeof FullColumnMetadataSchema
>;

export type TableMetadataSchemaType = z.infer<typeof TableMetadataSchema>;

/**
 * Schema for configuring resources
 */
export const UpdateTablesMetadataSchema = z.array(
  z.object({
    table: z.string(),
    schema: z.string(),
    ordering: z.number(),
    isVisible: z.boolean(),
  }),
);

export const SyncTablesSchema = z.object({
  schema: z
    .string()
    .min(1)
    .transform((value) => value.trim()),
  table: z
    .preprocess(
      (val: unknown): string | undefined =>
        val === '' ? undefined : (val as string),
      z.string().min(1).optional(),
    )
    .transform<string | undefined>((value) => value?.trim()),
});

export type SyncTablesSchemaType = z.infer<typeof SyncTablesSchema>;

/**
 * Schema for configuring a table columns config
 */
export const UpdateTableColumnsConfigSchema = z
  .record(z.string(), FullColumnMetadataSchema)
  .refine(
    (data) => {
      return Object.keys(data).every((key) => {
        return data[key]!.name === key;
      });
    },
    {
      message: 'Column name must match the key',
    },
  );

/**
 * Type for configuring resources
 */
export type UpdateTablesMetadataSchemaType = z.infer<
  typeof UpdateTablesMetadataSchema
>;

/**
 * Schema for inline relation config (minimal scope)
 * Full config support deferred to Phase 5
 */
export const InlineRelationConfigSchema = z.object({
  enabled: z.boolean(),
  section_label: z.string().optional(),
});

export type InlineRelationConfigSchemaType = z.infer<
  typeof InlineRelationConfigSchema
>;

/**
 * Schema for updating relations config with inline_config
 */
export const UpdateRelationsConfigSchema = z.object({
  updates: z.array(
    z.object({
      source_column: z.string(),
      target_schema: z.string(),
      target_table: z.string(),
      target_column: z.string(),
      inline_config: InlineRelationConfigSchema,
    }),
  ),
});

export type UpdateRelationsConfigSchemaType = z.infer<
  typeof UpdateRelationsConfigSchema
>;
