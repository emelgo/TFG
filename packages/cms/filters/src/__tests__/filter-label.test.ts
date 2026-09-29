/**
 * Pruebas del texto que resume un filtro aplicado.
 */
import { describe, expect, it } from 'vitest';

import { getFilterDisplayValue } from '../utils/filter-label';
import { makeColumn } from './fixtures';

const deps = {
  t: (key: string, values?: Record<string, string>) =>
    values ? `${key}(${JSON.stringify(values)})` : key,
  formatDate: (date: string | Date) =>
    new Date(date).toISOString().slice(0, 10),
  formatRelativeDate: (option: string) => `rel:${option}`,
  options: [],
};

function filterOf(dataType: string, operator: string, value: unknown) {
  return {
    ...makeColumn('col', dataType, { display_name: 'Col' }),
    values: [{ operator, value: value as string }],
  };
}

describe('getFilterDisplayValue', () => {
  it('muestra solo el nombre si aún no hay valor', () => {
    expect(getFilterDisplayValue(filterOf('text', 'eq', null), deps)).toBe(
      'Col',
    );
  });

  it('usa los textos de «está vacío»', () => {
    expect(getFilterDisplayValue(filterOf('text', 'isNull', true), deps)).toBe(
      'filters.isEmpty({"name":"Col"})',
    );
  });

  it('combina nombre, operador y valor', () => {
    expect(
      getFilterDisplayValue(filterOf('text', 'contains', 'ana'), deps),
    ).toBe('Col operators.contains ana');
  });

  it('formatea los rangos de fechas', () => {
    expect(
      getFilterDisplayValue(
        filterOf('date', 'between', '2025-01-01,__rel_date:today'),
        deps,
      ),
    ).toBe(
      'filters.betweenValues({"name":"Col","operator":"operators.between","start":"2025-01-01","end":"rel:today"})',
    );
  });

  it('traduce el operador SQL de fecha a su nombre de interfaz', () => {
    expect(
      getFilterDisplayValue(filterOf('date', 'lt', '__rel_date:today'), deps),
    ).toBe('Col operators.before rel:today');
  });
});
