import { describe, expect, it } from 'vitest';

import { createRecordDisplayFormatter } from '../display-formatter';

describe('RecordDisplayFormatter', () => {
  const formatter = createRecordDisplayFormatter();

  describe('basic field replacement', () => {
    it('should replace single field placeholders', () => {
      const record = { name: 'John Doe', email: 'john@example.com' };
      const format = '{name} - {email}';
      const result = formatter(format, record);
      expect(result).toBe('John Doe - john@example.com');
    });

    it('should handle numeric values', () => {
      const record = { id: 123, count: 456 };
      const format = 'ID: {id}, Count: {count}';
      const result = formatter(format, record);
      expect(result).toBe('ID: 123, Count: 456');
    });

    it('should handle boolean values', () => {
      const record = { active: true, verified: false };
      const format = 'Active: {active}, Verified: {verified}';
      const result = formatter(format, record);
      expect(result).toBe('Active: true, Verified: false');
    });

    it('should return empty string for null values', () => {
      const record = { name: null, email: 'test@example.com' };
      const format = 'Name: {name}, Email: {email}';
      const result = formatter(format, record);
      expect(result).toBe('Name: , Email: test@example.com');
    });

    it('should return empty string for undefined values', () => {
      const record = { email: 'test@example.com' };
      const format = 'Name: {name}, Email: {email}';
      const result = formatter(format, record);
      expect(result).toBe('Name: , Email: test@example.com');
    });

    it('should return empty string for empty string values', () => {
      const record = { name: '', email: 'test@example.com' };
      const format = 'Name: {name}, Email: {email}';
      const result = formatter(format, record);
      expect(result).toBe('Name: , Email: test@example.com');
    });
  });

  describe('OR operator (||) support', () => {
    it('should use first non-empty value with OR operator', () => {
      const record = { nickname: 'Johnny', name: 'John Doe' };
      const format = '{nickname || name}';
      const result = formatter(format, record);
      expect(result).toBe('Johnny');
    });

    it('should fallback to second value when first is null', () => {
      const record = { nickname: null, name: 'John Doe' };
      const format = '{nickname || name}';
      const result = formatter(format, record);
      expect(result).toBe('John Doe');
    });

    it('should fallback to second value when first is undefined', () => {
      const record = { name: 'John Doe' };
      const format = '{nickname || name}';
      const result = formatter(format, record);
      expect(result).toBe('John Doe');
    });

    it('should fallback to second value when first is empty string', () => {
      const record = { nickname: '', name: 'John Doe' };
      const format = '{nickname || name}';
      const result = formatter(format, record);
      expect(result).toBe('John Doe');
    });

    it('should support multiple OR fallbacks', () => {
      const record = { displayName: null, nickname: '', name: 'John Doe' };
      const format = '{displayName || nickname || name}';
      const result = formatter(format, record);
      expect(result).toBe('John Doe');
    });

    it('should return empty string when all OR values are empty', () => {
      const record = { displayName: null, nickname: '', name: undefined };
      const format = '{displayName || nickname || name}';
      const result = formatter(format, record);
      expect(result).toBe('');
    });
  });

  describe('complex templates', () => {
    it('should handle multiple placeholders in a template', () => {
      const record = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        department: 'Engineering',
      };
      const format = '{firstName} {lastName} ({email}) - {department}';
      const result = formatter(format, record);
      expect(result).toBe('John Doe (john@example.com) - Engineering');
    });

    it('should handle mixed placeholders with OR operators', () => {
      const record = {
        firstName: 'John',
        lastName: 'Doe',
        nickname: '',
        email: 'john@example.com',
      };
      const format = '{nickname || firstName} {lastName} <{email}>';
      const result = formatter(format, record);
      expect(result).toBe('John Doe <john@example.com>');
    });

    it('should preserve non-placeholder text', () => {
      const record = { id: 123, status: 'active' };
      const format = 'User #{id} is currently {status}';
      const result = formatter(format, record);
      expect(result).toBe('User #123 is currently active');
    });

    it('should handle placeholders with spaces in OR expressions', () => {
      const record = { display: null, name: 'John' };
      const format = '{display  ||  name}';
      const result = formatter(format, record);
      expect(result).toBe('John');
    });
  });

  describe('edge cases', () => {
    it('should handle empty format string', () => {
      const record = { name: 'John' };
      const format = '';
      const result = formatter(format, record);
      expect(result).toBe('');
    });

    it('should handle format string with no placeholders', () => {
      const record = { name: 'John' };
      const format = 'Static text only';
      const result = formatter(format, record);
      expect(result).toBe('Static text only');
    });

    it('should handle empty record', () => {
      const record = {};
      const format = '{name} - {email}';
      const result = formatter(format, record);
      expect(result).toBe(' - ');
    });

    it('should handle special characters in field values', () => {
      const record = {
        name: 'John & Jane',
        email: 'test+tag@example.com',
        note: 'Price: $100',
      };
      const format = '{name} | {email} | {note}';
      const result = formatter(format, record);
      expect(result).toBe('John & Jane | test+tag@example.com | Price: $100');
    });

    it('should handle field names with underscores and numbers', () => {
      const record = {
        user_id: 123,
        first_name: 'John',
        field_2: 'Value',
      };
      const format = 'User {user_id}: {first_name} - {field_2}';
      const result = formatter(format, record);
      expect(result).toBe('User 123: John - Value');
    });

    it('should handle zero as a valid value', () => {
      const record = { count: 0, name: 'Item' };
      const format = '{name}: {count}';
      const result = formatter(format, record);
      expect(result).toBe('Item: 0');
    });

    it('should treat false as a valid value', () => {
      const record = { active: false, name: 'User' };
      const format = '{name} active: {active}';
      const result = formatter(format, record);
      expect(result).toBe('User active: false');
    });
  });
});
