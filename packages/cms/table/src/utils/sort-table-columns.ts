import type { ColumnMetadata } from '@pymekit/cms-types';

/**
 * Ordena las columnas visibles del listado: primero por la preferencia del
 * usuario (`columnOrder`) y, para las que no tiene, por el `ordering` del
 * metadato. Las columnas sin `ordering` van al final.
 */
export function sortTableColumns(
  columns: ColumnMetadata[],
  columnOrder: string[] = [],
) {
  const byMetadata = [...columns].sort((a, b) => {
    if (a.ordering === null || a.ordering === undefined) {
      return 1;
    }

    if (b.ordering === null || b.ordering === undefined) {
      return -1;
    }

    return a.ordering - b.ordering;
  });

  if (columnOrder.length === 0) {
    return byMetadata;
  }

  const rank = (name: string) => {
    const index = columnOrder.indexOf(name);

    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  return byMetadata
    .map((column, index) => ({ column, index }))
    .sort(
      (a, b) => rank(a.column.name) - rank(b.column.name) || a.index - b.index,
    )
    .map(({ column }) => column);
}
