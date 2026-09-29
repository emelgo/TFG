import { describe, expect, it } from 'vitest';

import { type AccountMode, canSwitchContext } from '../mode-utils';

describe('canSwitchContext', () => {
  describe('hybrid mode', () => {
    const mode: AccountMode = 'hybrid';

    it('allows switching to organization', () => {
      const result = canSwitchContext(mode, true);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('allows switching to personal', () => {
      const result = canSwitchContext(mode, false);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  describe('personal-only mode', () => {
    const mode: AccountMode = 'personal-only';

    it('blocks switching to organization', () => {
      const result = canSwitchContext(mode, true);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(
        'Organizations are not enabled in this configuration',
      );
    });

    it('allows switching to personal', () => {
      const result = canSwitchContext(mode, false);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  describe('organizations-only mode', () => {
    const mode: AccountMode = 'organizations-only';

    it('allows switching to organization', () => {
      const result = canSwitchContext(mode, true);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('blocks switching to personal', () => {
      const result = canSwitchContext(mode, false);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(
        'Personal accounts are not available in this configuration',
      );
    });
  });

  describe('return type', () => {
    it('returns object with allowed boolean', () => {
      const result = canSwitchContext('hybrid', true);

      expect(typeof result.allowed).toBe('boolean');
    });

    it('returns object with optional reason string', () => {
      const allowedResult = canSwitchContext('hybrid', true);
      const blockedResult = canSwitchContext('personal-only', true);

      expect(allowedResult.reason).toBeUndefined();
      expect(typeof blockedResult.reason).toBe('string');
    });
  });
});
