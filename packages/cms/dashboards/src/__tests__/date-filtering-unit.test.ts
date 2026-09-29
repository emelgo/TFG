/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';

import { FilterBuilder } from '@pymekit/cms-filters-core';
import type { ColumnMetadata } from '@pymekit/cms-types';

describe('Dashboard Widgets - Date Filtering Unit Tests', () => {
  describe('Date Value Detection', () => {
    // Helper function from widgets.service.ts
    const isDateValue = (value: string): boolean => {
      const datePatterns = [
        /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO format
        /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
        /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY
      ];

      if (datePatterns.some((pattern) => pattern.test(value))) {
        const date = new Date(value);
        return !isNaN(date.getTime());
      }
      return false;
    };

    it('should correctly identify date values', () => {
      // Valid date formats
      expect(isDateValue('2024-08-07')).toBe(true);
      expect(isDateValue('2024-08-07T12:00:00')).toBe(true);
      expect(isDateValue('2024-08-07T12:00:00Z')).toBe(true);
      expect(isDateValue('08/07/2024')).toBe(true);
      expect(isDateValue('07-08-2024')).toBe(true);

      // Invalid date formats
      expect(isDateValue('active')).toBe(false);
      expect(isDateValue('123')).toBe(false);
      expect(isDateValue('John Doe')).toBe(false);
      expect(isDateValue('2024-13-45')).toBe(false); // Invalid date
    });
  });

  describe('Date Equality with FilterBuilder', () => {
    it('should convert absolute dates to date ranges for equality', () => {
      const columns: ColumnMetadata[] = [
        {
          name: 'created_at',
          ordering: null,
          display_name: null,
          description: null,
          is_searchable: true,
          is_visible_in_table: true,
          is_visible_in_detail: true,
          default_value: null,
          is_sortable: true,
          is_filterable: true,
          is_editable: true,
          is_primary_key: false,
          is_required: false,
          relations: [],
          ui_config: { data_type: 'timestamp with time zone' },
        },
      ];

      const filterBuilder = new FilterBuilder({
        serviceType: 'widgets',
        columns,
        escapeStrategy: 'drizzle',
      });

      // Test absolute date
      const absoluteDateCondition = {
        column: 'created_at',
        operator: 'eq',
        value: '2024-08-07',
      };

      const absoluteResult = filterBuilder.buildCondition(
        absoluteDateCondition,
      );

      // Should produce a BETWEEN clause for date equality
      expect(absoluteResult).toContain('BETWEEN');
      expect(absoluteResult).toContain('"created_at"');
      expect(absoluteResult).toMatch(/BETWEEN '[^']+' AND '[^']+'/);
    });

    it('should handle relative dates consistently', () => {
      const columns: ColumnMetadata[] = [
        {
          name: 'created_at',
          ordering: null,
          display_name: null,
          description: null,
          is_searchable: true,
          is_visible_in_table: true,
          is_visible_in_detail: true,
          default_value: null,
          is_sortable: true,
          is_filterable: true,
          is_editable: true,
          is_primary_key: false,
          is_required: false,
          relations: [],
          ui_config: { data_type: 'timestamp with time zone' },
        },
      ];

      const filterBuilder = new FilterBuilder({
        serviceType: 'widgets',
        columns,
        escapeStrategy: 'drizzle',
      });

      // Test relative date
      const relativeDateCondition = {
        column: 'created_at',
        operator: 'eq',
        value: '__rel_date:today',
      };

      const relativeResult = filterBuilder.buildCondition(
        relativeDateCondition,
      );

      // Should produce a BETWEEN clause
      expect(relativeResult).toContain('BETWEEN');
      expect(relativeResult).toContain('"created_at"');
      expect(relativeResult).toMatch(/BETWEEN '[^']+' AND '[^']+'/);
    });

    it('should produce similar date ranges for "today" vs actual today date', () => {
      const columns: ColumnMetadata[] = [
        {
          name: 'created_at',
          ordering: null,
          display_name: null,
          description: null,
          is_searchable: true,
          is_visible_in_table: true,
          is_visible_in_detail: true,
          default_value: null,
          is_sortable: true,
          is_filterable: true,
          is_editable: true,
          is_primary_key: false,
          is_required: false,
          relations: [],
          ui_config: { data_type: 'timestamp with time zone' },
        },
      ];

      const filterBuilder = new FilterBuilder({
        serviceType: 'widgets',
        columns,
        escapeStrategy: 'drizzle',
      });

      // Get today's date in YYYY-MM-DD format (local timezone to match FilterBuilder)
      const today = new Date();
      const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      // Test both formats
      const absoluteDateResult = filterBuilder.buildCondition({
        column: 'created_at',
        operator: 'eq',
        value: todayString,
      });

      const relativeDateResult = filterBuilder.buildCondition({
        column: 'created_at',
        operator: 'eq',
        value: '__rel_date:today',
      });

      // Both should use BETWEEN
      expect(absoluteDateResult).toContain('BETWEEN');
      expect(relativeDateResult).toContain('BETWEEN');

      // Extract dates from the SQL
      const absoluteDates = absoluteDateResult.match(
        /BETWEEN '([^']+)' AND '([^']+)'/,
      );
      const relativeDates = relativeDateResult.match(
        /BETWEEN '([^']+)' AND '([^']+)'/,
      );

      expect(absoluteDates).toBeTruthy();
      expect(relativeDates).toBeTruthy();

      if (absoluteDates && relativeDates) {
        const absStart = new Date(absoluteDates[1]!);
        const absEnd = new Date(absoluteDates[2]!);
        const relStart = new Date(relativeDates[1]!);
        const relEnd = new Date(relativeDates[2]!);

        // Check that both represent the same 24-hour period
        // Allow for timezone differences by checking duration consistency
        const absDuration = absEnd.getTime() - absStart.getTime();
        const relDuration = relEnd.getTime() - relStart.getTime();

        // Both should represent almost 24 hours (23:59:59.999 to be exact)
        const expectedDuration = 24 * 60 * 60 * 1000 - 1; // 23:59:59.999 milliseconds
        const tolerance = 1000; // 1 second tolerance

        expect(Math.abs(absDuration - expectedDuration)).toBeLessThan(
          tolerance,
        );
        expect(Math.abs(relDuration - expectedDuration)).toBeLessThan(
          tolerance,
        );

        // Verify both ranges represent "today" by checking they're within 24 hours of now
        const now = Date.now();
        expect(Math.abs(absStart.getTime() - now)).toBeLessThan(
          24 * 60 * 60 * 1000,
        );
        expect(Math.abs(relStart.getTime() - now)).toBeLessThan(
          24 * 60 * 60 * 1000,
        );
      }
    });
  });
});
