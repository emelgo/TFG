/**
 * Pruebas de la configuración y validación del campo de texto de un filtro
 * y de la validación de los filtros JSON.
 */
import { describe, expect, it } from 'vitest';

import {
  getFilterInputConfig,
  isValidFilterInput,
} from '../utils/filter-input';
import { validateJsonFilterValue } from '../utils/json-filter';
import { makeColumn } from './fixtures';

const filterOf = (dataType: string, uiDataType?: string) => ({
  ...makeColumn('col', dataType, {
    ui_config: {
      data_type: dataType as 'text',
      ui_data_type: uiDataType,
    },
  }),
  values: [],
});

describe('getFilterInputConfig', () => {
  it('elige el tipo de campo según la columna', () => {
    expect(getFilterInputConfig(filterOf('integer')).type).toBe('number');
    expect(getFilterInputConfig(filterOf('text', 'email')).type).toBe('email');
    expect(getFilterInputConfig(filterOf('uuid')).kind).toBe('uuid');
    expect(getFilterInputConfig(filterOf('text')).kind).toBe('text');
  });
});

describe('isValidFilterInput', () => {
  it('valida el formato de números, correos y UUID', () => {
    const number = getFilterInputConfig(filterOf('integer'));
    const email = getFilterInputConfig(filterOf('text', 'email'));
    const uuid = getFilterInputConfig(filterOf('uuid'));

    expect(isValidFilterInput('42', number, 'eq')).toBe(true);
    expect(isValidFilterInput('abc', number, 'eq')).toBe(false);
    expect(isValidFilterInput('ana@pyme.es', email, 'eq')).toBe(true);
    expect(isValidFilterInput('ana', email, 'eq')).toBe(false);
    expect(
      isValidFilterInput('123e4567-e89b-12d3-a456-426614174000', uuid, 'eq'),
    ).toBe(true);
    expect(isValidFilterInput('123', uuid, 'eq')).toBe(false);
  });

  it('no valida el formato en las coincidencias parciales', () => {
    const email = getFilterInputConfig(filterOf('text', 'email'));

    expect(isValidFilterInput('@pyme', email, 'contains')).toBe(true);
  });
});

describe('validateJsonFilterValue', () => {
  it('exige el formato de cada modo', () => {
    expect(validateJsonFilterValue('containsText', ' ')).toBe(
      'filters.jsonErrors.emptyValue',
    );
    expect(validateJsonFilterValue('keyEquals', 'status')).toBe(
      'filters.jsonErrors.missingColon',
    );
    expect(validateJsonFilterValue('keyEquals', 'status:active')).toBeNull();
    expect(validateJsonFilterValue('pathExists', 'user.name')).toBe(
      'filters.jsonErrors.invalidPath',
    );
    expect(validateJsonFilterValue('pathExists', '$.user.name')).toBeNull();
    expect(validateJsonFilterValue('hasKey', '1abc')).toBe(
      'filters.jsonErrors.invalidKey',
    );
  });
});
