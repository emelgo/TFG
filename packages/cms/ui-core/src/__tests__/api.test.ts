/**
 * Pruebas de la traducción de los parámetros del listado de una tabla a la
 * *query string* de la API del CMS.
 */
import { describe, expect, it } from 'vitest';

import { toTableDataQuery } from '../api';

describe('toTableDataQuery', () => {
  it('omite los parámetros vacíos', () => {
    expect(toTableDataQuery({ schema: 'public', table: 'accounts' })).toEqual(
      {},
    );
  });

  it('serializa los filtros en `properties` y la paginación como texto', () => {
    expect(
      toTableDataQuery({
        schema: 'public',
        table: 'accounts',
        page: 2,
        pageSize: 10,
        search: 'ana',
        filters: { 'name.contains': 'ana' },
      }),
    ).toEqual({
      page: '2',
      page_size: '10',
      search: 'ana',
      properties: JSON.stringify({ 'name.contains': 'ana' }),
    });
  });

  it('usa orden ascendente si solo se indica la columna', () => {
    expect(
      toTableDataQuery({
        schema: 'public',
        table: 'accounts',
        sortColumn: 'name',
      }),
    ).toEqual({ sort_column: 'name', sort_direction: 'asc' });
  });
});
