import { tableMetadataInCms } from '@pymekit/cms-supabase/schema';

/**
 * A readable resource that the current user has access to
 */
export interface ReadableResource {
  schemaName: string;
  tableName: string;
  displayName: string;
  metadata: typeof tableMetadataInCms.$inferSelect;
}

/**
 * Global search result item
 */
export interface GlobalSearchResult {
  rank: number;
  title: string;
  record: Record<string, string | number | boolean | null>;
  table_name: string;
  url_params: {
    id: string;
    table: string;
    schema: string;
  };
  schema_name: string;
  primary_keys: Array<string>;
  table_display: string;
}

/**
 * Global search response
 */
export interface GlobalSearchResponse {
  results: GlobalSearchResult[];
  total: number;
  tables_count: number;
  tables_searched: number;
  query: string;
  has_more: boolean;
}
