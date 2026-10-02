/**
 * Pruebas de las utilidades de Ajustes > Recursos (F2.7c): orden de tablas
 * y columnas, lectura de la configuración guardada y cuerpo de los cambios.
 */
import { describe, expect, it } from 'vitest';

import {
  buildColumnUpdate,
  groupTablesBySchema,
  moveColumn,
  moveTable,
  readColumnsSettings,
  readRelationsSettings,
} from '../utils/resource-settings';

const table = (
  schemaName: string,
  tableName: string,
  ordering: number | null,
) => ({
  schemaName,
  tableName,
  displayName: null,
  isVisible: true,
  ordering,
});

describe('groupTablesBySchema', () => {
  it('agrupa por esquema (public primero) y ordena por ordering y nombre', () => {
    const groups = groupTablesBySchema([
      table('demo', 'orders', null),
      table('public', 'b', 1),
      table('demo', 'customers', 0),
      table('public', 'a', null),
      table('public', 'c', 0),
    ]);

    expect(groups.map((group) => group.schema)).toEqual(['public', 'demo']);
    expect(groups[0]!.tables.map((t) => t.tableName)).toEqual(['c', 'b', 'a']);
    expect(groups[1]!.tables.map((t) => t.tableName)).toEqual([
      'customers',
      'orders',
    ]);
  });
});

describe('moveTable', () => {
  const ordered = [table('demo', 'a', 0), table('demo', 'b', 1)];

  it('devuelve el nuevo orden completo del esquema', () => {
    expect(moveTable(ordered, 1, -1)).toEqual([
      { schema: 'demo', table: 'b', ordering: 0 },
      { schema: 'demo', table: 'a', ordering: 1 },
    ]);
  });

  it('no mueve más allá de los extremos', () => {
    expect(moveTable(ordered, 0, -1)).toBeNull();
    expect(moveTable(ordered, 1, 1)).toBeNull();
  });
});

describe('readColumnsSettings y buildColumnUpdate', () => {
  const columns = readColumnsSettings({
    name: {
      display_name: 'Nombre',
      is_visible_in_table: true,
      is_editable: true,
      ordering: 1,
      ui_config: { data_type: 'text' },
    },
    id: { is_primary_key: true, ordering: 0, ui_config: { data_type: 'uuid' } },
    email: { is_visible_in_table: false, ui_config: { ui_data_type: 'email' } },
  });

  it('ordena por ordering y lee los valores por defecto', () => {
    expect(columns.map((c) => c.name)).toEqual(['id', 'name', 'email']);
    expect(columns[0]!.isPrimaryKey).toBe(true);
    expect(columns[2]!.isVisibleInTable).toBe(false);
    expect(columns[2]!.uiDataType).toBe('email');
  });

  it('solo envía lo que ha cambiado', () => {
    const name = columns[1]!;
    const values = {
      displayName: ' Nombre completo ',
      description: '',
      isVisibleInTable: false,
      isVisibleInDetail: name.isVisibleInDetail,
      isSearchable: name.isSearchable,
      isSortable: name.isSortable,
      isFilterable: name.isFilterable,
      isEditable: name.isEditable,
      uiDataType: 'longtext',
    };

    expect(buildColumnUpdate(name, values)).toEqual({
      name: {
        display_name: 'Nombre completo',
        is_visible_in_table: false,
        ui_config: { ui_data_type: 'longtext' },
      },
    });
  });

  it('devuelve null si no cambia nada', () => {
    const id = columns[0]!;

    expect(
      buildColumnUpdate(id, {
        displayName: id.displayName,
        description: id.description,
        isVisibleInTable: id.isVisibleInTable,
        isVisibleInDetail: id.isVisibleInDetail,
        isSearchable: id.isSearchable,
        isSortable: id.isSortable,
        isFilterable: id.isFilterable,
        isEditable: id.isEditable,
        uiDataType: id.uiDataType,
      }),
    ).toBeNull();
  });

  it('moveColumn renumera todas las columnas', () => {
    expect(moveColumn(columns, 2, -1)).toEqual({
      id: { ordering: 0 },
      email: { ordering: 1 },
      name: { ordering: 2 },
    });
    expect(moveColumn(columns, 0, -1)).toBeNull();
  });
});

describe('readRelationsSettings', () => {
  it('las secciones están activadas salvo que se desactiven', () => {
    const [a, b] = readRelationsSettings([
      {
        type: 'one_to_many',
        source_column: 'id',
        target_schema: 'demo',
        target_table: 'orders',
        target_column: 'customer_id',
      },
      {
        type: 'one_to_many',
        source_column: 'id',
        target_schema: 'demo',
        target_table: 'x',
        target_column: 'y',
        inline_config: { enabled: false, section_label: 'X' },
      },
    ]);

    expect(a!.enabled).toBe(true);
    expect(b).toMatchObject({ enabled: false, sectionLabel: 'X' });
    expect(readRelationsSettings(null)).toEqual([]);
  });
});
