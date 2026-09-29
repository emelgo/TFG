import { describe, expect, it } from 'vitest';

import {
  buildOptimalColumnList,
  estimateColumnReduction,
  parseDisplayFormatColumns,
} from '../display-format-parser';

describe('parseDisplayFormatColumns', () => {
  describe('Valid Format Parsing', () => {
    it('should extract single column from simple format', () => {
      expect(parseDisplayFormatColumns('{name}')).toEqual(['name']);
    });

    it('should extract multiple columns from complex format', () => {
      expect(parseDisplayFormatColumns('{first_name} {last_name}')).toEqual([
        'first_name',
        'last_name',
      ]);
    });

    it('should extract columns from format with text', () => {
      expect(parseDisplayFormatColumns('User: {name} - {email}')).toEqual([
        'name',
        'email',
      ]);
    });

    it('should handle columns with underscores and numbers', () => {
      expect(
        parseDisplayFormatColumns('{user_id} - {created_at_2023}'),
      ).toEqual(['user_id', 'created_at_2023']);
    });

    it('should handle qualified column names', () => {
      expect(
        parseDisplayFormatColumns('{users.name} - {profiles.avatar}'),
      ).toEqual(['users.name', 'profiles.avatar']);
    });

    it('should deduplicate repeated columns', () => {
      expect(parseDisplayFormatColumns('{name} {name} {email}')).toEqual([
        'name',
        'email',
      ]);
    });
  });

  describe('Edge Cases', () => {
    it('should return empty array for null input', () => {
      expect(parseDisplayFormatColumns(null)).toEqual([]);
    });

    it('should return empty array for undefined input', () => {
      expect(parseDisplayFormatColumns(undefined)).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      expect(parseDisplayFormatColumns('')).toEqual([]);
    });

    it('should return empty array for string without braces', () => {
      expect(parseDisplayFormatColumns('No braces here')).toEqual([]);
    });

    it('should ignore empty braces', () => {
      expect(parseDisplayFormatColumns('{} {name} {}')).toEqual(['name']);
    });

    it('should ignore invalid column names', () => {
      expect(parseDisplayFormatColumns('{name} {-invalid} {2valid}')).toEqual([
        'name',
      ]);
    });

    it('should handle malformed braces', () => {
      expect(parseDisplayFormatColumns('{name {email} name}')).toEqual([
        // Malformed braces result in invalid column names that are filtered out
      ]);
    });

    it('should handle nested braces', () => {
      expect(parseDisplayFormatColumns('{{name}} {email}')).toEqual(['email']);
    });
  });

  describe('Security', () => {
    it('should reject SQL injection attempts', () => {
      expect(parseDisplayFormatColumns('{name; DROP TABLE users; --}')).toEqual(
        [],
      );
    });

    it('should reject columns with quotes', () => {
      expect(parseDisplayFormatColumns('{name"} {email\'}')).toEqual([]);
    });

    it('should reject columns with special characters', () => {
      expect(parseDisplayFormatColumns('{name@domain} {user#id}')).toEqual([]);
    });
  });
});

describe('buildOptimalColumnList', () => {
  describe('Column List Building', () => {
    it('should include primary key by default', () => {
      const result = buildOptimalColumnList('');
      expect(result).toContain('id');
    });

    it('should use custom primary key column', () => {
      const result = buildOptimalColumnList('', 'user_id');
      expect(result).toContain('user_id');
      expect(result).not.toContain('id');
    });

    it('should include columns from displayFormat', () => {
      const result = buildOptimalColumnList('{name} - {email}');
      expect(result).toEqual(expect.arrayContaining(['id', 'name', 'email']));
    });

    it('should include unique constraint columns for URL building', () => {
      const result = buildOptimalColumnList('{name}', 'id', [
        'email',
        'username',
      ]);
      expect(result).toEqual(
        expect.arrayContaining(['id', 'email', 'username', 'name']),
      );
    });

    it('should not duplicate columns if already specified', () => {
      const result = buildOptimalColumnList('{id} - {name}');
      expect(result.filter((col) => col === 'id')).toHaveLength(1);
    });

    it('should handle null/undefined displayFormat gracefully', () => {
      expect(buildOptimalColumnList(null)).toEqual(['id']);
      expect(buildOptimalColumnList(undefined)).toEqual(['id']);
    });

    it('should include unique constraints even without displayFormat', () => {
      const result = buildOptimalColumnList('', 'id', ['email']);
      expect(result).toEqual(expect.arrayContaining(['id', 'email']));
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle displayFormat with duplicate columns', () => {
      const result = buildOptimalColumnList('{name} {name} {email}', 'uuid');
      expect(result).toEqual(expect.arrayContaining(['uuid', 'name', 'email']));
      expect(result).toHaveLength(3); // No duplicates
    });

    it('should handle displayFormat with qualified names', () => {
      const result = buildOptimalColumnList('{users.name} {profiles.avatar}');
      expect(result).toEqual(
        expect.arrayContaining(['id', 'users.name', 'profiles.avatar']),
      );
    });

    it('should maintain order (primary key first)', () => {
      const result = buildOptimalColumnList('{name} - {email}', 'uuid');
      expect(result[0]).toBe('uuid'); // Primary key should be first
    });

    it('should handle composite primary keys and unique constraints', () => {
      const result = buildOptimalColumnList('{title}', 'id', [
        'tenant_id',
        'slug',
        'email',
      ]);
      expect(result).toEqual(
        expect.arrayContaining(['id', 'tenant_id', 'slug', 'email', 'title']),
      );
      expect(result).toHaveLength(5);
    });

    it('should deduplicate across all column sources', () => {
      const result = buildOptimalColumnList('{id} {email} {name}', 'id', [
        'email',
        'name',
      ]);
      // Should have id, email, name only (no duplicates)
      expect(result).toEqual(expect.arrayContaining(['id', 'email', 'name']));
      expect(result).toHaveLength(3);
    });
  });
});

describe('estimateColumnReduction', () => {
  describe('Reduction Calculations', () => {
    it('should calculate correct reduction percentage', () => {
      expect(estimateColumnReduction(['id', 'name'], 10)).toBeCloseTo(0.8); // 80% reduction
      expect(estimateColumnReduction(['id', 'name', 'email'], 6)).toBeCloseTo(
        0.5,
      ); // 50% reduction
    });

    it('should return 0 for no reduction scenarios', () => {
      expect(estimateColumnReduction(['a', 'b', 'c'], 3)).toBe(0); // Same count
      expect(estimateColumnReduction(['a', 'b', 'c', 'd'], 3)).toBe(0); // More selected than total
    });

    it('should handle edge cases', () => {
      expect(estimateColumnReduction([], 5)).toBeCloseTo(1.0); // 100% reduction
      expect(estimateColumnReduction(['a'], 0)).toBe(0); // Invalid total
      expect(estimateColumnReduction(['a'], -1)).toBe(0); // Negative total
    });
  });

  describe('Performance Insights', () => {
    it('should show significant reduction for wide tables', () => {
      const reduction = estimateColumnReduction(['id', 'name'], 50);
      expect(reduction).toBeCloseTo(0.96); // 96% reduction for wide tables
    });

    it('should show minimal reduction for narrow tables', () => {
      const reduction = estimateColumnReduction(['id', 'name'], 3);
      expect(reduction).toBeCloseTo(0.33); // 33% reduction for narrow tables
    });
  });
});

describe('Integration Scenarios', () => {
  describe('Real-world Display Formats', () => {
    it('should optimize typical user display format', () => {
      const displayFormat = '{first_name} {last_name} ({email})';
      const columns = buildOptimalColumnList(displayFormat, 'user_id');

      expect(columns).toEqual(
        expect.arrayContaining(['user_id', 'first_name', 'last_name', 'email']),
      );
      expect(columns).toHaveLength(4);

      const reduction = estimateColumnReduction(columns, 15);
      expect(reduction).toBeCloseTo(0.73); // ~73% reduction
    });

    it('should optimize product display format', () => {
      const displayFormat = '{name} - ${price} ({category.name})';
      const columns = buildOptimalColumnList(displayFormat, 'product_id');

      expect(columns).toEqual(
        expect.arrayContaining([
          'product_id',
          'name',
          'price',
          'category.name',
        ]),
      );
      expect(columns).toHaveLength(4);
    });

    it('should handle minimal display format efficiently', () => {
      const displayFormat = '{title}';
      const columns = buildOptimalColumnList(displayFormat);

      expect(columns).toEqual(['id', 'title']);
      expect(columns).toHaveLength(2);

      const reduction = estimateColumnReduction(columns, 20);
      expect(reduction).toBe(0.9); // 90% reduction
    });
  });

  describe('Error Recovery', () => {
    it('should gracefully handle malformed formats', () => {
      const badFormat = '{name {email} invalid}';
      const columns = buildOptimalColumnList(badFormat);

      expect(columns).toEqual(['id']); // Falls back to primary key only when format is malformed
    });

    it('should provide fallback for completely invalid formats', () => {
      const invalidFormat = 'completely invalid format';
      const columns = buildOptimalColumnList(invalidFormat);

      expect(columns).toEqual(['id']); // Falls back to primary key only
    });
  });
});
