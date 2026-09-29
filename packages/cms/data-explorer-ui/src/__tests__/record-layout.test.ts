/**
 * Pruebas de la distribución de la ficha: uso de la distribución guardada
 * solo si tiene campos visibles y reparto por defecto en grupos.
 */
import { describe, expect, it } from 'vitest';

import type {
  ColumnMetadata,
  RecordLayoutConfig,
  RelationConfig,
} from '@pymekit/cms-types';

import {
  getCustomRecordLayout,
  getLayoutColumnFlexBasis,
  groupColumnsForDefaultLayout,
  hasRenderableFields,
} from '../utils/record-layout';

function column(
  name: string,
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
    ui_config: { data_type: 'text' },
    ...overrides,
  };
}

function layout(fields: string[]): RecordLayoutConfig {
  return {
    id: 'layout',
    name: 'Layout',
    display: [
      {
        id: 'g1',
        label: 'Group',
        rows: [
          {
            id: 'r1',
            columns: fields.map((fieldName, index) => ({
              id: `c${index}`,
              fieldName,
              size: 2,
            })),
          },
        ],
      },
    ],
    edit: [],
  };
}

const relation = (source: string): RelationConfig => ({
  type: 'many_to_one',
  source_column: source,
  target_column: 'id',
  target_schema: 'public',
  target_table: 'accounts',
});

describe('hasRenderableFields', () => {
  const columns = [
    column('name'),
    column('hidden', { is_visible_in_detail: false, is_editable: false }),
  ];

  it('acepta una distribución con algún campo visible', () => {
    expect(hasRenderableFields(layout(['name']), columns, 'display')).toBe(
      true,
    );
  });

  it('rechaza campos ocultos o que ya no existen', () => {
    expect(
      hasRenderableFields(layout(['hidden', 'deleted']), columns, 'display'),
    ).toBe(false);
  });

  it('en modo edición mira si el campo es editable', () => {
    const editLayout = { ...layout([]), edit: layout(['hidden']).display };

    expect(hasRenderableFields(editLayout, columns, 'edit')).toBe(false);
  });

  it('rechaza una distribución sin grupos', () => {
    expect(hasRenderableFields(layout([]), columns, 'display')).toBe(false);
  });
});

describe('getCustomRecordLayout', () => {
  const columns = [column('name')];

  it('devuelve la distribución guardada si se puede usar', () => {
    const saved = layout(['name']);

    expect(getCustomRecordLayout({ recordLayout: saved }, columns)).toBe(saved);
  });

  it('vuelve a la distribución por defecto si no hay o no sirve', () => {
    expect(getCustomRecordLayout({}, columns)).toBeNull();
    expect(getCustomRecordLayout(null, columns)).toBeNull();
    expect(getCustomRecordLayout({ recordLayout: null }, columns)).toBeNull();
    expect(
      getCustomRecordLayout({ recordLayout: layout(['gone']) }, columns),
    ).toBeNull();
  });
});

describe('groupColumnsForDefaultLayout', () => {
  it('reparte en datos, relaciones y sistema', () => {
    const groups = groupColumnsForDefaultLayout(
      [
        column('id'),
        column('name'),
        column('account_id'),
        column('external_id'),
        column('created_at'),
        column('updated_by'),
        column('secret', { is_visible_in_detail: false }),
      ],
      [relation('account_id'), relation('updated_by')],
    );

    expect(
      groups.map((group) => [group.key, group.columns.map((c) => c.name)]),
    ).toEqual([
      ['main', ['name']],
      ['relations', ['account_id']],
      ['system', ['id', 'external_id', 'created_at', 'updated_by']],
    ]);
  });

  it('ordena por `ordering` y deja al final las columnas sin orden', () => {
    const groups = groupColumnsForDefaultLayout(
      [
        column('c', { ordering: null }),
        column('b', { ordering: 2 }),
        column('a', { ordering: 0 }),
      ],
      [],
    );

    expect(groups[0]?.columns.map((c) => c.name)).toEqual(['a', 'b', 'c']);
  });

  it('omite los grupos vacíos', () => {
    expect(groupColumnsForDefaultLayout([column('name')], [])).toHaveLength(1);
  });
});

describe('getLayoutColumnFlexBasis', () => {
  it('convierte el tamaño 1–4 en un porcentaje de la fila', () => {
    expect(getLayoutColumnFlexBasis(1)).toBe('25%');
    expect(getLayoutColumnFlexBasis(4)).toBe('100%');
    expect(getLayoutColumnFlexBasis(9)).toBe('100%');
  });
});
