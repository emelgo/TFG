import { describe, expect, it } from 'vitest';

import type { ColumnMetadata } from '@pymekit/cms-types';

import { WidgetConfigValidator } from '../widget-config-validator';

describe('WidgetConfigValidator', () => {
  const mockColumns: ColumnMetadata[] = [
    {
      name: 'id',
      ordering: 1,
      display_name: 'ID',
      description: null,
      is_searchable: false,
      is_visible_in_table: true,
      is_visible_in_detail: true,
      default_value: null,
      is_sortable: true,
      is_filterable: true,
      is_editable: false,
      is_primary_key: true,
      is_required: true,
      relations: [],
      ui_config: {
        data_type: 'integer',
      },
    },
    {
      name: 'email',
      ordering: 2,
      display_name: 'Email',
      description: null,
      is_searchable: true,
      is_visible_in_table: true,
      is_visible_in_detail: true,
      default_value: null,
      is_sortable: true,
      is_filterable: true,
      is_editable: true,
      is_primary_key: false,
      is_required: true,
      relations: [],
      ui_config: {
        data_type: 'character varying',
      },
    },
    {
      name: 'created_at',
      ordering: 3,
      display_name: 'Created At',
      description: null,
      is_searchable: false,
      is_visible_in_table: true,
      is_visible_in_detail: true,
      default_value: null,
      is_sortable: true,
      is_filterable: true,
      is_editable: false,
      is_primary_key: false,
      is_required: false,
      relations: [],
      ui_config: {
        data_type: 'timestamp with time zone',
      },
    },
    {
      name: 'birth_date',
      ordering: 4,
      display_name: 'Birth Date',
      description: null,
      is_searchable: false,
      is_visible_in_table: true,
      is_visible_in_detail: true,
      default_value: null,
      is_sortable: true,
      is_filterable: true,
      is_editable: true,
      is_primary_key: false,
      is_required: false,
      relations: [],
      ui_config: {
        data_type: 'date',
      },
    },
  ];

  describe('isDateColumn', () => {
    it('should identify date columns correctly', () => {
      const dateTypes = [
        'date',
        'timestamp',
        'timestamp with time zone',
        'timestamp without time zone',
        'timestamptz',
      ];

      dateTypes.forEach((type) => {
        expect(WidgetConfigValidator.isDateColumn(type)).toBe(true);
      });
    });

    // DATE_TRUNC returns 00:00:00 for every `time` row rather than erroring,
    // and has no overload at all for `time with time zone`.
    it('should reject time-of-day columns, which cannot be bucketed', () => {
      const timeOnlyTypes = [
        'time',
        'time with time zone',
        'time without time zone',
      ];

      timeOnlyTypes.forEach((type) => {
        expect(WidgetConfigValidator.isDateColumn(type)).toBe(false);
      });
    });

    it('should reject non-date columns', () => {
      const nonDateTypes = [
        'integer',
        'text',
        'character varying',
        'boolean',
        'json',
        'uuid',
        'numeric',
      ];

      nonDateTypes.forEach((type) => {
        expect(WidgetConfigValidator.isDateColumn(type)).toBe(false);
      });
    });

    it('should handle case insensitive matching', () => {
      expect(WidgetConfigValidator.isDateColumn('DATE')).toBe(true);
      expect(WidgetConfigValidator.isDateColumn('TIMESTAMP')).toBe(true);
      expect(
        WidgetConfigValidator.isDateColumn('Timestamp With Time Zone'),
      ).toBe(true);
    });

    it('should handle undefined and empty values', () => {
      expect(WidgetConfigValidator.isDateColumn(undefined)).toBe(false);
      expect(WidgetConfigValidator.isDateColumn('')).toBe(false);
    });
  });

  describe('getDateColumns', () => {
    it('should return only date columns', () => {
      const dateColumns = WidgetConfigValidator.getDateColumns(mockColumns);

      expect(dateColumns).toHaveLength(2);
      expect(dateColumns.map((c) => c.name)).toEqual([
        'created_at',
        'birth_date',
      ]);
    });

    it('should return empty array when no date columns exist', () => {
      const nonDateColumns = mockColumns.filter(
        (col) => !['created_at', 'birth_date'].includes(col.name),
      );

      const dateColumns = WidgetConfigValidator.getDateColumns(nonDateColumns);
      expect(dateColumns).toHaveLength(0);
    });
  });

  describe('validateTimeAggregation', () => {
    it('should allow time aggregation for date columns', () => {
      const config = {
        xAxis: 'created_at',
        timeAggregation: 'day',
        aggregation: 'COUNT',
        yAxis: '*',
      };

      const result = WidgetConfigValidator.validateTimeAggregation(
        config,
        'chart',
        mockColumns,
      );

      expect(result.config.timeAggregation).toBe('day');
      expect(result.warnings).toHaveLength(0);
    });

    it('should disable time aggregation for non-date columns', () => {
      const config = {
        xAxis: 'email',
        timeAggregation: 'day',
        aggregation: 'COUNT',
        yAxis: '*',
      };

      const result = WidgetConfigValidator.validateTimeAggregation(
        config,
        'chart',
        mockColumns,
      );

      expect(result.config.timeAggregation).toBeUndefined();
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Time aggregation disabled');
      expect(result.warnings[0]).toContain('email');
    });

    it('should throw error for missing columns', () => {
      const config = {
        xAxis: 'nonexistent_column',
        timeAggregation: 'day',
        aggregation: 'COUNT',
        yAxis: '*',
      };

      expect(() => {
        WidgetConfigValidator.validateTimeAggregation(
          config,
          'chart',
          mockColumns,
        );
      }).toThrow("Column 'nonexistent_column' not found");
    });

    it('should skip validation for non-chart widgets', () => {
      const config = {
        xAxis: 'email',
        timeAggregation: 'day',
        aggregation: 'COUNT',
        yAxis: '*',
      };

      const result = WidgetConfigValidator.validateTimeAggregation(
        config,
        'table',
        mockColumns,
      );

      expect(result.config.timeAggregation).toBe('day'); // Unchanged
      expect(result.warnings).toHaveLength(0);
    });

    it('should skip validation when time aggregation is not used', () => {
      const config = {
        xAxis: 'email',
        aggregation: 'COUNT',
        yAxis: '*',
        // No timeAggregation
      };

      const result = WidgetConfigValidator.validateTimeAggregation(
        config,
        'chart',
        mockColumns,
      );

      expect(result.config).toEqual(config); // Unchanged
      expect(result.warnings).toHaveLength(0);
    });

    it('should skip validation when xAxis is not specified', () => {
      const config = {
        timeAggregation: 'day',
        aggregation: 'COUNT',
        yAxis: '*',
        // No xAxis
      };

      const result = WidgetConfigValidator.validateTimeAggregation(
        config,
        'chart',
        mockColumns,
      );

      expect(result.config).toEqual(config); // Unchanged
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('requiresDateXAxis', () => {
    it('should require date columns for line charts', () => {
      expect(WidgetConfigValidator.requiresDateXAxis('line')).toBe(true);
    });

    it('should require date columns for area charts', () => {
      expect(WidgetConfigValidator.requiresDateXAxis('area')).toBe(true);
    });

    it('should not require date columns for bar charts', () => {
      expect(WidgetConfigValidator.requiresDateXAxis('bar')).toBe(false);
    });

    it('should not require date columns for pie charts', () => {
      expect(WidgetConfigValidator.requiresDateXAxis('pie')).toBe(false);
    });

    it('should handle undefined chart type', () => {
      expect(WidgetConfigValidator.requiresDateXAxis(undefined)).toBe(false);
    });
  });

  describe('getValidXAxisColumns', () => {
    it('should return only date columns for line charts', () => {
      const validColumns = WidgetConfigValidator.getValidXAxisColumns(
        mockColumns,
        'line',
      );

      expect(validColumns).toHaveLength(2);
      expect(validColumns.map((c) => c.name)).toEqual([
        'created_at',
        'birth_date',
      ]);
    });

    it('should return only date columns for area charts', () => {
      const validColumns = WidgetConfigValidator.getValidXAxisColumns(
        mockColumns,
        'area',
      );

      expect(validColumns).toHaveLength(2);
      expect(validColumns.map((c) => c.name)).toEqual([
        'created_at',
        'birth_date',
      ]);
    });

    it('should return categorical and date columns for bar charts', () => {
      const validColumns = WidgetConfigValidator.getValidXAxisColumns(
        mockColumns,
        'bar',
      );

      expect(validColumns).toHaveLength(3);
      expect(validColumns.map((c) => c.name)).toEqual([
        'email',
        'created_at',
        'birth_date',
      ]);
    });

    it('should return categorical and date columns for pie charts', () => {
      const validColumns = WidgetConfigValidator.getValidXAxisColumns(
        mockColumns,
        'pie',
      );

      expect(validColumns).toHaveLength(3);
      expect(validColumns.map((c) => c.name)).toEqual([
        'email',
        'created_at',
        'birth_date',
      ]);
    });

    it('should handle undefined chart type', () => {
      const validColumns = WidgetConfigValidator.getValidXAxisColumns(
        mockColumns,
        undefined,
      );

      expect(validColumns).toHaveLength(3);
      expect(validColumns.map((c) => c.name)).toEqual([
        'email',
        'created_at',
        'birth_date',
      ]);
    });
  });

  describe('validateConfiguration', () => {
    it('should return comprehensive validation results', () => {
      const config = {
        xAxis: 'email',
        timeAggregation: 'day',
        aggregation: 'COUNT',
        yAxis: '*',
      };

      const result = WidgetConfigValidator.validateConfiguration(
        config,
        'chart',
        mockColumns,
      );

      expect(result.config.timeAggregation).toBeUndefined();
      expect(result.warnings).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle validation errors gracefully', () => {
      const config = {
        xAxis: 'nonexistent_column',
        timeAggregation: 'day',
        aggregation: 'COUNT',
        yAxis: '*',
      };

      const result = WidgetConfigValidator.validateConfiguration(
        config,
        'chart',
        mockColumns,
      );

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(
        "Column 'nonexistent_column' not found",
      );
    });

    it('should handle valid configurations without changes', () => {
      const config = {
        xAxis: 'created_at',
        timeAggregation: 'day',
        aggregation: 'COUNT',
        yAxis: '*',
      };

      const result = WidgetConfigValidator.validateConfiguration(
        config,
        'chart',
        mockColumns,
      );

      expect(result.config).toEqual(config);
      expect(result.warnings).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
