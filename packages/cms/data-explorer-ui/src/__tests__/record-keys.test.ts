/**
 * Pruebas de la columna que identifica un registro en `.../record/$id`: debe
 * coincidir con la que usa `buildResourceUrl` al generar el enlace.
 */
import { describe, expect, it } from 'vitest';

import { buildResourceUrl } from '../utils/build-resource-url';
import {
  resolveSingleKeyColumn,
  toTableKeysConfig,
} from '../utils/record-keys';

describe('resolveSingleKeyColumn', () => {
  it('usa la clave primaria de una columna (aunque venga repetida)', () => {
    expect(
      resolveSingleKeyColumn({
        primary_keys: [{ column_name: 'id' }, { column_name: 'id' }],
      }),
    ).toBe('id');

    expect(
      resolveSingleKeyColumn({ primary_keys: [{ column_name: 'name' }] }),
    ).toBe('name');
  });

  it('sin clave primaria usa la primera restricción unique de una columna', () => {
    expect(
      resolveSingleKeyColumn({
        primary_keys: [],
        unique_constraints: [
          { constraint_name: 'a_b', columns: ['a', 'b'] },
          { constraint_name: 'email', columns: ['email'] },
        ],
      }),
    ).toBe('email');
  });

  it('recurre a `id` si no hay metadato útil', () => {
    expect(resolveSingleKeyColumn(null)).toBe('id');
    expect(resolveSingleKeyColumn({ primary_keys: 'x' })).toBe('id');
  });

  it('coincide con la columna que usa `buildResourceUrl`', () => {
    const uiConfig = {
      primary_keys: [],
      unique_constraints: [{ constraint_name: 'slug', columns: ['slug'] }],
    };

    const href = buildResourceUrl({
      schema: 'public',
      table: 'pages',
      record: { slug: 'home' },
      tableMetadata: toTableKeysConfig(uiConfig),
    });

    expect(href).toBe('/admin/cms/resources/public/pages/record/home');
    expect(resolveSingleKeyColumn(uiConfig)).toBe('slug');
  });
});

describe('toTableKeysConfig', () => {
  it('normaliza un ui_config incompleto', () => {
    expect(
      toTableKeysConfig({ unique_constraints: [{ columns: ['a'] }] }),
    ).toEqual({
      primary_keys: [],
      unique_constraints: [{ constraint_name: '', columns: ['a'] }],
    });
  });
});
