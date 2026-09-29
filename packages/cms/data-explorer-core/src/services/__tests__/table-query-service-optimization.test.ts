import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTableQueryService } from '../table-query-service';

const mockExecute = vi.fn();
const mockRunTransaction = vi.fn();

// Mock the dependencies
vi.mock('@pymekit/cms-supabase/client', () => ({
  getDrizzleSupabaseAdminClient: vi.fn(() => ({
    execute: mockExecute,
  })),
}));

describe('TableQueryService - Performance Optimizations', () => {
  let service: any;
  let mockContext: any;

  const baseParams = {
    schemaName: 'public',
    tableName: 'users',
    page: 1,
    pageSize: 25,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock the drizzle client that will be returned by context.get('drizzle')
    const mockDrizzleClient = {
      runTransaction: mockRunTransaction,
    };

    mockContext = {
      get: vi.fn((key: string) => {
        if (key === 'drizzle') {
          return mockDrizzleClient;
        }
        return undefined;
      }),
    };
    service = createTableQueryService(mockContext);

    // Mock permission check to return true by default
    mockRunTransaction.mockResolvedValue([{ has_permission: true }]);
  });

  describe('Simple Query Optimizations', () => {
    describe('First Page Ultra-Fast Path', () => {
      it('should handle small datasets with exact count (≤25 items)', async () => {
        // Mock: return exactly 20 rows (no more pages)
        const mockData = Array.from({ length: 20 }, (_, i) => ({
          id: i + 1,
          name: `User ${i + 1}`,
        }));
        mockExecute.mockResolvedValueOnce(mockData);

        const result = await service.queryTableData(baseParams);

        expect(result.data).toHaveLength(20);
        expect(result.totalCount).toBe(20);
        expect(result.pageCount).toBe(1);

        // Should only execute one query (no count query needed)
        expect(mockExecute).toHaveBeenCalledTimes(1);
      });

      it('should handle large datasets with approximate count (>25 items)', async () => {
        // Mock: return 26 rows (more pages exist)
        const mockData = Array.from({ length: 26 }, (_, i) => ({
          id: i + 1,
          name: `User ${i + 1}`,
        }));
        const mockCountData = [{ __cms_total_count: '1247' }];

        mockExecute
          .mockResolvedValueOnce(mockData) // First query: data with LIMIT 26
          .mockResolvedValueOnce(mockCountData); // Second query: approximate count

        const result = await service.queryTableData(baseParams);

        expect(result.data).toHaveLength(25); // Trimmed to page size
        expect(result.totalCount).toBe(1247);
        expect(result.pageCount).toBe(Math.ceil(1247 / 25));

        // Should execute two queries: fast data + approximate count
        expect(mockExecute).toHaveBeenCalledTimes(2);
      });

      it('should fallback gracefully when approximate count fails', async () => {
        // Mock: return 26 rows, but count query fails
        const mockData = Array.from({ length: 26 }, (_, i) => ({
          id: i + 1,
          name: `User ${i + 1}`,
        }));

        mockExecute
          .mockResolvedValueOnce(mockData) // First query: data
          .mockRejectedValueOnce(new Error('Count query failed')); // Second query: fails

        const result = await service.queryTableData(baseParams);

        expect(result.data).toHaveLength(25);
        expect(result.totalCount).toBe(250); // Fallback estimate (25 * 10)
        expect(result.pageCount).toBe(10); // Fallback page count
      });
    });

    describe('Subsequent Pages Optimization', () => {
      const page2Params = { ...baseParams, page: 2 };

      it('should use parallel approximate count + data for subsequent pages', async () => {
        const mockData = Array.from({ length: 25 }, (_, i) => ({
          id: i + 26,
          name: `User ${i + 26}`,
        }));
        const mockCountData = [{ __cms_total_count: '1247' }];

        // Mock parallel execution - first call returns count, second returns data
        mockExecute
          .mockResolvedValueOnce(mockCountData) // Count query
          .mockResolvedValueOnce(mockData); // Data query

        const result = await service.queryTableData(page2Params);

        expect(result.data).toHaveLength(25);
        expect(result.totalCount).toBe(1247);
        expect(result.pageCount).toBe(Math.ceil(1247 / 25));

        // Should execute exactly 2 queries in parallel
        expect(mockExecute).toHaveBeenCalledTimes(2);
      });

      it('should fallback to window function when optimization fails', async () => {
        const mockDataWithCount = Array.from({ length: 25 }, (_, i) => ({
          id: i + 26,
          name: `User ${i + 26}`,
          __cms_total_count: 1247,
        }));

        // First two calls fail (parallel count + data), third call (fallback) succeeds
        mockExecute
          .mockRejectedValueOnce(new Error('Optimization failed')) // Count query fails
          .mockRejectedValueOnce(new Error('Optimization failed')) // Data query fails
          .mockResolvedValueOnce(mockDataWithCount); // Fallback query succeeds

        const result = await service.queryTableData(page2Params);

        expect(result.data).toHaveLength(25);
        expect(result.totalCount).toBe(1247);
        expect(result.pageCount).toBe(Math.ceil(1247 / 25));

        // Should try optimization (2 calls) then fallback (1 call)
        expect(mockExecute).toHaveBeenCalledTimes(3);
      });
    });

    describe('Simple Query Detection', () => {
      it('should detect simple table scans correctly', () => {
        expect(service.isSimpleTableScan()).toBe(true);
        expect(service.isSimpleTableScan(undefined, [])).toBe(true);
        expect(service.isSimpleTableScan('', undefined)).toBe(true);
      });

      it('should detect complex queries correctly', () => {
        expect(service.isSimpleTableScan('search term')).toBe(false);
        expect(
          service.isSimpleTableScan(undefined, [
            { column: 'status', operator: 'eq', value: 'active' },
          ]),
        ).toBe(false);
        expect(
          service.isSimpleTableScan('search', [
            { column: 'status', operator: 'eq', value: 'active' },
          ]),
        ).toBe(false);
      });
    });
  });

  describe('Complex Query Path', () => {
    const complexParams = {
      schemaName: 'public',
      tableName: 'users',
      page: 1,
      pageSize: 25,
      search: 'john',
    };

    it('should use window function for complex queries', async () => {
      const mockDataWithCount = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        name: `User ${i + 1}`,
        __cms_total_count: 157,
      }));

      mockExecute.mockResolvedValueOnce(mockDataWithCount);

      const result = await service.queryTableData(complexParams);

      expect(result.data).toHaveLength(25);
      expect(result.totalCount).toBe(157);
      expect(result.pageCount).toBe(Math.ceil(157 / 25));

      // Should execute single query with window function
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
  });

  describe('Permission Handling', () => {
    it('should check permissions when not skipped', async () => {
      const params = { ...baseParams, skipPermissionCheck: false };
      const mockData = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));

      mockExecute.mockResolvedValueOnce(mockData);

      await service.queryTableData(params);

      expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    });

    it('should skip permission check when explicitly requested', async () => {
      const params = { ...baseParams, skipPermissionCheck: true };
      const mockData = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));

      mockExecute.mockResolvedValueOnce(mockData);

      await service.queryTableData(params);

      expect(mockRunTransaction).not.toHaveBeenCalled();
    });

    it('should throw error when permissions are denied', async () => {
      mockRunTransaction.mockResolvedValue([{ has_permission: false }]);

      await expect(service.queryTableData(baseParams)).rejects.toThrow(
        'You do not have permission to view this table',
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty result sets', async () => {
      mockExecute.mockResolvedValueOnce([]);

      const result = await service.queryTableData(baseParams);

      expect(result.data).toHaveLength(0);
      expect(result.totalCount).toBe(0);
      expect(result.pageCount).toBe(1);
    });

    it('should handle malformed count results', async () => {
      const mockData = Array.from({ length: 26 }, (_, i) => ({ id: i + 1 }));
      const mockBadCountData = [{ __cms_total_count: null }];

      // Mock implementation to return null/invalid count
      mockExecute.mockImplementation((query) => {
        const queryStr = query.toString();
        if (queryStr.includes('n_live_tup') || queryStr.includes('reltuples')) {
          return Promise.resolve(mockBadCountData);
        }
        return Promise.resolve(mockData);
      });

      const result = await service.queryTableData(baseParams);

      expect(result.data).toHaveLength(25);
      expect(result.totalCount).toBe(250); // Should fallback to estimate
    });

    it('should handle very large page sizes', async () => {
      const largePageParams = { ...baseParams, pageSize: 1000 };
      const mockData = Array.from({ length: 500 }, (_, i) => ({ id: i + 1 }));

      mockExecute.mockResolvedValueOnce(mockData);

      const result = await service.queryTableData(largePageParams);

      expect(result.data).toHaveLength(500);
      expect(result.totalCount).toBe(500);
      expect(result.pageCount).toBe(1);
    });
  });

  describe('Data Cleaning', () => {
    it('should remove the internal row-count alias from result data', () => {
      const dirtyData = [
        { id: 1, name: 'User 1', __cms_total_count: 100 },
        { id: 2, name: 'User 2', __cms_total_count: 100 },
      ];

      const cleanedData = service.cleanData(dirtyData);

      expect(cleanedData).toEqual([
        { id: 1, name: 'User 1' },
        { id: 2, name: 'User 2' },
      ]);
    });

    // The alias is namespaced so a real column of that name survives.
    it('should preserve a genuine total_count column', () => {
      const rows = [{ id: 1, total_count: 42 }];

      expect(service.cleanData(rows)).toEqual([{ id: 1, total_count: 42 }]);
    });

    it('should handle data without total_count', () => {
      const cleanData = [
        { id: 1, name: 'User 1' },
        { id: 2, name: 'User 2' },
      ];

      const result = service.cleanData(cleanData);

      expect(result).toEqual(cleanData);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should complete first page queries quickly', async () => {
      const mockData = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }));
      mockExecute.mockResolvedValueOnce(mockData);

      const startTime = Date.now();
      await service.queryTableData(baseParams);
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (allowing for test overhead)
      expect(duration).toBeLessThan(100); // 100ms threshold for tests
    });
  });
});
