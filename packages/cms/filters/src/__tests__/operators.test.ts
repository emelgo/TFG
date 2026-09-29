/**
 * Pruebas de los operadores disponibles por tipo y de la traducción de los
 * operadores de fecha.
 */
import { describe, expect, it } from 'vitest';

import {
  getOperatorsForDataType,
  mapDateOperator,
  mapSqlToDateOperator,
} from '../utils/operators';

describe('getOperatorsForDataType', () => {
  it('ofrece «contiene» para texto pero no para números', () => {
    expect(getOperatorsForDataType('text')).toContain('contains');
    expect(getOperatorsForDataType('integer')).not.toContain('contains');
  });

  it('limita los enumerados a igualdad y nulos', () => {
    expect(getOperatorsForDataType('text', true)).toEqual([
      'eq',
      'neq',
      'isNull',
      'notNull',
    ]);
  });

  it('usa los operadores por defecto para tipos desconocidos', () => {
    expect(getOperatorsForDataType('inet')).toEqual([
      'eq',
      'neq',
      'isNull',
      'notNull',
    ]);
  });
});

describe('operadores de fecha', () => {
  it('traduce de la interfaz a SQL y vuelta', () => {
    for (const op of ['before', 'beforeOrOn', 'after', 'afterOrOn']) {
      expect(mapSqlToDateOperator(mapDateOperator(op), 'date')).toBe(op);
    }
  });

  it('no toca los operadores de columnas que no son fecha', () => {
    expect(mapSqlToDateOperator('lt', 'integer')).toBe('lt');
  });
});
