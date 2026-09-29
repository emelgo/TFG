/**
 * Pruebas de las operaciones puras sobre la lista de filtros.
 */
import { describe, expect, it } from 'vitest';

import {
  addFilter,
  createFilterItem,
  getSortableColumns,
  hasValidValue,
  removeFilter,
  updateFilter,
  updateFilterValue,
} from '../utils/filter-state';
import { makeColumn } from './fixtures';

const name = makeColumn('name', 'text');
const email = makeColumn('email', 'text', { is_sortable: false });

describe('hasValidValue', () => {
  it('rechaza nulos y cadenas vacías', () => {
    const filter = createFilterItem(name, []);

    expect(hasValidValue(filter)).toBe(false);
    expect(
      hasValidValue({ ...filter, values: [{ operator: 'eq', value: '  ' }] }),
    ).toBe(false);
  });

  it('acepta false y 0 como valores', () => {
    const filter = createFilterItem(name, []);

    expect(
      hasValidValue({ ...filter, values: [{ operator: 'eq', value: false }] }),
    ).toBe(true);
    expect(
      hasValidValue({ ...filter, values: [{ operator: 'eq', value: 0 }] }),
    ).toBe(true);
  });
});

describe('operaciones sobre la lista', () => {
  it('no duplica un filtro al añadirlo dos veces', () => {
    const once = addFilter([], name, []);

    expect(addFilter(once, name, [])).toBe(once);
  });

  it('añade las relaciones de la columna al crear el filtro', () => {
    const relation = {
      type: 'many_to_one' as const,
      source_column: 'name',
      target_column: 'id',
      target_table: 'users',
      target_schema: 'public',
    };

    expect(createFilterItem(name, [relation]).relations).toEqual([relation]);
  });

  it('actualiza, sustituye y quita filtros sin mutar la lista', () => {
    const filters = addFilter(addFilter([], name, []), email, []);

    const updated = updateFilterValue(filters, name, {
      operator: 'contains',
      value: 'ana',
    });

    expect(updated[0]?.values[0]?.value).toBe('ana');
    expect(filters[0]?.values[0]?.value).toBeNull();

    const replaced = updateFilter(updated, {
      ...updated[1]!,
      values: [{ operator: 'neq', value: 'x' }],
    });

    expect(replaced[1]?.values[0]?.operator).toBe('neq');
    expect(removeFilter(replaced, 'name').map((f) => f.name)).toEqual([
      'email',
    ]);
  });

  it('solo devuelve las columnas ordenables', () => {
    expect(getSortableColumns([name, email]).map((c) => c.name)).toEqual([
      'name',
    ]);
  });
});
