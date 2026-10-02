export type PostgresDataType =
  | 'integer'
  | 'bigint'
  | 'real'
  | 'double precision'
  | 'smallint'
  | 'character varying'
  | 'text'
  | 'boolean'
  | 'date'
  | 'timestamp'
  | 'timestamp with time zone'
  | 'time'
  | 'json'
  | 'jsonb'
  | 'bytea'
  | 'uuid'
  | 'inet'
  | 'macaddr'
  | 'numeric';

export type RelationType =
  | 'one_to_one'
  | 'one_to_many'
  | 'many_to_one'
  | 'many_to_many';

/**
 * Configuration for inline O2M relation sections in record forms
 */
export interface InlineRelationConfig {
  enabled: boolean;
  section_label?: string;
  max_visible_rows?: number;
  visible_columns?: string[];
  editable_columns?: string[];
  permissions?: {
    can_create?: boolean;
    can_edit?: boolean;
    can_delete?: boolean;
  };
  confirm_delete?: boolean;
}

/**
 * Relation configuration
 */
export interface RelationConfig {
  type: RelationType;
  source_column: string;
  target_column: string;
  target_table: string;
  target_schema: string;
  display_fields?: string[];
  inline_config?: InlineRelationConfig;
}

/**
 * Many-to-many relation configuration derived from junction tables
 */
export interface M2MRelationConfig {
  sourceColumn: string;
  targetSchema: string;
  targetTable: string;
  targetColumn: string;
  junctionSchema: string;
  junctionTable: string;
  junctionSourceColumn: string;
  junctionTargetColumn: string;
}

/**
 * Junction table metadata for M2M relation validation
 */
export type JunctionMetadata = {
  primaryKeys: string[];
  uniqueConstraints: Array<{ columns: string[] }>;
};

export type EnumBadgeVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'warning'
  | 'info';

/**
 * Column UI configuration
 */
export interface ColumnsUiConfig {
  data_type: PostgresDataType;
  ui_data_type?: string;
  ui_data_type_config?: Record<string, unknown>;
  is_enum?: boolean;
  enum_values?: string[];
  max_length?: number;
  enum_badges?: Record<
    string,
    {
      variant?: EnumBadgeVariant;
    }
  >;
  enable_smart_suggestions?: boolean;
  currency?: string;
  boolean_labels?: {
    true_label?: string;
    false_label?: string;
  };
}

/**
 * Column metadata
 */
export interface ColumnMetadata {
  name: string;
  ordering: number | null;
  display_name: string | null;
  description: string | null;
  is_searchable: boolean;
  /** Controls visibility in data table/list view */
  is_visible_in_table: boolean;
  /** Controls visibility in record detail/form view */
  is_visible_in_detail: boolean;
  default_value: string | null;
  is_sortable: boolean;
  is_filterable: boolean;
  is_editable: boolean;
  is_primary_key: boolean;
  is_required: boolean;
  relations: RelationConfig[];
  ui_config: ColumnsUiConfig;
}

export type ColumnsConfig = Record<string, ColumnMetadata>;

// Layout types for record forms
export type ColumnSize = 1 | 2 | 3 | 4;

export interface LayoutColumn {
  id: string;
  fieldName: string;
  size: ColumnSize;
  metadata?: ColumnMetadata;
}

export interface LayoutRow {
  id: string;
  columns: LayoutColumn[];
}

export interface LayoutGroup {
  id: string;
  label: string;
  rows: LayoutRow[];
  isCollapsed?: boolean;
}

export type LayoutMode = 'display' | 'edit';

export interface RecordLayoutConfig {
  id: string;
  name: string;
  display: LayoutGroup[];
  edit: LayoutGroup[];
}

// Legacy type for backward compatibility
export interface RecordLayout {
  id: string;
  name: string;
  rows: LayoutRow[];
  createdAt: string;
  updatedAt: string;
}

export type TableUiConfig = {
  primary_keys: Array<{
    column_name: string;
  }>;

  unique_constraints: {
    columns: string[];
    constraint_name: string;
  }[];

  recordLayout?: RecordLayoutConfig | null;
};
