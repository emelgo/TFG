/**
 * Pruebas del orden de las columnas del listado: primero la preferencia del
 * usuario y, si no la hay, el `ordering` del metadato de la tabla.
 */
import { describe, expect, it } from 'vitest';

import type { ColumnMetadata } from '@pymekit/cms-types';

import { sortTableColumns } from '../utils/sort-table-columns';

function column(name: string, ordering: number | null): ColumnMetadata {
  return {
    name,
    ordering,
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
    ui_config: { data_type: 'text' },
  };
}

const names = (columns: ColumnMetadata[]) => columns.map((c) => c.name);

describe('sortTableColumns', () => {
  it('ordena por `ordering` y deja al final las columnas sin él', () => {
    const columns = [column('c', null), column('b', 2), column('a', 1)];

    expect(names(sortTableColumns(columns))).toEqual(['a', 'b', 'c']);
  });

  it('aplica primero el orden elegido por el usuario', () => {
    const columns = [column('a', 1), column('b', 2), column('c', 3)];

    expect(names(sortTableColumns(columns, ['c', 'a']))).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('ignora en la preferencia las columnas que ya no existen', () => {
    const columns = [column('a', 1), column('b', 2)];

    expect(names(sortTableColumns(columns, ['zzz', 'b']))).toEqual(['b', 'a']);
  });
});
