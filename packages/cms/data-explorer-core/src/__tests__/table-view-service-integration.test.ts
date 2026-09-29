import { describe, expect, it } from 'vitest';

import { parsePropertiesToFilters } from '@pymekit/cms-filters-core';
import type { ColumnMetadata } from '@pymekit/cms-types';

describe('table-view-service integration with filters-core', () => {
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
    {
      name: 'created_at',
      ui_config: { data_type: 'timestamp with time zone' },
      is_nullable: false,
      is_primary_key: false,
      is_unique: false,
      is_searchable: false,
      is_sortable: true,
      is_filterable: true,
    },
  ];

  describe('parsePropertiesToFilters integration', () => {
    it('should safely parse properties that would previously cause security issues', () => {
      const properties = {
        'name.equals': 'test',
        'id.greaterThan': 5,
        'email.isNull': 'true',
        'created_at.lessThanOrEqual': '2024-01-01',
      };

      const result = parsePropertiesToFilters(properties, mockColumns);

      expect(result).toHaveLength(4);
      expect(result.find((f) => f.column === 'name')).toEqual({
        column: 'name',
        operator: 'eq',
        value: 'test',
      });
      expect(result.find((f) => f.column === 'id')).toEqual({
        column: 'id',
        operator: 'gt',
        value: 5,
      });
      expect(result.find((f) => f.column === 'email')).toEqual({
        column: 'email',
        operator: 'isNull',
        value: true,
      });
      expect(result.find((f) => f.column === 'created_at')).toEqual({
        column: 'created_at',
        operator: 'lte',
        value: '2024-01-01',
      });
    });

    it('should reject malicious input that could cause SQL injection', () => {
      const maliciousProperties = {
        "'; DROP TABLE users; --": 'malicious',
        'id.equals': '1; DELETE FROM users;',
      };

      // Should throw error for non-existent column
      expect(() => {
        parsePropertiesToFilters(maliciousProperties, mockColumns);
      }).toThrow("Column ''; DROP TABLE users; --' not found");
    });

    it('should handle edge cases that previously caused issues', () => {
      const edgeCaseProperties = {
        '': 'empty-key',
        '.equals': 'no-column-name',
        name: 'no-operator',
        'name.unknownOp': 'unknown-operator',
        'name.equals': undefined,
        'name.contains': null,
        columns: ['name', 'id'], // special key to skip
      };

      const result = parsePropertiesToFilters(edgeCaseProperties, mockColumns);

      // Should only process valid entries
      expect(result).toHaveLength(2);

      // Should have one filter for 'name' with no operator (defaults to 'eq')
      const noOpFilter = result.find(
        (f) => f.column === 'name' && f.value === 'no-operator',
      );
      expect(noOpFilter).toBeTruthy();
      expect(noOpFilter?.operator).toBe('eq');

      // Should have one filter for 'name.unknownOp' (defaults to 'eq')
      const unknownOpFilter = result.find(
        (f) => f.column === 'name' && f.value === 'unknown-operator',
      );
      expect(unknownOpFilter).toBeTruthy();
      expect(unknownOpFilter?.operator).toBe('eq');
    });

    it('should validate column existence before processing', () => {
      const properties = {
        'nonexistent_column.equals': 'test',
        'another_fake.greaterThan': 5,
      };

      expect(() => {
        parsePropertiesToFilters(properties, mockColumns);
      }).toThrow("Column 'nonexistent_column' not found");
    });

    it('should maintain backward compatibility with previous behavior', () => {
      // Test the same scenarios that the old manual parsing handled
      const legacyProperties = {
        'name.equals': 'test_user',
        'id.greaterThan': 10,
        'id.lessThanOrEqual': 100,
        'email.notEquals': 'admin@example.com',
        'created_at.isNull': 'true',
        'name.notNull': 'true',
      };

      const result = parsePropertiesToFilters(legacyProperties, mockColumns);

      expect(result).toHaveLength(6);

      // Verify operator mappings match the old behavior
      const nameFilter = result.find(
        (f) => f.column === 'name' && f.value === 'test_user',
      );
      expect(nameFilter?.operator).toBe('eq');

      const gtFilter = result.find((f) => f.column === 'id' && f.value === 10);
      expect(gtFilter?.operator).toBe('gt');

      const lteFilter = result.find(
        (f) => f.column === 'id' && f.value === 100,
      );
      expect(lteFilter?.operator).toBe('lte');

      const neqFilter = result.find((f) => f.column === 'email');
      expect(neqFilter?.operator).toBe('neq');

      // Verify null operators convert 'true' to boolean true
      const isNullFilter = result.find(
        (f) => f.column === 'created_at' && f.operator === 'isNull',
      );
      expect(isNullFilter?.value).toBe(true);

      const notNullFilter = result.find(
        (f) => f.column === 'name' && f.operator === 'notNull',
      );
      expect(notNullFilter?.value).toBe(true);
    });
  });
});
