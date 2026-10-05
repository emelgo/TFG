/**
 * Pruebas del filtro de tablas navegables: los esquemas protegidos (como
 * `auth`) no se ofrecen en la navegación aunque tengan metadatos.
 */
import { describe, expect, it } from 'vitest';

import { excludeProtectedResources } from '../api/utils/browsable-resources';

describe('excludeProtectedResources', () => {
  it('quita auth.users y otros esquemas protegidos y conserva el orden', () => {
    const resources = [
      { schemaName: 'public', tableName: 'accounts' },
      { schemaName: 'auth', tableName: 'users' },
      { schemaName: 'public', tableName: 'blog_posts' },
      { schemaName: 'storage', tableName: 'objects' },
      { schemaName: 'cms', tableName: 'table_metadata' },
      { schemaName: 'pg_catalog', tableName: 'pg_class' },
    ];

    expect(excludeProtectedResources(resources)).toEqual([
      { schemaName: 'public', tableName: 'accounts' },
      { schemaName: 'public', tableName: 'blog_posts' },
    ]);
  });

  it('no distingue mayúsculas ni espacios en el nombre del esquema', () => {
    expect(
      excludeProtectedResources([{ schemaName: ' Auth ', tableName: 'users' }]),
    ).toEqual([]);
  });
});
