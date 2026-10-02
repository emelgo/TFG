/**
 * Pruebas de la comprobación de que unas condiciones identifican un único
 * registro (clave primaria o restricción `unique` completas).
 */
import { describe, expect, it } from 'vitest';

import { conditionsIdentifyOneRecord } from '../record-identity';

const accounts = {
  primary_keys: [{ column_name: 'id' }],
  unique_constraints: [{ constraint_name: 'slug_key', columns: ['slug'] }],
};

const memberships = {
  primary_keys: [{ column_name: 'user_id' }, { column_name: 'account_id' }],
  unique_constraints: [],
};

describe('conditionsIdentifyOneRecord', () => {
  it('acepta la clave primaria o una restricción única', () => {
    expect(conditionsIdentifyOneRecord(['id'], accounts)).toBe(true);
    expect(conditionsIdentifyOneRecord(['slug'], accounts)).toBe(true);
    expect(
      conditionsIdentifyOneRecord(['account_id', 'user_id'], memberships),
    ).toBe(true);
  });

  it('acepta columnas de más si incluyen la clave', () => {
    expect(conditionsIdentifyOneRecord(['id', 'name'], accounts)).toBe(true);
  });

  it('rechaza columnas que no son clave o claves incompletas', () => {
    expect(conditionsIdentifyOneRecord(['name'], accounts)).toBe(false);
    expect(conditionsIdentifyOneRecord(['user_id'], memberships)).toBe(false);
    expect(conditionsIdentifyOneRecord([], accounts)).toBe(false);
  });

  it('sin claves en el metadato nada identifica un registro', () => {
    expect(conditionsIdentifyOneRecord(['id'], {})).toBe(false);
    expect(conditionsIdentifyOneRecord(['id'], null)).toBe(false);
  });
});
