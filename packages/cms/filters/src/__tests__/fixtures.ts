import type { ColumnMetadata, PostgresDataType } from '@pymekit/cms-types';

/** Crea el metadato de una columna para las pruebas. */
export function makeColumn(
  name: string,
  dataType: PostgresDataType | string,
  overrides: Partial<ColumnMetadata> = {},
): ColumnMetadata {
  return {
    name,
    ordering: null,
    display_name: null,
    description: null,
    is_searchable: true,
    is_visible_in_table: true,
    is_visible_in_detail: true,
    default_value: null,
    is_sortable: true,
    is_filterable: true,
    is_editable: true,
    is_primary_key: false,
    is_required: false,
    relations: [],
    ui_config: { data_type: dataType as PostgresDataType },
    ...overrides,
  };
}
