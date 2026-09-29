import * as z from 'zod';

import { ACCOUNT_MODES, type AccountMode } from '@pymekit/shared/mode-utils';

/**
 * Account Mode Configuration
 *
 * Three modes are supported:
 * - personal-only: B2C mode with individual accounts only
 * - organizations-only: B2B mode with team accounts only
 * - hybrid: B2B2C mode with both personal and team contexts (default)
 *
 * Controlled via env: VITE_ACCOUNT_MODE=personal-only|organizations-only|hybrid
 *
 * This is the single source of truth for which account surfaces exist; the
 * feature flags (see `feature-flags.config.ts`) are derived from it.
 */

const AccountModeSchema = z.object({
  mode: z.enum(ACCOUNT_MODES).default('hybrid'),
});

type AccountModeConfig = z.output<typeof AccountModeSchema>;

const HYBRID_MODE: AccountMode = 'hybrid';
const PERSONAL_ONLY_MODE: AccountMode = 'personal-only';
const ORGANIZATIONS_ONLY_MODE: AccountMode = 'organizations-only';

function createAccountModeConfig(): AccountModeConfig {
  return AccountModeSchema.parse({
    mode: import.meta.env.VITE_ACCOUNT_MODE || HYBRID_MODE,
  });
}

/**
 * Validated account mode configuration.
 */
export const accountModeConfig = createAccountModeConfig();

/**
 * Derives the account-context feature flags from the configured mode. Granular
 * toggles (billing, deletion, creation) are gated against these in
 * `feature-flags.config.ts` so a mode never exposes a surface it disables.
 */
export function getModeFeatureFlags() {
  const mode = accountModeConfig.mode;

  return {
    accountMode: mode,
    enableTeamAccounts: mode !== PERSONAL_ONLY_MODE,
    enablePersonalAccount: mode !== ORGANIZATIONS_ONLY_MODE,
    enableTeamCreation: mode !== PERSONAL_ONLY_MODE,
    enableTeamsOnly: mode === ORGANIZATIONS_ONLY_MODE,
  } as const;
}
