import type {
  JunctionMetadata,
  M2MRelationConfig,
  RelationConfig,
} from '@pymekit/cms-types';

type RelationType = RelationConfig['type'];

type RawRelationConfig = Partial<RelationConfig> & {
  relation_type?: RelationType;
};

const VALID_RELATION_TYPES: RelationType[] = [
  'one_to_one',
  'one_to_many',
  'many_to_one',
  'many_to_many',
];

/**
 * Normalize relation type from raw config.
 * Handles both `type` and `relation_type` fields (database uses relation_type).
 * Returns null for invalid or missing types.
 */
export function normalizeRelationType(
  candidate: RawRelationConfig,
): RelationType | null {
  const type = candidate.type ?? candidate.relation_type ?? null;

  if (!type) {
    return null;
  }

  return VALID_RELATION_TYPES.includes(type as RelationType)
    ? (type as RelationType)
    : null;
}

/**
 * Normalize relation metadata and return only relations that represent lookups
 * stored on the source record (many-to-one or one-to-one).
 */
export function getLookupRelations(relationsConfig: unknown): RelationConfig[] {
  const relationsArray = normalizeRelationsArray(relationsConfig);

  return relationsArray
    .map((relation) => {
      if (!relation || typeof relation !== 'object') {
        return null;
      }

      const candidate = relation as RawRelationConfig;
      const relationType = normalizeRelationType(candidate);

      if (relationType !== 'many_to_one' && relationType !== 'one_to_one') {
        return null;
      }

      return {
        ...candidate,
        type: relationType,
      } as RelationConfig;
    })
    .filter((relation): relation is RelationConfig => relation !== null);
}

/**
 * Get all one-to-many relations from the relations config.
 * These represent child records that reference the source table.
 */
export function getOneToManyRelations(
  relationsConfig: unknown,
): RelationConfig[] {
  const relationsArray = normalizeRelationsArray(relationsConfig);

  return relationsArray
    .map((relation) => {
      if (!relation || typeof relation !== 'object') {
        return null;
      }

      const candidate = relation as RawRelationConfig;
      const relationType = normalizeRelationType(candidate);

      if (relationType !== 'one_to_many') {
        return null;
      }

      return {
        ...candidate,
        type: relationType,
      } as RelationConfig;
    })
    .filter((relation): relation is RelationConfig => relation !== null);
}

/**
 * Get only inline-enabled one-to-many relations.
 * These are O2M relations with inline_config.enabled === true.
 */
export function getInlineOneToManyRelations(
  relationsConfig: unknown,
): RelationConfig[] {
  return getOneToManyRelations(relationsConfig).filter(
    (relation) => relation.inline_config?.enabled === true,
  );
}

/**
 * Generate a unique key for a relation.
 * For standard relations: schema.table.column
 * For M2M relations: junctionSchema.junctionTable.targetSchema.targetTable
 */
export function getRelationKey(
  config: RelationConfig | M2MRelationConfig,
): string {
  if ('junctionTable' in config) {
    return `${config.junctionSchema}.${config.junctionTable}.${config.targetSchema}.${config.targetTable}`;
  }

  return `${config.target_schema}.${config.target_table}.${config.target_column}`;
}

/**
 * Convert table metadata ui_config to JunctionMetadata format.
 * Extracts primary keys and unique constraints for junction table validation.
 */
export function toJunctionMetadata(tableMetadata: {
  ui_config?: {
    primary_keys?: Array<{ column_name: string }>;
    unique_constraints?: Array<{ columns: string[] }>;
  };
}): JunctionMetadata {
  const ui = tableMetadata.ui_config;

  return {
    primaryKeys:
      ui?.primary_keys?.map((pk) => pk.column_name).filter(Boolean) ?? [],
    uniqueConstraints:
      ui?.unique_constraints?.map((uc) => ({
        columns: uc.columns ?? [],
      })) ?? [],
  };
}

/**
 * Check if FK columns form a composite key (PK or unique constraint) on the junction table.
 * Case-insensitive comparison and order-independent.
 */
export function hasCompositeKeyOnFk(
  fkColumns: string[],
  metadata: JunctionMetadata,
): boolean {
  if (fkColumns.length !== 2) {
    return false;
  }

  const normalized = fkColumns.map((col) => col.toLowerCase()).sort();

  // Check if exactly matches primary key (must be exactly 2 columns)
  if (metadata.primaryKeys.length === 2) {
    const pkNormalized = metadata.primaryKeys
      .map((col) => col.toLowerCase())
      .sort();

    if (pkNormalized.join(',') === normalized.join(',')) {
      return true;
    }
  }

  // Check unique constraints
  return metadata.uniqueConstraints.some((constraint) => {
    if (constraint.columns.length !== 2) {
      return false;
    }

    const constraintColumns = constraint.columns
      .map((col) => col.toLowerCase())
      .sort();

    return constraintColumns.join(',') === normalized.join(',');
  });
}

/**
 * Determine if a table is a junction table for M2M relationships.
 * A junction table has exactly 2 many-to-one relations and a composite key on those FKs.
 */
export function isJunctionTable(
  relationsConfig: RelationConfig[],
  metadata: JunctionMetadata,
): boolean {
  const manyToOne = relationsConfig.filter((relation) => {
    const relationType = normalizeRelationType(relation as RawRelationConfig);
    return relationType === 'many_to_one';
  });

  if (manyToOne.length !== 2) {
    return false;
  }

  const fkColumns = manyToOne.map((relation) => relation.source_column);
  return hasCompositeKeyOnFk(fkColumns, metadata);
}

/**
 * Extract the two target tables from a junction table's many-to-one relations.
 * Returns null if the relations don't represent a valid junction pattern.
 */
export function getJunctionTargets(relationsConfig: RelationConfig[]): {
  tableA: { schema: string; table: string; column: string; fkColumn: string };
  tableB: { schema: string; table: string; column: string; fkColumn: string };
} | null {
  const manyToOne = relationsConfig.filter((relation) => {
    const relationType = normalizeRelationType(relation as RawRelationConfig);
    return relationType === 'many_to_one';
  });

  if (manyToOne.length !== 2) {
    return null;
  }

  const first = manyToOne[0];
  const second = manyToOne[1];

  if (!first || !second) {
    return null;
  }

  return {
    tableA: {
      schema: first.target_schema,
      table: first.target_table,
      column: first.target_column,
      fkColumn: first.source_column,
    },
    tableB: {
      schema: second.target_schema,
      table: second.target_table,
      column: second.target_column,
      fkColumn: second.source_column,
    },
  };
}

/**
 * Derive M2M relations from source table's O2M relations and junction table metadata.
 * Skips self-referential M2M relations (both targets point to the same table).
 */
export function deriveM2MRelations(
  sourceSchema: string,
  sourceTable: string,
  sourceRelations: RelationConfig[],
  junctionRelationsMap: Map<string, RelationConfig[]>,
  junctionMetadataMap: Map<string, JunctionMetadata>,
): M2MRelationConfig[] {
  const m2mRelations: M2MRelationConfig[] = [];
  const oneToManyRelations = getOneToManyRelations(sourceRelations);

  for (const rel of oneToManyRelations) {
    const junctionKey = `${rel.target_schema}.${rel.target_table}`;
    const junctionRelations = junctionRelationsMap.get(junctionKey);
    const junctionMetadata = junctionMetadataMap.get(junctionKey);

    // Skip if junction metadata is missing (strict correctness)
    if (!junctionRelations || !junctionMetadata) {
      continue;
    }

    // Validate this is actually a junction table
    if (!isJunctionTable(junctionRelations, junctionMetadata)) {
      continue;
    }

    const targets = getJunctionTargets(junctionRelations);
    if (!targets) {
      continue;
    }

    // Find which target corresponds to our source table
    const sourceTarget = isSameTable(targets.tableA, sourceSchema, sourceTable)
      ? targets.tableA
      : isSameTable(targets.tableB, sourceSchema, sourceTable)
        ? targets.tableB
        : null;

    if (!sourceTarget) {
      continue;
    }

    // The other target is what we're related to via M2M
    const otherTarget =
      sourceTarget === targets.tableA ? targets.tableB : targets.tableA;

    // Skip self-referential M2M (v2 feature)
    if (isSameTable(otherTarget, sourceSchema, sourceTable)) {
      continue;
    }

    m2mRelations.push({
      sourceColumn: rel.source_column,
      targetSchema: otherTarget.schema,
      targetTable: otherTarget.table,
      targetColumn: otherTarget.column,
      junctionSchema: rel.target_schema,
      junctionTable: rel.target_table,
      junctionSourceColumn: sourceTarget.fkColumn,
      junctionTargetColumn: otherTarget.fkColumn,
    });
  }

  return m2mRelations;
}

/**
 * Format a table name for display by converting snake_case to Title Case.
 * Example: "blog_post_tags" -> "Blog Post Tags"
 */
export function formatTableName(tableName: string): string {
  return tableName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

// --- Internal helpers ---

/**
 * Normalize relations config input to an array.
 * Handles arrays, objects (keyed by column), and null/undefined.
 */
function normalizeRelationsArray(relationsConfig: unknown): unknown[] {
  if (Array.isArray(relationsConfig)) {
    return relationsConfig;
  }

  if (relationsConfig && typeof relationsConfig === 'object') {
    return Object.values(relationsConfig as Record<string, unknown>);
  }

  return [];
}

/**
 * Helper to compare table identifiers.
 */
function isSameTable(
  target: { schema: string; table: string },
  schema: string,
  table: string,
): boolean {
  return target.schema === schema && target.table === table;
}
