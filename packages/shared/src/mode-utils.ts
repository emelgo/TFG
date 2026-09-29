/**
 * Account Mode Utilities
 *
 * Shared utilities for working with account modes across the application.
 * These utilities provide type-safe helpers for mode validation and context
 * switching.
 */

/**
 * The supported account modes. Single source of truth for the value list —
 * app configs wrap this with `z.enum(ACCOUNT_MODES)` and the `AccountMode` type
 * is derived from it, so the list is never re-typed by hand.
 */
export const ACCOUNT_MODES = [
  'personal-only',
  'organizations-only',
  'hybrid',
] as const;

export type AccountMode = (typeof ACCOUNT_MODES)[number];

/**
 * @name isHybridMode
 * @description Checks if the account mode is hybrid
 */
const isHybridMode = (mode: AccountMode) => mode === 'hybrid';

/**
 * @name isOrganizationsOnlyMode
 * @description Checks if the account mode is organizations-only
 */
const isOrganizationsOnlyMode = (mode: AccountMode) =>
  mode === 'organizations-only';

/**
 * @name isPersonalOnlyMode
 * @description Checks if the account mode is personal-only
 */
const isPersonalOnlyMode = (mode: AccountMode) => mode === 'personal-only';

/**
 * Determines if context switching is allowed from the current to the target
 * context.
 *
 * @param mode - The account mode
 * @param targetIsOrganization - Whether the target context is an organization
 * @returns Object with `allowed` boolean and optional `reason` string
 */
export function canSwitchContext(
  mode: AccountMode,
  targetIsOrganization: boolean,
): { allowed: boolean; reason?: string } {
  // Always allow in hybrid mode
  if (isHybridMode(mode)) {
    return { allowed: true };
  }

  // In personal-only mode, can't switch to an organization
  if (isPersonalOnlyMode(mode) && targetIsOrganization) {
    return {
      allowed: false,
      reason: 'Organizations are not enabled in this configuration',
    };
  }

  // In organizations-only mode, can't switch to the personal account
  if (isOrganizationsOnlyMode(mode) && !targetIsOrganization) {
    return {
      allowed: false,
      reason: 'Personal accounts are not available in this configuration',
    };
  }

  return { allowed: true };
}
