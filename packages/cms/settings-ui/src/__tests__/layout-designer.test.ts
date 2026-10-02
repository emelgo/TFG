/**
 * Pruebas del diseñador de la ficha (F2.7c): distribución inicial, lectura
 * de la guardada y operaciones sobre grupos, filas y campos.
 */
import { describe, expect, it } from 'vitest';

import {
  addGroup,
  addRow,
  createDefaultRecordLayout,
  getUnplacedFields,
  moveField,
  moveGroup,
  placeField,
  prepareLayoutForSave,
  readRecordLayout,
  removeGroup,
  removeRow,
  rowUsedSize,
  setFieldSize,
} from '../utils/layout-designer';

const columns = [
  { name: 'id', isVisibleInDetail: true, isEditable: false },
  { name: 'name', isVisibleInDetail: true, isEditable: true },
  { name: 'email', isVisibleInDetail: true, isEditable: true },
  { name: 'secret', isVisibleInDetail: false, isEditable: false },
];

const labels = { layout: 'Ficha', group: 'Datos' };

describe('createDefaultRecordLayout', () => {
  it('reparte los campos permitidos de cada modo, dos por fila', () => {
    const layout = createDefaultRecordLayout(columns, labels);

    expect(layout.display[0]!.rows.map((r) => r.columns.length)).toEqual([
      2, 1,
    ]);
    expect(layout.edit[0]!.rows[0]!.columns.map((c) => c.fieldName)).toEqual([
      'name',
      'email',
    ]);
  });
});

describe('readRecordLayout', () => {
  it('quita campos inexistentes u ocultos y normaliza el tamaño', () => {
    const layout = readRecordLayout(
      {
        recordLayout: {
          id: 'l',
          name: 'n',
          display: [
            {
              id: 'g',
              label: 'G',
              rows: [
                {
                  id: 'r',
                  columns: [
                    { id: 'a', fieldName: 'name', size: 9 },
                    { id: 'b', fieldName: 'secret', size: 1 },
                    { id: 'c', fieldName: 'gone', size: 1 },
                  ],
                },
              ],
            },
          ],
          edit: [],
        },
      },
      columns,
    );

    expect(layout!.display[0]!.rows[0]!.columns).toEqual([
      { id: 'a', fieldName: 'name', size: 4 },
    ]);
    expect(readRecordLayout({}, columns)).toBeNull();
  });
});

describe('operaciones', () => {
  const base = addGroup([], { groupId: 'g1', rowId: 'r1' }, 'Uno');

  it('coloca campos hasta llenar la fila y ajusta al hueco libre', () => {
    const one = placeField(
      base,
      'name',
      { groupId: 'g1', rowId: 'r1' },
      'f1',
      3,
    )!;
    const two = placeField(
      one,
      'email',
      { groupId: 'g1', rowId: 'r1' },
      'f2',
      2,
    )!;

    expect(two[0]!.rows[0]!.columns.map((c) => c.size)).toEqual([3, 1]);
    expect(rowUsedSize(two[0]!.rows[0]!)).toBe(4);
    expect(
      placeField(two, 'id', { groupId: 'g1', rowId: 'r1' }, 'f3'),
    ).toBeNull();
    expect(
      getUnplacedFields(two, columns, 'display').map((c) => c.name),
    ).toEqual(['id']);
  });

  it('mueve campos entre filas solo si caben', () => {
    let groups = placeField(
      base,
      'name',
      { groupId: 'g1', rowId: 'r1' },
      'f1',
      4,
    )!;
    groups = addRow(groups, 'g1', 'r2');
    groups = placeField(
      groups,
      'email',
      { groupId: 'g1', rowId: 'r2' },
      'f2',
      2,
    )!;

    expect(moveField(groups, 'f2', { groupId: 'g1', rowId: 'r1' })).toBeNull();

    const moved = moveField(groups, 'f1', {
      groupId: 'g1',
      rowId: 'r2',
      index: 0,
    });

    expect(moved).toBeNull();

    const resized = setFieldSize(groups, 'f1', 2)!;
    const ok = moveField(resized, 'f1', {
      groupId: 'g1',
      rowId: 'r2',
      index: 0,
    })!;

    expect(ok[0]!.rows[1]!.columns.map((c) => c.id)).toEqual(['f1', 'f2']);
    expect(setFieldSize(ok, 'f2', 4)).toBeNull();
  });

  it('grupos y filas: añadir, mover, quitar y limpiar al guardar', () => {
    let groups = addGroup(base, { groupId: 'g2', rowId: 'r9' }, 'Dos');
    groups = placeField(groups, 'name', { groupId: 'g2', rowId: 'r9' }, 'f1')!;

    expect(moveGroup(groups, 'g2', -1)!.map((g) => g.id)).toEqual(['g2', 'g1']);
    expect(moveGroup(groups, 'g2', 1)).toBeNull();
    expect(removeRow(groups, 'g2', 'r9')[1]!.rows).toEqual([]);
    expect(removeGroup(groups, 'g1').map((g) => g.id)).toEqual(['g2']);

    const saved = prepareLayoutForSave({
      id: 'l',
      name: ' Ficha ',
      display: groups,
      edit: [],
    });

    expect(saved.name).toBe('Ficha');
    expect(saved.display.map((g) => g.id)).toEqual(['g2']);
  });
});
