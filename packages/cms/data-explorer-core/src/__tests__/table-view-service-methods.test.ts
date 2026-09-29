import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ColumnMetadata } from '@pymekit/cms-types';

import { createTableViewService } from '../services/table-view-service';

// Mock the dependencies
vi.mock('@pymekit/cms-supabase/client', () => ({
  getDrizzleSupabaseAdminClient: vi.fn().mockReturnValue({
    execute: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('../services/table-metadata-service', () => ({
  createTableMetadataService: vi.fn().mockReturnValue({
    getTableMetadata: vi.fn().mockResolvedValue({
      table: { id: 'test', relationsConfig: {} },
      columns: [],
    }),
  }),
}));

vi.mock('../services/table-query-service', () => ({
  createTableQueryService: vi.fn().mockReturnValue({
    queryTableData: vi.fn().mockResolvedValue({
      data: [],
      totalCount: 0,
      pageCount: 0,
    }),
  }),
}));

describe('TableViewService - Extracted Methods', () => {
  let service: any;
  let mockContext: any;

  const mockColumns: ColumnMetadata[] = [
    {
      name: 'id',
      ui_config: { data_type: 'integer' },
      is_nullable: false,
      is_primary_key: true,
      is_unique: true,
      is_searchable: false,
      is_sortable: true,
      is_filterable: true,
    },
    {
      name: 'name',
      ui_config: { data_type: 'text' },
      is_nullable: false,
      is_primary_key: false,
      is_unique: false,
      is_searchable: true,
      is_sortable: true,
      is_filterable: true,
    },
    {
      name: 'email',
      ui_config: { data_type: 'text' },
      is_nullable: true,
      is_primary_key: false,
      is_unique: true,
      is_searchable: true,
      is_sortable: true,
      is_filterable: true,
    },
  ];

  beforeEach(() => {
    // Mock the drizzle client that will be returned by context.get('drizzle')
    const mockDrizzleClient = {
      runTransaction: vi.fn(),
    };

    mockContext = {
      headers: {},
      supabaseUrl: '',
      supabaseAnonKey: '',
      get: vi.fn((key: string) => {
        if (key === 'drizzle') {
          return mockDrizzleClient;
        }
        return undefined;
      }),
    };
    service = createTableViewService(mockContext);
  });

  describe('processFilterConditions', () => {
    it('should return empty array when no properties provided', async () => {
      const result = await service.processFilterConditions(
        undefined,
        mockColumns,
      );
      expect(result).toEqual([]);
    });

    it('should return empty array when properties is empty', async () => {
      const result = await service.processFilterConditions({}, mockColumns);
      expect(result).toEqual([]);
    });

    it('should process valid filter properties correctly', async () => {
      const properties = {
        'name.equals': 'test',
        'id.equals': 5,
      };

      const result = await service.processFilterConditions(
        properties,
        mockColumns,
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        column: 'name',
        operator: 'eq',
        value: 'test',
      });
      expect(result[1]).toEqual({
        column: 'id',
        operator: 'eq',
        value: 5,
      });
    });

    it('should handle null operator special case', async () => {
      const properties = {
        'email.isNull': 'true',
        'name.notNull': 'true',
      };

      const result = await service.processFilterConditions(
        properties,
        mockColumns,
      );

      expect(result).toHaveLength(2);
      expect(result.find((f) => f.operator === 'isNull')?.value).toBe(true);
      expect(result.find((f) => f.operator === 'notNull')?.value).toBe(true);
    });

    it('should throw error for invalid column names', () => {
      const properties = {
        'nonexistent.equals': 'test',
      };

      expect(() =>
        service.processFilterConditions(properties, mockColumns),
      ).toThrow('Filter validation failed');
    });

    it('should validate filters using FilterBuilder', async () => {
      const properties = {
        'name.equals': 'valid-value',
      };

      const result = await service.processFilterConditions(
        properties,
        mockColumns,
      );
      expect(result).toHaveLength(1);
      expect(result[0].column).toBe('name');
    });
  });

  describe('fetchRelationsMetadata', () => {
    it('should return empty array when no relations config', async () => {
      const table = { relationsConfig: {} };

      const result = await service.fetchRelationsMetadata(table);
      expect(result).toEqual([]);
    });

    it('should return empty array when relations config is null', async () => {
      const table = { relationsConfig: null };

      const result = await service.fetchRelationsMetadata(table);
      expect(result).toEqual([]);
    });

    it.skip('should fetch relations metadata when relations exist', async () => {
      // Skip this test as it requires admin client mocking which is complex in unit tests
      // This functionality is covered by integration tests
    });
  });

  describe('processRelatedRecords', () => {
    it('should return empty array when no relations config', async () => {
      const table = { relationsConfig: {} };
      const data = [{ id: 1, name: 'test' }];
      const relationsMetadata = [];
      const params = {
        schemaName: 'public',
        tableName: 'test',
        page: 1,
        pageSize: 10,
      };

      const result = await service.processRelatedRecords(
        table,
        data,
        relationsMetadata,
        params,
      );

      expect(result).toEqual([]);
    });

    it('should process related records with display formatting', async () => {
      const table = {
        relationsConfig: {
          user: {
            source_column: 'user_id',
            target_table: 'users',
            target_schema: 'public',
            target_column: 'id',
            type: 'many_to_one',
          },
        },
      };

      const data = [{ id: 1, user_id: 123, name: 'test' }];

      const relationsMetadata = [
        {
          tableName: 'users',
          schemaName: 'public',
          displayFormat: '{name}',
        },
      ];

      const params = {
        schemaName: 'public',
        tableName: 'test',
        page: 1,
        pageSize: 10,
        displayFormatter: vi.fn().mockReturnValue('John Doe'),
      };

      // Mock getBatchRecordsByKeys for the new batch processing
      service.getBatchRecordsByKeys = vi.fn().mockResolvedValue([
        {
          schema: 'public',
          table: 'users',
          column: 'id',
          records: [
            {
              id: 123,
              name: 'John Doe',
            },
          ],
        },
      ]);

      const result = await service.processRelatedRecords(
        table,
        data,
        relationsMetadata,
        params,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        column: 'user_id',
        original: 123,
        formatted: 'John Doe',
        link: '/public/users/record/123',
      });

      expect(service.getBatchRecordsByKeys).toHaveBeenCalledWith(
        [
          {
            schema: 'public',
            table: 'users',
            column: 'id',
            values: [123],
            lookups: [
              {
                schema: 'public',
                table: 'users',
                column: 'id',
                value: 123,
                sourceRow: { id: 1, user_id: 123, name: 'test' },
                sourceColumn: 'user_id',
              },
            ],
          },
        ],
        [
          {
            displayFormat: '{name}',
            schemaName: 'public',
            tableName: 'users',
          },
        ],
        true, // skipPermissionCheck parameter
      );
    });

    it('should handle missing display format gracefully', async () => {
      const table = {
        relationsConfig: {
          user: {
            source_column: 'user_id',
            target_table: 'users',
            target_schema: 'public',
            target_column: 'id',
            type: 'many_to_one',
          },
        },
      };

      const data = [{ id: 1, user_id: 123, name: 'test' }];
      const relationsMetadata = []; // No metadata
      const params = {
        schemaName: 'public',
        tableName: 'test',
        page: 1,
        pageSize: 10,
      };

      const result = await service.processRelatedRecords(
        table,
        data,
        relationsMetadata,
        params,
      );

      expect(result).toEqual([]);
    });

    it('should handle missing records when data is empty and properties exist', async () => {
      const table = {
        relationsConfig: {
          user: {
            source_column: 'user_id',
            target_table: 'users',
            target_schema: 'public',
            target_column: 'id',
            type: 'many_to_one',
          },
        },
      };

      const data: Record<string, unknown>[] = []; // Empty data

      const relationsMetadata = [
        {
          tableName: 'users',
          schemaName: 'public',
          displayFormat: '{name}',
        },
      ];

      const params = {
        schemaName: 'public',
        tableName: 'test',
        page: 1,
        pageSize: 10,
        properties: { 'user_id.equals': 123 },
        displayFormatter: vi.fn().mockReturnValue('John Doe'),
      };

      // Mock getBatchRecordsByKeys for the new batch processing
      service.getBatchRecordsByKeys = vi.fn().mockResolvedValue([
        {
          schema: 'public',
          table: 'users',
          column: 'id',
          records: [
            {
              id: 123,
              name: 'John Doe',
              user_id: 123,
            },
          ],
        },
      ]);

      const result = await service.processRelatedRecords(
        table,
        data,
        relationsMetadata,
        params,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        column: 'user_id',
        original: 123, // Should be the original value from properties
        formatted: 'John Doe',
        link: '/public/users/record/123',
      });
    });
  });
});
