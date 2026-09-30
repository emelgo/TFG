/**
 * Servicio de la búsqueda global del CMS.
 *
 * Llama a `cms.global_search` con el cliente Drizzle de la petición: la
 * función se ejecuta con los *claims* del usuario, comprueba su acceso al CMS
 * y solo busca en tablas no protegidas sobre las que tiene permiso `select`
 * (ver `48-cms-global-search.sql`). El texto, el límite y el desplazamiento
 * viajan como parámetros enlazados, nunca dentro del texto SQL.
 *
 * El tiempo máximo lo fija este servicio y no la función SQL: PostgreSQL arma
 * el temporizador de `statement_timeout` al empezar cada sentencia, así que
 * un `SET LOCAL` dentro de la función no afectaba a la búsqueda en curso (y,
 * si fallaba, se quedaba activo en la transacción). Aquí se fija con
 * `set_config(..., true)` en la misma transacción, en una sentencia anterior
 * a la búsqueda: se aplica a ella y desaparece al terminar la transacción,
 * sin afectar a otras peticiones que reutilicen la conexión del *pool*.
 *
 * [TFG] RF-09 · RNF-02 (bitácora B-32).
 */
import { sql } from 'drizzle-orm';

import type { DrizzleSupabaseClient } from '@pymekit/cms-supabase/client';

import type { GlobalSearchResponse } from '../../types';
import {
  GLOBAL_SEARCH_STATEMENT_TIMEOUT_MS,
  toGlobalSearchResponse,
} from '../utils/global-search';

/** Crea el servicio de búsqueda global. */
export function createGlobalSearchService(client: DrizzleSupabaseClient) {
  return new GlobalSearchService(client);
}

class GlobalSearchService {
  constructor(private readonly client: DrizzleSupabaseClient) {}

  /**
   * Busca un texto en las tablas legibles y devuelve los resultados
   * recortados (título, tabla y clave primaria).
   *
   * @throws Error si la búsqueda falla o supera el tiempo máximo (la ruta
   *   responde con un código estable).
   */
  async searchGlobal(params: {
    query: string;
    limit?: number;
    offset?: number;
  }) {
    const { query, limit = 10, offset = 0 } = params;

    const response = await this.client.runTransaction(async (tx) => {
      // Límite local a la transacción (`true`), en su propia sentencia para
      // que el temporizador de la búsqueda ya lo use al empezar.
      await tx.execute(
        sql`select set_config('statement_timeout', ${`${GLOBAL_SEARCH_STATEMENT_TIMEOUT_MS}ms`}, true)`,
      );

      const rows = await tx.execute(
        sql`select cms.global_search(${query}, ${limit}::int, ${offset}::int) as global_search`,
      );

      return rows[0]?.['global_search'] as GlobalSearchResponse | undefined;
    });

    return toGlobalSearchResponse(response);
  }
}
