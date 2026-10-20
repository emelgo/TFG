/**
 * Pruebas de las utilidades de Ajustes > Recursos (F2.7c): orden de tablas
 * y columnas, lectura de la configuración guardada y cuerpo de los cambios.
 */
import { describe, expect, it } from 'vitest';

import {
  buildColumnUpdate,
  groupTablesByArea,
  moveColumn,
  moveTable,
  readColumnsSettings,
  readRelationsSettings,
} from '../utils/resource-settings';

const table = (
  navigationGroup: string | null,
  tableName: string,
  ordering: number | null,
) => ({
  schemaName: 'public',
  tableName,
  displayName: null,
  isVisible: true,
  ordering,
  navigationGroup,
});

describe('groupTablesByArea', () => {
  it('agrupa por área (sin área al final) y ordena por ordering y nombre', () => {
    const groups = groupTablesByArea([
      table(null, 'orders', null),
      table('Cuentas', 'b', 21),
      table('Blog', 'posts', 10),
      table('Cuentas', 'a', null),
      table('Cuentas', 'c', 20),
      table('  ', 'loose', 0),
    ]);

    expect(groups.map((group) => group.name)).toEqual([
      'Blog',
      'Cuentas',
      null,
    ]);
    expect(groups[1]!.items.map((t) => t.tableName)).toEqual(['c', 'b', 'a']);
    expect(groups[2]!.items.map((t) => t.tableName)).toEqual([
      'loose',
      'orders',
    ]);
  });
});

describe('moveTable', () => {
  const ordered = [table('Blog', 'a', 100), table('Blog', 'b', 101)];

  it('devuelve el nuevo orden del área conservando su menor ordering', () => {
    expect(moveTable(ordered, 1, -1)).toEqual([
      { schema: 'public', table: 'b', ordering: 100 },
      { schema: 'public', table: 'a', ordering: 101 },
    ]);
  });

  it('empieza en 0 si ninguna tabla tenía orden', () => {
    expect(
      moveTable([table(null, 'a', null), table(null, 'b', null)], 0, 1),
    ).toEqual([
      { schema: 'public', table: 'b', ordering: 0 },
      { schema: 'public', table: 'a', ordering: 1 },
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
      valueLabels: {},
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
        valueLabels: id.valueLabels,
      }),
    ).toBeNull();
  });

  it('guarda solo las etiquetas de enumerado no vacías y las borra con null', () => {
    const [status] = readColumnsSettings({
      status: {
        ui_config: {
          data_type: 'USER-DEFINED',
          enum_type: 'order_status',
          enum_values: ['pending', 'paid'],
          value_labels: { pending: 'Por cobrar', bogus: 42 },
        },
      },
    });

    expect(status!.enumType).toBe('order_status');
    expect(status!.valueLabels).toEqual({ pending: 'Por cobrar' });

    const base = {
      displayName: status!.displayName,
      description: status!.description,
      isVisibleInTable: status!.isVisibleInTable,
      isVisibleInDetail: status!.isVisibleInDetail,
      isSearchable: status!.isSearchable,
      isSortable: status!.isSortable,
      isFilterable: status!.isFilterable,
      isEditable: status!.isEditable,
      uiDataType: status!.uiDataType,
    };

    expect(
      buildColumnUpdate(status!, {
        ...base,
        valueLabels: { pending: 'Por cobrar', paid: ' Cobrado ', ghost: 'x' },
      }),
    ).toEqual({
      status: {
        ui_config: { value_labels: { pending: 'Por cobrar', paid: 'Cobrado' } },
      },
    });

    expect(
      buildColumnUpdate(status!, { ...base, valueLabels: { pending: '' } }),
    ).toEqual({ status: { ui_config: { value_labels: null } } });
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
