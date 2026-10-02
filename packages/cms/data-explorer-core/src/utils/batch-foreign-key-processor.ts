import type { RelationConfig } from '@pymekit/cms-types';

import { getLookupRelations } from './relations';

export type ForeignKeyLookup = {
  schema: string;
  table: string;
  column: string;
  value: unknown;
  sourceRow: Record<string, unknown>;
  sourceColumn: string;
};

export type BatchGroup = {
  schema: string;
  table: string;
  column: string;
  values: unknown[];
  lookups: ForeignKeyLookup[];
};

export type BatchResult = {
  schema: string;
  table: string;
  column: string;
  records: Record<string, unknown>[];
};

export type FormattedRelation = {
  column: string;
  original: unknown;
  formatted: string | null | undefined;
  link: string | null | undefined;
};

/**
 * Groups foreign key lookups by target table/schema/column for efficient batch processing
 */
export function groupForeignKeyLookups(
  data: Record<string, unknown>[],
  relationsConfig: Record<string, RelationConfig> | RelationConfig[],
): BatchGroup[] {
  const lookups: ForeignKeyLookup[] = [];

  const relations = getLookupRelations(relationsConfig);

  // Collect all foreign key lookups needed
  relations.forEach((relation) => {
    data.forEach((row) => {
      const value = row[relation.source_column];

      // Skip null/undefined values
      if (value === null || value === undefined) {
        return;
      }

      lookups.push({
        schema: relation.target_schema,
        table: relation.target_table,
        column: relation.target_column,
        value,
        sourceRow: row,
        sourceColumn: relation.source_column,
      });
    });
  });

  // Group lookups by target schema/table/column
  const groups = new Map<string, BatchGroup>();

  lookups.forEach((lookup) => {
    const key = `${lookup.schema}.${lookup.table}.${lookup.column}`;

    if (!groups.has(key)) {
      groups.set(key, {
        schema: lookup.schema,
        table: lookup.table,
        column: lookup.column,
        values: [],
        lookups: [],
      });
    }

    const group = groups.get(key)!;

    // Add unique values only
    if (!group.values.includes(lookup.value)) {
      group.values.push(lookup.value);
    }

    group.lookups.push(lookup);
  });

  const result = Array.from(groups.values());

  return result;
}

/**
 * Maps batch query results back to formatted relations for display
 */
export function mapBatchResultsToRelations(
  batchResults: BatchResult[],
  batchGroups: BatchGroup[],
  relationsMetadata: Array<{
    schemaName: string;
    tableName: string;
    displayFormat?: string;
  }>,
  displayFormatter?: (
    displayFormat: string,
    record: Record<string, unknown>,
  ) => string | null | undefined,
): FormattedRelation[] {
  const formattedRelations: FormattedRelation[] = [];

  batchResults.forEach((result) => {
    // Find the corresponding batch group
    const group = batchGroups.find(
      (g) =>
        g.schema === result.schema &&
        g.table === result.table &&
        g.column === result.column,
    );

    if (!group) return;

    // Find display format for this target table
    const metadata = relationsMetadata.find(
      (m) => m.schemaName === result.schema && m.tableName === result.table,
    );

    if (!metadata?.displayFormat) return;

    // Process each lookup in this group
    group.lookups.forEach((lookup) => {
      // Find the corresponding record in the batch results
      const record = result.records.find(
        (r) => r[result.column] === lookup.value,
      );

      if (!record) return;

      const formatted =
        displayFormatter && metadata.displayFormat
          ? displayFormatter(metadata.displayFormat, record)
          : null;

      formattedRelations.push({
        column: lookup.sourceColumn,
        original: lookup.value,
        formatted,
        link: `/${result.schema}/${result.table}/record/${lookup.value}`,
      });
    });
  });

  return formattedRelations;
}

/**
 * Handles special case processing for filter-based foreign key lookups when data is empty
 */
export function processFilterBasedLookups(
  relationsConfig: Record<string, RelationConfig> | RelationConfig[],
  properties?: Record<string, string | number | boolean | string[] | null>,
): ForeignKeyLookup[] {
  if (!properties) return [];

  const lookups: ForeignKeyLookup[] = [];

  const relations = getLookupRelations(relationsConfig);

  relations.forEach((relation) => {
    Object.keys(properties).forEach((property) => {
      const [column] = property.split('.');

      if (column === relation.source_column) {
        const value = properties[property];

        if (value !== null && value !== undefined) {
          lookups.push({
            schema: relation.target_schema,
            table: relation.target_table,
            column: relation.target_column,
            value,
            sourceRow: { [relation.source_column]: value },
            sourceColumn: relation.source_column,
          });
        }
      }
    });
  });

  return lookups;
}
