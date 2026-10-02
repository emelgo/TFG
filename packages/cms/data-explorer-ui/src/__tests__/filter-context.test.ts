/**
 * Pruebas de la memoria de filtros por tabla en `sessionStorage`.
 */
import { describe, expect, it } from 'vitest';

import {
  isEmptySearch,
  restoreFilterContext,
  saveFilterContext,
} from '../utils/filter-context';

function memoryStorage() {
  const data = new Map<string, string>();

  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

const search = { filters: { 'name.eq': 'ana' }, page: 2 };

describe('memoria de filtros', () => {
  it('restaura la URL guardada si la actual está vacía, una sola vez', () => {
    const storage = memoryStorage();

    saveFilterContext('public', 'accounts', search, storage, 0);

    expect(restoreFilterContext('public', 'accounts', {}, storage, 10)).toEqual(
      search,
    );
    expect(restoreFilterContext('public', 'accounts', {}, storage, 10)).toBe(
      null,
    );
  });

  it('no restaura si la URL ya trae parámetros', () => {
    const storage = memoryStorage();

    saveFilterContext('public', 'accounts', search, storage, 0);

    expect(
      restoreFilterContext('public', 'accounts', { page: 1 }, storage, 10),
    ).toBeNull();
  });

  it('caduca a la hora', () => {
    const storage = memoryStorage();

    saveFilterContext('public', 'accounts', search, storage, 0);

    expect(
      restoreFilterContext('public', 'accounts', {}, storage, 61 * 60 * 1000),
    ).toBeNull();
  });

  it('borra la memoria al limpiar los filtros', () => {
    const storage = memoryStorage();

    saveFilterContext('public', 'accounts', search, storage, 0);
    saveFilterContext('public', 'accounts', {}, storage, 1);

    expect(storage.data.size).toBe(0);
  });

  it('considera vacía una URL con objetos vacíos', () => {
    expect(isEmptySearch({ filters: {} })).toBe(true);
    expect(isEmptySearch({ search: 'x' })).toBe(false);
  });
});
