import { sql } from 'drizzle-orm';

import type { DrizzleSupabaseClient } from '@pymekit/cms-supabase/client';

import type { GlobalSearchResponse } from '../../types';

type Client = DrizzleSupabaseClient;

/**
 * Create a new GlobalSearchService
 * @returns A new GlobalSearchService
 */
export function createGlobalSearchService(client: Client) {
  return new GlobalSearchService(client);
}

/**
 * A service for searching the database
 */
class GlobalSearchService {
  constructor(private readonly client: Client) {}

  /**
   * Search for a table, column, or row in the database
   * @param query - The query to search for
   * @param limit - The number of results to return
   * @param offset - The number of results to skip
   * @returns The results of the search
   */
  async searchGlobal(params: {
    query: string;
    limit?: number;
    offset?: number;
  }): Promise<GlobalSearchResponse> {
    const { query, limit = 20, offset = 0 } = params;

    return this.client.runTransaction(async (tx) => {
      return tx
        .execute(sql`select cms.global_search(${query}, ${limit}, ${offset})`)
        .then((res) => res[0]?.['global_search'] as GlobalSearchResponse);
    });
  }
}
