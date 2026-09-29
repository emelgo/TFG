/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';

import { QueryBuilder } from '../core/query-builder';
import { QueryValidator } from '../validation/query-validator';
import { sqlToString } from './test-helpers';

describe('QueryBuilder - SQL Security', () => {
  describe('Identifier Validation', () => {
    it('should validate safe identifiers', () => {
      expect(QueryValidator.isValidIdentifier('users')).toBe(true);
      expect(QueryValidator.isValidIdentifier('user_profiles')).toBe(true);
      expect(QueryValidator.isValidIdentifier('_private_table')).toBe(true);
    });

    it('should reject malicious identifiers', () => {
      expect(QueryValidator.isValidIdentifier('users; DROP TABLE')).toBe(false);
      expect(QueryValidator.isValidIdentifier('users--')).toBe(false);
      expect(QueryValidator.isValidIdentifier('users/*')).toBe(false);
      expect(QueryValidator.isValidIdentifier('123users')).toBe(false); // Can't start with digit
    });

    it('should sanitize unsafe identifiers', () => {
      expect(QueryValidator.sanitizeIdentifier('user$table!')).toBe(
        'usertable',
      );
      expect(QueryValidator.sanitizeIdentifier('123table')).toBe('_123table');
      expect(QueryValidator.sanitizeIdentifier('user; DROP')).toBe('userDROP'); // Actual behavior: spaces/semicolons removed
    });

    it('should validate table names through QueryValidator', () => {
      const validator = new QueryValidator();

      expect(() => validator.validateTable('users')).not.toThrow();
      expect(() => validator.validateTable('user_profiles')).not.toThrow();

      // This should throw for invalid identifiers
      expect(() => validator.validateTable('users; DROP')).toThrow(
        /Invalid table name/,
      );
    });

    it('should validate schema names through QueryValidator', () => {
      const validator = new QueryValidator();

      expect(() => validator.validateSchema('public')).not.toThrow();
      expect(() => validator.validateSchema('auth')).not.toThrow();

      // This should throw for invalid identifiers
      expect(() => validator.validateSchema('public; DROP')).toThrow(
        /Invalid schema name/,
      );
    });
  });

  describe('WHERE Clause Injection Prevention', () => {
    it('should prevent SQL injection in WHERE values using filters', () => {
      const maliciousValue = "'; DROP TABLE users; --";

      const result = QueryBuilder.from('public', 'users')
        .whereFilters([
          {
            column: 'name',
            operator: 'eq',
            value: maliciousValue,
          },
        ])
        .build();

      const { sql, params } = sqlToString(result.sql);
      expect(params).toContain(maliciousValue);
      expect(sql).not.toContain('DROP TABLE');
      expect(sql).toContain('WHERE');
    });

    it('should prevent injection in IN clauses using filters', () => {
      const maliciousArray = ['1', "2'; DROP TABLE users; --"];

      const result = QueryBuilder.from('public', 'users')
        .whereFilters([
          {
            column: 'id',
            operator: 'in',
            value: maliciousArray,
          },
        ])
        .build();

      const { sql, params } = sqlToString(result.sql);
      expect(params).toEqual(expect.arrayContaining(maliciousArray));
      expect(sql).not.toContain('DROP TABLE');
    });
  });

  describe('JOIN Condition Validation', () => {
    it('should validate safe JOIN conditions', () => {
      const validator = new QueryValidator();

      expect(validator.isSafeCondition('users.id = profiles.user_id')).toBe(
        true,
      );
      expect(
        validator.isSafeCondition('a.status = b.status AND a.active = true'),
      ).toBe(true);
    });

    it('should reject dangerous JOIN conditions', () => {
      const validator = new QueryValidator();

      expect(
        validator.isSafeCondition('users.id = 1; DROP TABLE users; --'),
      ).toBe(false);
      expect(
        validator.isSafeCondition('users.id = 1 UNION SELECT * FROM passwords'),
      ).toBe(false);
      expect(
        validator.isSafeCondition('users.id = 1 /* malicious comment */'),
      ).toBe(false);
      expect(validator.isSafeCondition('users.id = 1 -- comment')).toBe(false);
    });
  });

  describe('Aggregation Validation', () => {
    it('should validate safe aggregation types', () => {
      expect(() => QueryValidator.validateAggregation('count')).not.toThrow();
      expect(() => QueryValidator.validateAggregation('sum')).not.toThrow();
      expect(() => QueryValidator.validateAggregation('avg')).not.toThrow();
      expect(() => QueryValidator.validateAggregation('min')).not.toThrow();
      expect(() => QueryValidator.validateAggregation('max')).not.toThrow();
    });

    it('should reject invalid aggregation types', () => {
      expect(() => QueryValidator.validateAggregation('DROP')).toThrow(
        /Invalid aggregation type/,
      );
      expect(() => QueryValidator.validateAggregation('EXEC')).toThrow(
        /Invalid aggregation type/,
      );
      expect(() =>
        QueryValidator.validateAggregation('malicious_func'),
      ).toThrow(/Invalid aggregation type/);
    });
  });

  describe('Query Complexity Validation', () => {
    it('should validate query configuration', () => {
      const validator = new QueryValidator({ maxJoins: 2 });

      const safeConfig = {
        schema: 'public',
        table: 'users',
        joins: [
          {
            type: 'INNER' as const,
            table: { schema: 'public', table: 'profiles' },
            condition: 'users.id = profiles.user_id',
          },
        ],
      };

      const result = validator.validateQuery(safeConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject queries with too many joins', () => {
      const validator = new QueryValidator({ maxJoins: 1 });

      const complexConfig = {
        schema: 'public',
        table: 'users',
        joins: [
          {
            type: 'INNER' as const,
            table: { schema: 'public', table: 'profiles' },
            condition: 'users.id = profiles.user_id',
          },
          {
            type: 'LEFT' as const,
            table: { schema: 'public', table: 'orders' },
            condition: 'users.id = orders.user_id',
          },
        ],
      };

      const result = validator.validateQuery(complexConfig);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Too many JOINs');
    });
  });
});
