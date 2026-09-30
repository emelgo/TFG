/**
 * Servicio de la búsqueda global del CMS.
 *
 * Llama a `cms.global_search` con el cliente Drizzle de la petición: la
 * función se ejecuta con los *claims* del usuario, comprueba su acceso al CMS
 * y solo busca en tablas no protegidas sobre las que tiene permiso `select`
 * (ver `48-cms-global-search.sql`). El texto, el límite y el desplazamiento
 * viajan como parámetros enlazados, nunca dentro del texto SQL.
 *
 * [TFG] RF-09 · RNF-02.
 */
import { sql } from 'drizzle-orm';

import type { DrizzleSupabaseClient } from '@pymekit/cms-supabase/client';

import type { GlobalSearchResponse } from '../../types';
import { toGlobalSearchResponse } from '../utils/global-search';

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
   * @throws Error si la búsqueda falla (la ruta responde con un código estable).
   */
  async searchGlobal(params: {
    query: string;
    limit?: number;
    offset?: number;
  }) {
    const { query, limit = 10, offset = 0 } = params;

    const response = await this.client.runTransaction(async (tx) => {
      const rows = await tx.execute(
        sql`select cms.global_search(${query}, ${limit}::int, ${offset}::int) as global_search`,
      );

      return rows[0]?.['global_search'] as GlobalSearchResponse | undefined;
    });

    return toGlobalSearchResponse(response);
  }
}
