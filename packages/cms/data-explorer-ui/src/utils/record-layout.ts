/**
 * Distribución de los campos en la ficha de un registro.
 *
 * Una tabla puede tener una distribución guardada desde sus ajustes
 * (`ui_config.recordLayout`: grupos con filas y columnas de ancho 1–4). Si
 * existe y tiene algún campo que se pueda mostrar, la ficha la usa; si no, se
 * aplica la distribución por defecto, que reparte las columnas visibles en
 * tres grupos según su nombre y sus relaciones:
 *
 *  - **main**: datos propios del registro;
 *  - **relations**: claves foráneas (enlazan a otra fila);
 *  - **system**: `id`, marcas de tiempo (`*_at`), autoría (`*_by`) y
 *    columnas `*_id` que no son relaciones.
 *
 * Son funciones puras para poder probarlas sin navegador. El diseñador de
 * distribuciones llega con los ajustes del CMS (F2.7).
 */
import type {
  ColumnMetadata,
  RecordLayoutConfig,
  RelationConfig,
} from '@pymekit/cms-types';

export type LayoutMode = 'display' | 'edit';

export type DefaultColumnGroupKey = 'main' | 'relations' | 'system';

/**
 * Indica si una distribución guardada tiene algún campo que mostrar en el
 * modo indicado: la columna debe existir en la tabla y estar visible en la
 * ficha (`display`) o ser editable (`edit`). Una distribución que solo
 * menciona columnas borradas u ocultas no sirve y se ignora.
 */
export function hasRenderableFields(
  layout: RecordLayoutConfig,
  columns: ColumnMetadata[],
  mode: LayoutMode,
) {
  const groups = mode === 'display' ? layout.display : layout.edit;

  if (!Array.isArray(groups) || groups.length === 0) {
    return false;
  }

  const columnMap = new Map(columns.map((column) => [column.name, column]));

  return groups.some((group) =>
    (group.rows ?? []).some((row) =>
      (row.columns ?? []).some((layoutColumn) => {
        const column = columnMap.get(layoutColumn.fieldName);

        if (!column) {
          return false;
        }

        return mode === 'display'
          ? column.is_visible_in_detail
          : column.is_editable;
      }),
    ),
  );
}

/**
 * Devuelve la distribución guardada de la tabla si se puede usar para
 * mostrar la ficha, o `null` para usar la distribución por defecto.
 */
export function getCustomRecordLayout(
  uiConfig: unknown,
  columns: ColumnMetadata[],
): RecordLayoutConfig | null {
  const layout = (uiConfig as { recordLayout?: RecordLayoutConfig | null })
    ?.recordLayout;

  if (!layout || typeof layout !== 'object') {
    return null;
  }

  return hasRenderableFields(layout, columns, 'display') ? layout : null;
}

/**
 * Reparte las columnas visibles en la ficha en los grupos de la distribución
 * por defecto, ordenadas por `ordering` (las que no lo tienen, al final y en
 * su orden original). Solo se devuelven los grupos con alguna columna.
 */
export function groupColumnsForDefaultLayout(
  columns: ColumnMetadata[],
  relationsConfig: RelationConfig[],
) {
  const groups: Record<DefaultColumnGroupKey, ColumnMetadata[]> = {
    main: [],
    relations: [],
    system: [],
  };

  const relationColumns = new Set(
    relationsConfig.map((relation) => relation.source_column),
  );

  const visible = columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => column.is_visible_in_detail)
    .sort(
      (a, b) =>
        (a.column.ordering ?? Number.MAX_SAFE_INTEGER) -
          (b.column.ordering ?? Number.MAX_SAFE_INTEGER) || a.index - b.index,
    );

  for (const { column } of visible) {
    const isRelation = relationColumns.has(column.name);

    if (
      column.name === 'id' ||
      column.name.endsWith('_at') ||
      column.name.endsWith('_by') ||
      (column.name.endsWith('_id') && !isRelation)
    ) {
      groups.system.push(column);
    } else if (isRelation) {
      groups.relations.push(column);
    } else {
      groups.main.push(column);
    }
  }

  return (['main', 'relations', 'system'] as const)
    .filter((key) => groups[key].length > 0)
    .map((key) => ({ key, columns: groups[key] }));
}

/**
 * Ancho de un campo en una fila de la distribución guardada: el tamaño va de
 * 1 a 4 cuartos de la fila.
 */
export function getLayoutColumnFlexBasis(size: number) {
  const clamped = Math.min(Math.max(size || 1, 1), 4);

  return `${(clamped / 4) * 100}%`;
}
