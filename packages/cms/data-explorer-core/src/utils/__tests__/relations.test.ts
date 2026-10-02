import { describe, expect, it } from 'vitest';

import type { JunctionMetadata, RelationConfig } from '@pymekit/cms-types';

import {
  deriveM2MRelations,
  getInlineOneToManyRelations,
  getJunctionTargets,
  getLookupRelations,
  getOneToManyRelations,
  getRelationKey,
  hasCompositeKeyOnFk,
  isJunctionTable,
  normalizeRelationType,
  toJunctionMetadata,
} from '../relations';

describe('normalizeRelationType', () => {
  describe('Valid Type Normalization', () => {
    it('should return type when type field is present', () => {
      expect(normalizeRelationType({ type: 'one_to_many' })).toBe(
        'one_to_many',
      );
    });

    it('should return relation_type when type is missing', () => {
      expect(normalizeRelationType({ relation_type: 'many_to_one' })).toBe(
        'many_to_one',
      );
    });

    it('should prefer type over relation_type', () => {
      expect(
        normalizeRelationType({
          type: 'one_to_one',
          relation_type: 'many_to_many',
        }),
      ).toBe('one_to_one');
    });

    it('should handle all valid relation types', () => {
      expect(normalizeRelationType({ type: 'one_to_one' })).toBe('one_to_one');
      expect(normalizeRelationType({ type: 'one_to_many' })).toBe(
        'one_to_many',
      );
      expect(normalizeRelationType({ type: 'many_to_one' })).toBe(
        'many_to_one',
      );
      expect(normalizeRelationType({ type: 'many_to_many' })).toBe(
        'many_to_many',
      );
    });
  });

  describe('Invalid Input Handling', () => {
    it('should return null for empty object', () => {
      expect(normalizeRelationType({})).toBeNull();
    });

    it('should return null for invalid type values', () => {
      expect(
        normalizeRelationType({ type: 'invalid' as RelationConfig['type'] }),
      ).toBeNull();
    });

    it('should return null for null type', () => {
      expect(
        normalizeRelationType({
          type: null as unknown as RelationConfig['type'],
        }),
      ).toBeNull();
    });

    it('should return null for undefined type', () => {
      expect(normalizeRelationType({ type: undefined })).toBeNull();
    });
  });
});

describe('getLookupRelations', () => {
  const mockRelations = [
    {
      type: 'many_to_one' as const,
      source_column: 'category_id',
      target_table: 'categories',
      target_schema: 'public',
      target_column: 'id',
    },
    {
      type: 'one_to_one' as const,
      source_column: 'profile_id',
      target_table: 'profiles',
      target_schema: 'public',
      target_column: 'id',
    },
    {
      type: 'one_to_many' as const,
      source_column: 'id',
      target_table: 'orders',
      target_schema: 'public',
      target_column: 'user_id',
    },
  ];

  it('should filter only many-to-one and one-to-one relations', () => {
    const result = getLookupRelations(mockRelations);
    expect(result).toHaveLength(2);
    expect(
      result.every((r) => r.type === 'many_to_one' || r.type === 'one_to_one'),
    ).toBe(true);
  });

  it('should handle relation_type field', () => {
    const relations = [
      {
        relation_type: 'many_to_one' as const,
        source_column: 'user_id',
        target_table: 'users',
        target_schema: 'public',
        target_column: 'id',
      },
    ];
    const result = getLookupRelations(relations);
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('many_to_one');
  });

  it('should handle empty array', () => {
    expect(getLookupRelations([])).toEqual([]);
  });

  it('should handle null/undefined', () => {
    expect(getLookupRelations(null)).toEqual([]);
    expect(getLookupRelations(undefined)).toEqual([]);
  });

  it('should handle object format (keyed by column)', () => {
    const objectFormat = {
      category_id: {
        type: 'many_to_one' as const,
        source_column: 'category_id',
        target_table: 'categories',
        target_schema: 'public',
        target_column: 'id',
      },
      id_orders: {
        type: 'one_to_many' as const,
        source_column: 'id',
        target_table: 'orders',
        target_schema: 'public',
        target_column: 'user_id',
      },
    };
    const result = getLookupRelations(objectFormat);
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('many_to_one');
  });
});

describe('getOneToManyRelations', () => {
  const mockRelations = [
    {
      type: 'one_to_many' as const,
      source_column: 'id',
      target_table: 'orders',
      target_schema: 'public',
      target_column: 'user_id',
    },
    {
      type: 'many_to_one' as const,
      source_column: 'category_id',
      target_table: 'categories',
      target_schema: 'public',
      target_column: 'id',
    },
    {
      relation_type: 'one_to_many' as const,
      source_column: 'id',
      target_table: 'reviews',
      target_schema: 'public',
      target_column: 'product_id',
    },
  ];

  it('should filter only one_to_many relations', () => {
    const result = getOneToManyRelations(mockRelations);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.type === 'one_to_many')).toBe(true);
  });

  it('should handle relation_type field', () => {
    const result = getOneToManyRelations(mockRelations);
    expect(result.some((r) => r.target_table === 'reviews')).toBe(true);
  });

  it('should handle empty array', () => {
    expect(getOneToManyRelations([])).toEqual([]);
  });

  it('should handle null/undefined', () => {
    expect(getOneToManyRelations(null)).toEqual([]);
    expect(getOneToManyRelations(undefined)).toEqual([]);
  });

  it('should handle object format (keyed by column)', () => {
    const objectFormat = {
      id_orders: {
        type: 'one_to_many' as const,
        source_column: 'id',
        target_table: 'orders',
        target_schema: 'public',
        target_column: 'user_id',
      },
      category_id: {
        type: 'many_to_one' as const,
        source_column: 'category_id',
        target_table: 'categories',
        target_schema: 'public',
        target_column: 'id',
      },
    };
    const result = getOneToManyRelations(objectFormat);
    expect(result).toHaveLength(1);
    expect(result[0]?.target_table).toBe('orders');
  });
});

describe('getInlineOneToManyRelations', () => {
  it('should filter only enabled inline relations', () => {
    const relations = [
      {
        type: 'one_to_many' as const,
        source_column: 'id',
        target_table: 'orders',
        target_schema: 'public',
        target_column: 'user_id',
        inline_config: { enabled: true },
      },
      {
        type: 'one_to_many' as const,
        source_column: 'id',
        target_table: 'reviews',
        target_schema: 'public',
        target_column: 'product_id',
        inline_config: { enabled: false },
      },
      {
        type: 'one_to_many' as const,
        source_column: 'id',
        target_table: 'comments',
        target_schema: 'public',
        target_column: 'post_id',
      },
    ];
    const result = getInlineOneToManyRelations(relations);
    expect(result).toHaveLength(1);
    expect(result[0]?.target_table).toBe('orders');
  });

  it('should return empty array when no inline relations are enabled', () => {
    const relations = [
      {
        type: 'one_to_many' as const,
        source_column: 'id',
        target_table: 'orders',
        target_schema: 'public',
        target_column: 'user_id',
      },
    ];
    const result = getInlineOneToManyRelations(relations);
    expect(result).toEqual([]);
  });
});

describe('getRelationKey', () => {
  it('should generate key for standard relation', () => {
    const config: RelationConfig = {
      type: 'one_to_many',
      source_column: 'id',
      target_table: 'orders',
      target_schema: 'public',
      target_column: 'user_id',
    };
    expect(getRelationKey(config)).toBe('public.orders.user_id');
  });

  it('should generate key for M2M relation with junction table', () => {
    const m2mConfig = {
      sourceColumn: 'id',
      targetSchema: 'public',
      targetTable: 'tags',
      targetColumn: 'id',
      junctionSchema: 'public',
      junctionTable: 'post_tags',
      junctionSourceColumn: 'post_id',
      junctionTargetColumn: 'tag_id',
    };
    expect(getRelationKey(m2mConfig)).toBe('public.post_tags.public.tags');
  });
});

describe('toJunctionMetadata', () => {
  it('should extract primary keys and unique constraints', () => {
    const metadata = {
      ui_config: {
        primary_keys: [{ column_name: 'post_id' }, { column_name: 'tag_id' }],
        unique_constraints: [
          { columns: ['post_id', 'tag_id'], constraint_name: 'pk' },
        ],
      },
    };
    const result = toJunctionMetadata(metadata);
    expect(result.primaryKeys).toEqual(['post_id', 'tag_id']);
    expect(result.uniqueConstraints).toEqual([
      { columns: ['post_id', 'tag_id'] },
    ]);
  });

  it('should handle missing ui_config', () => {
    const result = toJunctionMetadata({});
    expect(result.primaryKeys).toEqual([]);
    expect(result.uniqueConstraints).toEqual([]);
  });

  it('should handle empty primary_keys array', () => {
    const result = toJunctionMetadata({
      ui_config: {
        primary_keys: [],
        unique_constraints: [],
      },
    });
    expect(result.primaryKeys).toEqual([]);
    expect(result.uniqueConstraints).toEqual([]);
  });

  it('should filter out falsy column names', () => {
    const result = toJunctionMetadata({
      ui_config: {
        primary_keys: [
          { column_name: 'valid' },
          { column_name: '' },
          { column_name: 'also_valid' },
        ],
      },
    });
    expect(result.primaryKeys).toEqual(['valid', 'also_valid']);
  });
});

describe('hasCompositeKeyOnFk', () => {
  it('should return true for PK match', () => {
    const metadata: JunctionMetadata = {
      primaryKeys: ['post_id', 'tag_id'],
      uniqueConstraints: [],
    };
    expect(hasCompositeKeyOnFk(['post_id', 'tag_id'], metadata)).toBe(true);
  });

  it('should return true for unique constraint match', () => {
    const metadata: JunctionMetadata = {
      primaryKeys: ['id'],
      uniqueConstraints: [{ columns: ['post_id', 'tag_id'] }],
    };
    expect(hasCompositeKeyOnFk(['post_id', 'tag_id'], metadata)).toBe(true);
  });

  it('should be case-insensitive', () => {
    const metadata: JunctionMetadata = {
      primaryKeys: ['Post_ID', 'Tag_ID'],
      uniqueConstraints: [],
    };
    expect(hasCompositeKeyOnFk(['post_id', 'tag_id'], metadata)).toBe(true);
  });

  it('should be order-independent', () => {
    const metadata: JunctionMetadata = {
      primaryKeys: ['tag_id', 'post_id'],
      uniqueConstraints: [],
    };
    expect(hasCompositeKeyOnFk(['post_id', 'tag_id'], metadata)).toBe(true);
  });

  it('should return false for partial match (PK has more columns)', () => {
    const metadata: JunctionMetadata = {
      primaryKeys: ['post_id', 'tag_id', 'created_at'],
      uniqueConstraints: [],
    };
    expect(hasCompositeKeyOnFk(['post_id', 'tag_id'], metadata)).toBe(false);
  });

  it('should return false for partial match (unique constraint has more columns)', () => {
    const metadata: JunctionMetadata = {
      primaryKeys: ['id'],
      uniqueConstraints: [{ columns: ['post_id', 'tag_id', 'version'] }],
    };
    expect(hasCompositeKeyOnFk(['post_id', 'tag_id'], metadata)).toBe(false);
  });

  it('should return false for single FK column', () => {
    const metadata: JunctionMetadata = {
      primaryKeys: ['post_id'],
      uniqueConstraints: [],
    };
    expect(hasCompositeKeyOnFk(['post_id'], metadata)).toBe(false);
  });

  it('should return false for three FK columns', () => {
    const metadata: JunctionMetadata = {
      primaryKeys: ['a', 'b', 'c'],
      uniqueConstraints: [],
    };
    expect(hasCompositeKeyOnFk(['a', 'b', 'c'], metadata)).toBe(false);
  });
});

describe('isJunctionTable', () => {
  it('should return true for valid junction table', () => {
    const relations: RelationConfig[] = [
      {
        type: 'many_to_one',
        source_column: 'post_id',
        target_table: 'posts',
        target_schema: 'public',
        target_column: 'id',
      },
      {
        type: 'many_to_one',
        source_column: 'tag_id',
        target_table: 'tags',
        target_schema: 'public',
        target_column: 'id',
      },
    ];
    const metadata: JunctionMetadata = {
      primaryKeys: ['post_id', 'tag_id'],
      uniqueConstraints: [],
    };
    expect(isJunctionTable(relations, metadata)).toBe(true);
  });

  it('should return false for table with one M2O relation', () => {
    const relations: RelationConfig[] = [
      {
        type: 'many_to_one',
        source_column: 'category_id',
        target_table: 'categories',
        target_schema: 'public',
        target_column: 'id',
      },
    ];
    const metadata: JunctionMetadata = {
      primaryKeys: ['id'],
      uniqueConstraints: [],
    };
    expect(isJunctionTable(relations, metadata)).toBe(false);
  });

  it('should return false for table with three M2O relations', () => {
    const relations: RelationConfig[] = [
      {
        type: 'many_to_one',
        source_column: 'a_id',
        target_table: 'a',
        target_schema: 'public',
        target_column: 'id',
      },
      {
        type: 'many_to_one',
        source_column: 'b_id',
        target_table: 'b',
        target_schema: 'public',
        target_column: 'id',
      },
      {
        type: 'many_to_one',
        source_column: 'c_id',
        target_table: 'c',
        target_schema: 'public',
        target_column: 'id',
      },
    ];
    const metadata: JunctionMetadata = {
      primaryKeys: ['a_id', 'b_id'],
      uniqueConstraints: [],
    };
    expect(isJunctionTable(relations, metadata)).toBe(false);
  });

  it('should return false when FK columns do not match composite key', () => {
    const relations: RelationConfig[] = [
      {
        type: 'many_to_one',
        source_column: 'post_id',
        target_table: 'posts',
        target_schema: 'public',
        target_column: 'id',
      },
      {
        type: 'many_to_one',
        source_column: 'tag_id',
        target_table: 'tags',
        target_schema: 'public',
        target_column: 'id',
      },
    ];
    const metadata: JunctionMetadata = {
      primaryKeys: ['id'], // Single PK, not composite
      uniqueConstraints: [],
    };
    expect(isJunctionTable(relations, metadata)).toBe(false);
  });
});

describe('getJunctionTargets', () => {
  it('should extract both target tables', () => {
    const relations: RelationConfig[] = [
      {
        type: 'many_to_one',
        source_column: 'post_id',
        target_table: 'posts',
        target_schema: 'public',
        target_column: 'id',
      },
      {
        type: 'many_to_one',
        source_column: 'tag_id',
        target_table: 'tags',
        target_schema: 'public',
        target_column: 'id',
      },
    ];
    const result = getJunctionTargets(relations);
    expect(result).toEqual({
      tableA: {
        schema: 'public',
        table: 'posts',
        column: 'id',
        fkColumn: 'post_id',
      },
      tableB: {
        schema: 'public',
        table: 'tags',
        column: 'id',
        fkColumn: 'tag_id',
      },
    });
  });

  it('should return null for empty array', () => {
    expect(getJunctionTargets([])).toBeNull();
  });

  it('should return null for single M2O relation', () => {
    const relations: RelationConfig[] = [
      {
        type: 'many_to_one',
        source_column: 'a',
        target_table: 'a',
        target_schema: 'public',
        target_column: 'id',
      },
    ];
    expect(getJunctionTargets(relations)).toBeNull();
  });

  it('should return null for three M2O relations', () => {
    const relations: RelationConfig[] = [
      {
        type: 'many_to_one',
        source_column: 'a',
        target_table: 'a',
        target_schema: 'public',
        target_column: 'id',
      },
      {
        type: 'many_to_one',
        source_column: 'b',
        target_table: 'b',
        target_schema: 'public',
        target_column: 'id',
      },
      {
        type: 'many_to_one',
        source_column: 'c',
        target_table: 'c',
        target_schema: 'public',
        target_column: 'id',
      },
    ];
    expect(getJunctionTargets(relations)).toBeNull();
  });

  it('should handle cross-schema relations', () => {
    const relations: RelationConfig[] = [
      {
        type: 'many_to_one',
        source_column: 'user_id',
        target_table: 'users',
        target_schema: 'auth',
        target_column: 'id',
      },
      {
        type: 'many_to_one',
        source_column: 'role_id',
        target_table: 'roles',
        target_schema: 'cms',
        target_column: 'id',
      },
    ];
    const result = getJunctionTargets(relations);
    expect(result?.tableA.schema).toBe('auth');
    expect(result?.tableB.schema).toBe('cms');
  });
});

describe('deriveM2MRelations', () => {
  it('should derive M2M relation from junction table', () => {
    const sourceRelations: RelationConfig[] = [
      {
        type: 'one_to_many',
        source_column: 'id',
        target_table: 'post_tags',
        target_schema: 'public',
        target_column: 'post_id',
      },
    ];

    const junctionRelations = new Map<string, RelationConfig[]>([
      [
        'public.post_tags',
        [
          {
            type: 'many_to_one',
            source_column: 'post_id',
            target_table: 'posts',
            target_schema: 'public',
            target_column: 'id',
          },
          {
            type: 'many_to_one',
            source_column: 'tag_id',
            target_table: 'tags',
            target_schema: 'public',
            target_column: 'id',
          },
        ],
      ],
    ]);

    const junctionMetadata = new Map<string, JunctionMetadata>([
      [
        'public.post_tags',
        { primaryKeys: ['post_id', 'tag_id'], uniqueConstraints: [] },
      ],
    ]);

    const result = deriveM2MRelations(
      'public',
      'posts',
      sourceRelations,
      junctionRelations,
      junctionMetadata,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      sourceColumn: 'id',
      targetSchema: 'public',
      targetTable: 'tags',
      targetColumn: 'id',
      junctionSchema: 'public',
      junctionTable: 'post_tags',
      junctionSourceColumn: 'post_id',
      junctionTargetColumn: 'tag_id',
    });
  });

  it('should skip self-referential M2M', () => {
    const sourceRelations: RelationConfig[] = [
      {
        type: 'one_to_many',
        source_column: 'id',
        target_table: 'user_follows',
        target_schema: 'public',
        target_column: 'follower_id',
      },
    ];

    const junctionRelations = new Map<string, RelationConfig[]>([
      [
        'public.user_follows',
        [
          {
            type: 'many_to_one',
            source_column: 'follower_id',
            target_table: 'users',
            target_schema: 'public',
            target_column: 'id',
          },
          {
            type: 'many_to_one',
            source_column: 'following_id',
            target_table: 'users',
            target_schema: 'public',
            target_column: 'id',
          },
        ],
      ],
    ]);

    const junctionMetadata = new Map<string, JunctionMetadata>([
      [
        'public.user_follows',
        { primaryKeys: ['follower_id', 'following_id'], uniqueConstraints: [] },
      ],
    ]);

    const result = deriveM2MRelations(
      'public',
      'users',
      sourceRelations,
      junctionRelations,
      junctionMetadata,
    );

    expect(result).toHaveLength(0);
  });

  it('should handle missing junction metadata', () => {
    const sourceRelations: RelationConfig[] = [
      {
        type: 'one_to_many',
        source_column: 'id',
        target_table: 'post_tags',
        target_schema: 'public',
        target_column: 'post_id',
      },
    ];

    const result = deriveM2MRelations(
      'public',
      'posts',
      sourceRelations,
      new Map(),
      new Map(),
    );

    expect(result).toHaveLength(0);
  });

  it('should handle missing junction relations', () => {
    const sourceRelations: RelationConfig[] = [
      {
        type: 'one_to_many',
        source_column: 'id',
        target_table: 'post_tags',
        target_schema: 'public',
        target_column: 'post_id',
      },
    ];

    const junctionMetadata = new Map<string, JunctionMetadata>([
      [
        'public.post_tags',
        { primaryKeys: ['post_id', 'tag_id'], uniqueConstraints: [] },
      ],
    ]);

    const result = deriveM2MRelations(
      'public',
      'posts',
      sourceRelations,
      new Map(),
      junctionMetadata,
    );

    expect(result).toHaveLength(0);
  });

  it('should skip non-junction tables', () => {
    const sourceRelations: RelationConfig[] = [
      {
        type: 'one_to_many',
        source_column: 'id',
        target_table: 'orders',
        target_schema: 'public',
        target_column: 'user_id',
      },
    ];

    const junctionRelations = new Map<string, RelationConfig[]>([
      [
        'public.orders',
        [
          {
            type: 'many_to_one',
            source_column: 'user_id',
            target_table: 'users',
            target_schema: 'public',
            target_column: 'id',
          },
        ],
      ],
    ]);

    const junctionMetadata = new Map<string, JunctionMetadata>([
      ['public.orders', { primaryKeys: ['id'], uniqueConstraints: [] }],
    ]);

    const result = deriveM2MRelations(
      'public',
      'users',
      sourceRelations,
      junctionRelations,
      junctionMetadata,
    );

    expect(result).toHaveLength(0);
  });

  it('should handle multiple M2M relations', () => {
    const sourceRelations: RelationConfig[] = [
      {
        type: 'one_to_many',
        source_column: 'id',
        target_table: 'post_tags',
        target_schema: 'public',
        target_column: 'post_id',
      },
      {
        type: 'one_to_many',
        source_column: 'id',
        target_table: 'post_categories',
        target_schema: 'public',
        target_column: 'post_id',
      },
    ];

    const junctionRelations = new Map<string, RelationConfig[]>([
      [
        'public.post_tags',
        [
          {
            type: 'many_to_one',
            source_column: 'post_id',
            target_table: 'posts',
            target_schema: 'public',
            target_column: 'id',
          },
          {
            type: 'many_to_one',
            source_column: 'tag_id',
            target_table: 'tags',
            target_schema: 'public',
            target_column: 'id',
          },
        ],
      ],
      [
        'public.post_categories',
        [
          {
            type: 'many_to_one',
            source_column: 'post_id',
            target_table: 'posts',
            target_schema: 'public',
            target_column: 'id',
          },
          {
            type: 'many_to_one',
            source_column: 'category_id',
            target_table: 'categories',
            target_schema: 'public',
            target_column: 'id',
          },
        ],
      ],
    ]);

    const junctionMetadata = new Map<string, JunctionMetadata>([
      [
        'public.post_tags',
        { primaryKeys: ['post_id', 'tag_id'], uniqueConstraints: [] },
      ],
      [
        'public.post_categories',
        { primaryKeys: ['post_id', 'category_id'], uniqueConstraints: [] },
      ],
    ]);

    const result = deriveM2MRelations(
      'public',
      'posts',
      sourceRelations,
      junctionRelations,
      junctionMetadata,
    );

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.targetTable).sort()).toEqual([
      'categories',
      'tags',
    ]);
  });
});
