/**
 * Pruebas de las utilidades puras de los filtros: operadores por tipo,
 * validación de campos y de filtros JSON y texto de la «píldora».
 */
import { describe, expect, it } from 'vitest';

import type { ColumnMetadata } from '@pymekit/cms-types';

import type { FilterItem } from '../types';
import {
  getFilterInputConfig,
  isValidFilterInput,
} from '../utils/filter-input';
import { getFilterDisplayValue } from '../utils/filter-label';
import { hasValidValue } from '../utils/filter-state';
import { validateJsonFilterValue } from '../utils/json-filter';
import {
  getOperatorsForDataType,
  mapDateOperator,
  mapSqlToDateOperator,
} from '../utils/operators';

function filter(
  dataType: ColumnMetadata['ui_config']['data_type'],
  value: FilterItem['values'][number],
  uiDataType?: string,
): FilterItem {
  return {
    name: 'col',
    ordering: null,
    display_name: 'Col',
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
    ui_config: { data_type: dataType, ui_data_type: uiDataType },
    values: [value],
  };
}

describe('operadores', () => {
  it('ofrece los operadores del tipo y los de enumerado', () => {
    expect(getOperatorsForDataType('text')).toContain('contains');
    expect(getOperatorsForDataType('integer')).toContain('between');
    expect(getOperatorsForDataType('text', true)).toEqual([
      'eq',
      'neq',
      'isNull',
      'notNull',
    ]);
    expect(getOperatorsForDataType('tsvector')).toEqual(
      getOperatorsForDataType('default'),
    );
  });

  it('traduce los operadores de fecha en los dos sentidos', () => {
    expect(mapDateOperator('beforeOrOn')).toBe('lte');
    expect(mapSqlToDateOperator('lte', 'date')).toBe('beforeOrOn');
    expect(mapSqlToDateOperator('lte', 'integer')).toBe('lte');
  });
});

describe('hasValidValue', () => {
  it('rechaza nulos y cadenas vacías', () => {
    expect(hasValidValue(filter('text', { operator: 'eq', value: null }))).toBe(
      false,
    );
    expect(hasValidValue(filter('text', { operator: 'eq', value: ' ' }))).toBe(
      false,
    );
    expect(
      hasValidValue(filter('boolean', { operator: 'eq', value: false })),
    ).toBe(true);
  });
});

describe('validación del campo de texto', () => {
  it('valida el formato según el tipo', () => {
    const number = getFilterInputConfig(
      filter('integer', { operator: 'eq', value: null }),
    );
    const uuid = getFilterInputConfig(
      filter('uuid', { operator: 'eq', value: null }),
    );
    const email = getFilterInputConfig(
      filter('text', { operator: 'eq', value: null }, 'email'),
    );

    expect(isValidFilterInput('12', number, 'eq')).toBe(true);
    expect(isValidFilterInput('doce', number, 'eq')).toBe(false);
    expect(isValidFilterInput('no-uuid', uuid, 'eq')).toBe(false);
    expect(isValidFilterInput('a@b.es', email, 'eq')).toBe(true);
  });

  it('no valida las coincidencias parciales', () => {
    const email = getFilterInputConfig(
      filter('text', { operator: 'eq', value: null }, 'email'),
    );

    expect(isValidFilterInput('@empresa', email, 'contains')).toBe(true);
  });
});

describe('validateJsonFilterValue', () => {
  it('comprueba el formato de cada modo', () => {
    expect(validateJsonFilterValue('containsText', '')).toBe(
      'filters.jsonErrors.emptyValue',
    );
    expect(validateJsonFilterValue('keyEquals', 'status')).toBe(
      'filters.jsonErrors.missingColon',
    );
    expect(validateJsonFilterValue('keyEquals', 'status:active')).toBeNull();
    expect(validateJsonFilterValue('pathExists', 'user.name')).toBe(
      'filters.jsonErrors.invalidPath',
    );
    expect(validateJsonFilterValue('pathExists', '$.user')).toBeNull();
  });
});

describe('getFilterDisplayValue', () => {
  const deps = {
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key}:${JSON.stringify(values)}` : key.split('.').pop()!,
    formatDate: (date: string | Date) =>
      new Date(date).toISOString().slice(0, 10),
    formatRelativeDate: (option: string) => `rel:${option}`,
    options: [],
  };

  it('resume operador y valor', () => {
    expect(
      getFilterDisplayValue(
        filter('text', { operator: 'contains', value: 'ana' }),
        deps,
      ),
    ).toBe('Col contains ana');
  });

  it('usa textos propios para los nulos y los rangos', () => {
    expect(
      getFilterDisplayValue(
        filter('text', { operator: 'isNull', value: true }),
        deps,
      ),
    ).toBe('filters.isEmpty:{"name":"Col"}');

    expect(
      getFilterDisplayValue(
        filter('integer', { operator: 'between', value: '1,5' }),
        deps,
      ),
    ).toContain('"start":"1","end":"5"');
  });

  it('muestra solo el nombre si aún no hay valor', () => {
    expect(
      getFilterDisplayValue(
        filter('text', { operator: 'eq', value: null }),
        deps,
      ),
    ).toBe('Col');
  });
});
