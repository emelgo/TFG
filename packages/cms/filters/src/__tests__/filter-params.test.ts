/**
 * Pruebas de la conversión entre los filtros de la interfaz y la URL
 * (`"columna.operador": "valor"`), en los dos sentidos.
 */
import { describe, expect, it } from 'vitest';

import {
  filtersToParams,
  parseFiltersFromParams,
  splitFilterKey,
} from '../utils/filter-params';
import { makeColumn } from './fixtures';

const formatters = {
  formatTimestamp: (date: Date) => `fecha:${date.toISOString()}`,
  formatRelativeDate: (option: string) => `rel:${option}`,
  formatBoolean: (value: boolean) => (value ? 'Sí' : 'No'),
};

const columns = [
  makeColumn('name', 'text'),
  makeColumn('created_at', 'timestamp with time zone'),
  makeColumn('is_active', 'boolean'),
  makeColumn('account_id', 'uuid'),
];

describe('splitFilterKey', () => {
  it('separa columna y operador por el último punto', () => {
    expect(splitFilterKey('name.contains')).toEqual({
      columnName: 'name',
      operator: 'contains',
    });
  });

  it('usa «eq» si no hay operador', () => {
    expect(splitFilterKey('name')).toEqual({
      columnName: 'name',
      operator: 'eq',
    });
  });
});

describe('parseFiltersFromParams', () => {
  it('ignora columnas desconocidas y valores vacíos', () => {
    const filters = parseFiltersFromParams(
      { 'unknown.eq': 'x', 'name.eq': '' },
      columns,
      [],
      [],
      formatters,
    );

    expect(filters).toEqual([]);
  });

  it('traduce los operadores SQL de fecha y convierte el valor en Date', () => {
    const [filter] = parseFiltersFromParams(
      { 'created_at.gte': '2025-01-01T00:00:00.000Z' },
      columns,
      [],
      [],
      formatters,
    );

    expect(filter?.values[0]?.operator).toBe('afterOrOn');
    expect(filter?.values[0]?.value).toBeInstanceOf(Date);
    expect(filter?.values[0]?.label).toBe('fecha:2025-01-01T00:00:00.000Z');
  });

  it('reconoce las fechas relativas', () => {
    const [filter] = parseFiltersFromParams(
      { 'created_at.lt': '__rel_date:last7Days' },
      columns,
      [],
      [],
      formatters,
    );

    expect(filter?.values[0]).toMatchObject({
      operator: 'before',
      isRelativeDate: true,
      relativeDateOption: 'last7Days',
      label: 'rel:last7Days',
    });
  });

  it('convierte los booleanos', () => {
    const [filter] = parseFiltersFromParams(
      { 'is_active.eq': 'true' },
      columns,
      [],
      [],
      formatters,
    );

    expect(filter?.values[0]).toMatchObject({ value: true, label: 'Sí' });
  });

  it('usa la etiqueta de la fila relacionada si la trae la página', () => {
    const [filter] = parseFiltersFromParams(
      { 'account_id.eq': 'abc' },
      columns,
      [],
      [{ column: 'account_id', original: 'abc', formatted: 'Ana', link: null }],
      formatters,
    );

    expect(filter?.values[0]?.label).toBe('Ana');
  });
});

describe('filtersToParams', () => {
  it('omite los filtros sin valor y traduce los operadores de fecha', () => {
    const [name, created] = parseFiltersFromParams(
      {
        'name.contains': 'ana',
        'created_at.gt': '2025-01-01T00:00:00.000Z',
      },
      columns,
      [],
      [],
      formatters,
    );

    const empty = { ...name!, name: 'is_active', values: [] };

    expect(filtersToParams([name!, created!, empty])).toEqual({
      'name.contains': 'ana',
      'created_at.gt': '2025-01-01T00:00:00.000Z',
    });
  });

  it('hace el viaje de ida y vuelta sin perder información', () => {
    const params = {
      'name.startsWith': 'A',
      'is_active.eq': 'false',
      'created_at.between': '2025-01-01,2025-02-01',
    };

    const filters = parseFiltersFromParams(params, columns, [], [], formatters);

    expect(filtersToParams(filters)).toEqual(params);
  });
});
