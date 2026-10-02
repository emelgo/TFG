/**
 * Pruebas del estado del listado en la URL: validación, parámetros de la API
 * y traducción desde y hacia el estado de los filtros.
 */
import { describe, expect, it } from 'vitest';

import {
  DataExplorerSearchSchema,
  filterStateToSearch,
  getNextSort,
  searchToFilterState,
  toTableDataParams,
} from '../utils/search-schema';

describe('DataExplorerSearchSchema', () => {
  it('convierte a texto los valores que TanStack Router interpreta como JSON', () => {
    const search = DataExplorerSearchSchema.parse({
      search: 123,
      filters: { 'age.gt': 18, 'active.eq': true },
    });

    expect(search).toEqual({
      search: '123',
      filters: { 'age.gt': '18', 'active.eq': 'true' },
    });
  });

  it('descarta los valores no válidos en lugar de fallar', () => {
    expect(
      DataExplorerSearchSchema.parse({
        page: -3,
        pageSize: 10_000,
        sortDirection: 'sideways',
        filters: 'nope',
      }),
    ).toEqual({});
  });
});

describe('toTableDataParams', () => {
  it('omite los filtros vacíos y el sentido sin columna', () => {
    expect(
      toTableDataParams('public', 'accounts', {
        page: 2,
        sortDirection: 'desc',
        filters: {},
      }),
    ).toEqual({
      schema: 'public',
      table: 'accounts',
      page: 2,
      pageSize: undefined,
      search: undefined,
      sortColumn: undefined,
      sortDirection: undefined,
      filters: undefined,
    });
  });
});

describe('estado de los filtros', () => {
  it('vuelve a la primera página y conserva el tamaño al filtrar', () => {
    const previous = { page: 4, pageSize: 10, search: 'x' };

    const next = filterStateToSearch(
      { ...searchToFilterState(previous), filters: { 'name.eq': 'a' } },
      previous,
    );

    expect(next).toEqual({
      pageSize: 10,
      search: 'x',
      sortColumn: undefined,
      sortDirection: undefined,
      view: undefined,
      filters: { 'name.eq': 'a' },
    });
  });
});

describe('getNextSort', () => {
  it('ordena ascendente la primera vez e invierte después', () => {
    expect(getNextSort({}, 'name')).toEqual({
      sortColumn: 'name',
      sortDirection: 'asc',
    });

    expect(
      getNextSort({ sortColumn: 'name', sortDirection: 'asc' }, 'name'),
    ).toEqual({ sortColumn: 'name', sortDirection: 'desc' });

    expect(
      getNextSort({ sortColumn: 'name', sortDirection: 'desc' }, 'name'),
    ).toEqual({ sortColumn: 'name', sortDirection: 'asc' });
  });
});
