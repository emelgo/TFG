/**
 * Pruebas de la conversión entre vistas guardadas y la URL del listado.
 */
import { describe, expect, it } from 'vitest';

import {
  isSavedViewDirty,
  savedViewToSearch,
  searchToSavedViewConfig,
} from '../utils/saved-views';

const view = {
  id: 'view-1',
  config: {
    filters: [
      { name: 'created_at', values: [{ operator: 'before', value: 'x' }] },
      { name: 'age', values: [{ operator: 'gt', value: 18 }] },
      { name: 'empty', values: [{ operator: 'eq', value: null }] },
    ],
    sort: { column: 'name', direction: 'desc' },
    search: 'ana',
  },
};

describe('savedViewToSearch', () => {
  it('copia la configuración a la URL con operadores SQL y valores de texto', () => {
    expect(savedViewToSearch(view, { pageSize: 10, page: 3 })).toEqual({
      pageSize: 10,
      view: 'view-1',
      search: 'ana',
      sortColumn: 'name',
      sortDirection: 'desc',
      filters: { 'created_at.lt': 'x', 'age.gt': '18' },
    });
  });

  it('tolera una configuración vacía', () => {
    expect(savedViewToSearch({ id: 'v', config: null })).toEqual({
      pageSize: undefined,
      view: 'v',
      search: undefined,
      sortColumn: undefined,
      sortDirection: undefined,
      filters: undefined,
    });
  });
});

describe('searchToSavedViewConfig', () => {
  it('guarda solo columna, operador y valor de cada filtro', () => {
    expect(
      searchToSavedViewConfig({
        filters: { 'name.contains': 'ana' },
        sortColumn: 'name',
        search: 'x',
      }),
    ).toEqual({
      filters: [
        { name: 'name', values: [{ operator: 'contains', value: 'ana' }] },
      ],
      sort: { column: 'name', direction: 'asc' },
      search: 'x',
    });
  });
});

describe('isSavedViewDirty', () => {
  it('no detecta cambios justo después de cargar la vista', () => {
    expect(isSavedViewDirty(view, savedViewToSearch(view))).toBe(false);
  });

  it('detecta un filtro nuevo o un cambio de orden', () => {
    const loaded = savedViewToSearch(view);

    expect(
      isSavedViewDirty(view, {
        ...loaded,
        filters: { ...loaded.filters, 'name.eq': 'b' },
      }),
    ).toBe(true);

    expect(isSavedViewDirty(view, { ...loaded, sortDirection: 'asc' })).toBe(
      true,
    );
  });

  it('ignora la página y el orden de los filtros', () => {
    const loaded = savedViewToSearch(view);

    expect(
      isSavedViewDirty(view, {
        ...loaded,
        page: 5,
        filters: { 'age.gt': '18', 'created_at.lt': 'x' },
      }),
    ).toBe(false);
  });
});
