/**
 * Pruebas de la selección de filas para el borrado múltiple: solo se pueden
 * seleccionar filas identificables, la selección sobrevive al cambio de
 * página y la casilla de la cabecera refleja la página visible.
 */
import { describe, expect, it } from 'vitest';

import {
  getPageSelectionState,
  getRecordKeyConditions,
  getSelectionId,
  isRecordSelected,
  setPageSelection,
  toRecordKeys,
  toggleRecordSelection,
} from '../utils/record-selection';

const byId = { primary_keys: [{ column_name: 'id' }], unique_constraints: [] };

const composite = {
  primary_keys: [{ column_name: 'user_id' }, { column_name: 'account_id' }],
  unique_constraints: [],
};

const byUnique = {
  primary_keys: [],
  unique_constraints: [{ constraint_name: 'slug_key', columns: ['slug'] }],
};

describe('getRecordKeyConditions', () => {
  it('usa la clave primaria (simple o compuesta)', () => {
    expect(getRecordKeyConditions({ id: 1, name: 'a' }, byId)).toEqual({
      id: 1,
    });
    expect(
      getRecordKeyConditions({ user_id: 'u', account_id: 'a' }, composite),
    ).toEqual({ user_id: 'u', account_id: 'a' });
  });

  it('sin clave primaria usa una restricción única con valor', () => {
    expect(getRecordKeyConditions({ slug: 'x' }, byUnique)).toEqual({
      slug: 'x',
    });
    expect(getRecordKeyConditions({ slug: null }, byUnique)).toBeNull();
  });

  it('no identifica filas con la clave incompleta', () => {
    expect(getRecordKeyConditions({ user_id: 'u' }, composite)).toBeNull();
    expect(
      getRecordKeyConditions(
        { id: 1 },
        {
          primary_keys: [],
          unique_constraints: [],
        },
      ),
    ).toBeNull();
  });
});

describe('getSelectionId y toRecordKeys', () => {
  it('no depende del orden de las columnas', () => {
    expect(getSelectionId({ a: 1, b: 2 })).toBe(getSelectionId({ b: 2, a: 1 }));
  });

  it('convierte las condiciones en claves de texto', () => {
    expect(toRecordKeys({ id: 7, active: true })).toEqual({
      id: '7',
      active: 'true',
    });
  });
});

describe('selección', () => {
  const page1 = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const page2 = [{ id: 4 }, { id: 5 }];

  it('alterna una fila', () => {
    const one = toggleRecordSelection(new Map(), page1[0]!, byId);

    expect(one.size).toBe(1);
    expect(isRecordSelected(one, page1[0]!, byId)).toBe(true);
    expect(toggleRecordSelection(one, page1[0]!, byId).size).toBe(0);
  });

  it('ignora las filas que no se pueden identificar', () => {
    const selection = new Map();

    expect(toggleRecordSelection(selection, { name: 'x' }, byId)).toBe(
      selection,
    );
  });

  it('selecciona la página sin perder la de otras páginas', () => {
    let selection = setPageSelection(new Map(), page1, byId, true);

    selection = toggleRecordSelection(selection, page2[0]!, byId);

    expect(selection.size).toBe(4);
    expect(getPageSelectionState(selection, page1, byId)).toBe('all');
    expect(getPageSelectionState(selection, page2, byId)).toBe('some');

    selection = setPageSelection(selection, page1, byId, false);

    expect(selection.size).toBe(1);
    expect(getPageSelectionState(selection, page1, byId)).toBe('none');
    expect([...selection.values()][0]!.conditions).toEqual({ id: 4 });
  });
});
