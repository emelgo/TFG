import { describe, expect, it } from 'vitest';

import { toHumanReadable } from '../text-formatter';

describe('toHumanReadable', () => {
  it('converts snake_case to human readable format', () => {
    expect(toHumanReadable('user_name')).toBe('User Name');
    expect(toHumanReadable('first_name_last_name')).toBe(
      'First Name Last Name',
    );
  });

  it('converts kebab-case to human readable format', () => {
    expect(toHumanReadable('user-name')).toBe('User Name');
    expect(toHumanReadable('first-name-last-name')).toBe(
      'First Name Last Name',
    );
  });

  it('converts mixed case with both dashes and underscores', () => {
    expect(toHumanReadable('user_name-field')).toBe('User Name Field');
    expect(toHumanReadable('api-key_value')).toBe('Api Key Value');
  });

  it('handles empty and falsy values', () => {
    expect(toHumanReadable('')).toBe('');
    expect(toHumanReadable(null)).toBe('');
    expect(toHumanReadable(undefined)).toBe('');
    expect(toHumanReadable(0)).toBe('0');
    expect(toHumanReadable(false)).toBe('False');
  });

  it('handles numeric values', () => {
    expect(toHumanReadable(123)).toBe('123');
    expect(toHumanReadable(45.67)).toBe('45.67');
  });

  it('handles boolean values', () => {
    expect(toHumanReadable(true)).toBe('True');
    expect(toHumanReadable(false)).toBe('False');
  });

  it('handles object values by converting to string', () => {
    expect(toHumanReadable({ key: 'value' })).toBe('[Object Object]');
    expect(toHumanReadable(['item1', 'item2'])).toBe('Item1,Item2');
  });

  it('capitalizes first letter of each word', () => {
    expect(toHumanReadable('hello world')).toBe('Hello World');
    expect(toHumanReadable('api endpoint url')).toBe('Api Endpoint Url');
  });

  it('handles single words', () => {
    expect(toHumanReadable('username')).toBe('Username');
    expect(toHumanReadable('id')).toBe('Id');
  });

  it('handles already formatted strings', () => {
    expect(toHumanReadable('User Name')).toBe('User Name');
    expect(toHumanReadable('First Name')).toBe('First Name');
  });

  it('handles strings with numbers', () => {
    expect(toHumanReadable('user_id_123')).toBe('User Id 123');
    expect(toHumanReadable('api-v2-endpoint')).toBe('Api V2 Endpoint');
  });

  it('handles edge cases that caused original error', () => {
    // These are the types of values that likely caused the original TypeError
    expect(toHumanReadable(Symbol('test'))).toBe('Symbol(Test)');
    expect(toHumanReadable(new Date('2024-01-01'))).toMatch(/Mon Jan 01 2024/); // Date string varies by timezone
  });
});
