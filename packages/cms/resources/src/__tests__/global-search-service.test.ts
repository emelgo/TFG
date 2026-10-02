/**
 * Pruebas del servicio de la búsqueda global: el tiempo máximo se fija en la
 * transacción de la API, en una sentencia anterior a la llamada a
 * `cms.global_search` (endurecimiento F2.6, bitácora B-32).
 *
 * Se sustituye el cliente Drizzle por uno falso que registra el SQL de cada
 * sentencia (renderizado con el dialecto de PostgreSQL), así que no hace
 * falta base de datos. Que PostgreSQL cancele de verdad la búsqueda con ese
 * límite lo demuestra `cms-hardening-f26.test.sql`.
 */
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import type { DrizzleSupabaseClient } from '@pymekit/cms-supabase/client';

import { createGlobalSearchService } from '../api/services/global-search.service';
import { GLOBAL_SEARCH_STATEMENT_TIMEOUT_MS } from '../api/utils/global-search';

const dialect = new PgDialect();

function createFakeClient() {
  const statements: Array<{ sql: string; params: unknown[] }> = [];

  const tx = {
    execute: async (query: SQL) => {
      statements.push(dialect.sqlToQuery(query));

      return statements.length === 1
        ? []
        : [{ global_search: { results: [], total: 0, has_more: false } }];
    },
  };

  const client = {
    runTransaction: async (fn: (transaction: typeof tx) => unknown) => fn(tx),
  } as unknown as DrizzleSupabaseClient;

  return { client, statements };
}

describe('GlobalSearchService', () => {
  it('fija statement_timeout en la transacción antes de buscar', async () => {
    const { client, statements } = createFakeClient();

    await createGlobalSearchService(client).searchGlobal({ query: 'ana' });

    expect(statements).toHaveLength(2);

    const [timeout, search] = statements;

    // Local a la transacción (`true`): no se queda en la conexión del *pool*.
    expect(timeout?.sql).toBe(
      "select set_config('statement_timeout', $1, true)",
    );
    expect(timeout?.params).toEqual([
      `${GLOBAL_SEARCH_STATEMENT_TIMEOUT_MS}ms`,
    ]);

    // La búsqueda va en una sentencia posterior, para que su temporizador
    // arranque ya con el límite.
    expect(search?.sql).toContain('cms.global_search(');
    expect(search?.params).toEqual(['ana', 10, 0]);
  });

  it('usa un límite finito y menor que el tope de la función (15 s)', () => {
    expect(GLOBAL_SEARCH_STATEMENT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(GLOBAL_SEARCH_STATEMENT_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
  });
});
