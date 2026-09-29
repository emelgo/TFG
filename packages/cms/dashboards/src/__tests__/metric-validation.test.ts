import { describe, expect, it } from 'vitest';

import {
  AllWidgetsSchema,
  MetricWidgetConfigSchema,
} from '../types/widget-forms';

describe('MetricWidgetConfigSchema validation', () => {
  it('should allow empty metric for count aggregation', () => {
    const config = {
      aggregation: 'count' as const,
      metric: '', // Empty metric should be ok for count
    };

    const result = MetricWidgetConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should allow missing metric for count aggregation', () => {
    const config = {
      aggregation: 'count' as const,
      // metric is undefined
    };

    const result = MetricWidgetConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should require metric for sum aggregation', () => {
    const config = {
      aggregation: 'sum' as const,
      metric: '', // Empty metric should fail for sum
    };

    const result = MetricWidgetConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'dashboard:validation.columnRequired',
      );
      expect(result.error.issues[0]?.path).toEqual(['metric']);
    }
  });

  it('should require metric for avg aggregation', () => {
    const config = {
      aggregation: 'avg' as const,
      metric: undefined, // Missing metric should fail for avg
    };

    const result = MetricWidgetConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'dashboard:validation.columnRequired',
      );
    }
  });

  it('should accept valid metric for non-count aggregations', () => {
    const config = {
      aggregation: 'sum' as const,
      metric: 'price', // Valid column name
    };

    const result = MetricWidgetConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should require metric for min aggregation', () => {
    const config = {
      aggregation: 'min' as const,
      metric: '   ', // Whitespace-only should fail
    };

    const result = MetricWidgetConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should require metric for max aggregation', () => {
    const config = {
      aggregation: 'max' as const,
      metric: '   ', // Whitespace-only should fail
    };

    const result = MetricWidgetConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe('Widget Form Date Filter Validation', () => {
  // Base widget object to extend in tests
  const baseWidget = {
    type: 'metric' as const,
    title: 'Test Metric',
    schemaName: 'public',
    tableName: 'users',
  };

  describe('Metric widgets with trend comparison', () => {
    it('should accept metric widget with trend enabled and valid date filter with neq operator', () => {
      const widget = {
        ...baseWidget,
        config: {
          aggregation: 'count' as const,
          metric: '*',
          showTrend: true,
          filters: [
            {
              column: 'deleted_at',
              operator: 'neq',
              value: '2025-08-12',
              config: { isTrendFilter: true },
            },
          ],
        },
      };

      const result = AllWidgetsSchema.safeParse(widget);
      expect(result.success).toBe(true);
    });

    it('should accept metric widget with trend enabled and relative date filter', () => {
      const widget = {
        ...baseWidget,
        config: {
          aggregation: 'count' as const,
          metric: '*',
          showTrend: true,
          filters: [
            {
              column: 'created_at',
              operator: 'between',
              value: '__rel_date:last7Days',
              config: { isTrendFilter: true },
            },
          ],
        },
      };

      const result = AllWidgetsSchema.safeParse(widget);
      expect(result.success).toBe(true);
    });

    it('should accept metric widget with trend enabled and eq operator on date', () => {
      const widget = {
        ...baseWidget,
        config: {
          aggregation: 'count' as const,
          metric: '*',
          showTrend: true,
          filters: [
            {
              column: 'created_at',
              operator: 'eq',
              value: '2025-08-12',
              config: { isTrendFilter: true },
            },
          ],
        },
      };

      const result = AllWidgetsSchema.safeParse(widget);
      expect(result.success).toBe(true);
    });

    it('should accept metric widget with trend enabled and before operator', () => {
      const widget = {
        ...baseWidget,
        config: {
          aggregation: 'count' as const,
          metric: '*',
          showTrend: true,
          filters: [
            {
              column: 'updated_at',
              operator: 'before',
              value: '2025-08-12',
              config: { isTrendFilter: true },
            },
          ],
        },
      };

      const result = AllWidgetsSchema.safeParse(widget);
      expect(result.success).toBe(true);
    });

    it('should accept metric widget with trend enabled and after operator', () => {
      const widget = {
        ...baseWidget,
        config: {
          aggregation: 'count' as const,
          metric: '*',
          showTrend: true,
          filters: [
            {
              column: 'created_at',
              operator: 'after',
              value: '2025-01-01',
              config: { isTrendFilter: true },
            },
          ],
        },
      };

      const result = AllWidgetsSchema.safeParse(widget);
      expect(result.success).toBe(true);
    });

    it('should accept metric widget with trend enabled and between operator', () => {
      const widget = {
        ...baseWidget,
        config: {
          aggregation: 'count' as const,
          metric: '*',
          showTrend: true,
          filters: [
            {
              column: 'created_at',
              operator: 'between',
              value: ['2025-01-01', '2025-12-31'],
              config: { isTrendFilter: true },
            },
          ],
        },
      };

      const result = AllWidgetsSchema.safeParse(widget);
      expect(result.success).toBe(true);
    });

    it('should accept metric widget with trend disabled (no date filter validation)', () => {
      const widget = {
        ...baseWidget,
        config: {
          aggregation: 'count' as const,
          metric: '*',
          showTrend: false,
          // No filters needed when trend is disabled
        },
      };

      const result = AllWidgetsSchema.safeParse(widget);
      expect(result.success).toBe(true);
    });

    it('should accept metric widget with trend enabled and multiple filters', () => {
      const widget = {
        ...baseWidget,
        config: {
          aggregation: 'count' as const,
          metric: '*',
          showTrend: true,
          filters: [
            {
              column: 'status',
              operator: 'eq',
              value: 'active',
              config: { isTrendFilter: false },
            },
            {
              column: 'created_at',
              operator: 'gte',
              value: '2025-01-01',
              config: { isTrendFilter: true },
            },
          ],
        },
      };

      const result = AllWidgetsSchema.safeParse(widget);
      expect(result.success).toBe(true);
    });
  });

  describe('Edge cases and error conditions', () => {
    it('should handle empty filter arrays gracefully', () => {
      const widget = {
        ...baseWidget,
        config: {
          aggregation: 'count' as const,
          metric: '*',
          showTrend: true,
          filters: [],
        },
      };

      const result = AllWidgetsSchema.safeParse(widget);
      expect(result.success).toBe(true);
    });

    it('should handle null filter values', () => {
      const widget = {
        ...baseWidget,
        config: {
          aggregation: 'count' as const,
          metric: '*',
          showTrend: true,
          filters: [
            {
              column: 'deleted_at',
              operator: 'isNull',
              value: null,
              config: { isTrendFilter: true },
            },
          ],
        },
      };

      const result = AllWidgetsSchema.safeParse(widget);
      expect(result.success).toBe(true);
    });

    it('should handle malformed filter objects', () => {
      const widget = {
        ...baseWidget,
        config: {
          aggregation: 'count' as const,
          metric: '*',
          showTrend: true,
          filters: [
            {
              // Missing required fields - should not crash validation
              invalidField: 'test',
            },
          ],
        },
      };

      // Should not throw, even with malformed filter
      const result = AllWidgetsSchema.safeParse(widget);
      expect(result.success).toBe(true);
    });
  });
});
