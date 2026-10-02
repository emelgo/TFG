/**
 * Pruebas del recorte de la respuesta de la búsqueda global y de los
 * límites de sus parámetros.
 */
import { describe, expect, it } from 'vitest';

import {
  GlobalSearchQuerySchema,
  toGlobalSearchResponse,
} from '../api/utils/global-search';
import type { GlobalSearchResponse } from '../types';

function response(
  results: GlobalSearchResponse['results'],
  extra: Partial<GlobalSearchResponse> = {},
): GlobalSearchResponse {
  return {
    results,
    total: results.length,
    tables_count: 1,
    tables_searched: 1,
    query: 'ana',
    has_more: false,
    ...extra,
  };
}

const accountResult = {
  rank: 50,
  title: 'Ana',
  record: { id: 'a1', name: 'Ana', email: 'ana@example.com', secret: 'x' },
  table_name: 'accounts',
  url_params: { id: 'a1', table: 'accounts', schema: 'public' },
  schema_name: 'public',
  primary_keys: ['id'],
  table_display: 'Accounts',
};

describe('toGlobalSearchResponse', () => {
  it('conserva solo el título, la tabla y la clave (sin la fila)', () => {
    const { results } = toGlobalSearchResponse(response([accountResult]));

    expect(results).toEqual([
      {
        schemaName: 'public',
        tableName: 'accounts',
        tableDisplay: 'Accounts',
        title: 'Ana',
        keys: { id: 'a1' },
      },
    ]);
    expect(JSON.stringify(results)).not.toContain('ana@example.com');
  });

  it('admite claves compuestas y omite resultados sin clave completa', () => {
    const { results } = toGlobalSearchResponse(
      response([
        {
          ...accountResult,
          table_name: 'accounts_memberships',
          record: { user_id: 'u1', account_id: 7 },
          primary_keys: ['user_id', 'account_id'],
        },
        {
          ...accountResult,
          record: { name: 'Sin clave' },
        },
      ]),
    );

    expect(results).toHaveLength(1);
    expect(results[0]!.keys).toEqual({ user_id: 'u1', account_id: '7' });
  });

  it('ignora las columnas de clave repetidas', () => {
    const { results } = toGlobalSearchResponse(
      response([{ ...accountResult, primary_keys: ['id', 'id'] }]),
    );

    expect(results[0]!.keys).toEqual({ id: 'a1' });
  });

  it('lanza si la función SQL informa de un error', () => {
    expect(() =>
      toGlobalSearchResponse(response([], { error: 'search_failed' })),
    ).toThrow();
  });

  it('una respuesta vacía no tiene resultados', () => {
    expect(toGlobalSearchResponse(undefined)).toEqual({
      results: [],
      hasMore: false,
    });
  });
});

describe('GlobalSearchQuerySchema', () => {
  it('acepta un texto normal y recorta espacios', () => {
    expect(GlobalSearchQuerySchema.parse({ query: '  ana ' }).query).toBe(
      'ana',
    );
  });

  it.each([
    { query: 'a' },
    { query: 'x'.repeat(101) },
    { query: 'ana', limit: '21' },
    { query: 'ana', offset: '-1' },
  ])('rechaza %o', (query) => {
    expect(GlobalSearchQuerySchema.safeParse(query).success).toBe(false);
  });
});
