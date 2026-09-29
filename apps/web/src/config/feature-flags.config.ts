import * as z from 'zod';

import { ACCOUNT_MODES } from '@pymekit/shared/mode-utils';

import { getModeFeatureFlags } from '#/config/account-mode.config.ts';

type LanguagePriority = 'user' | 'application';

const FeatureFlagsSchema = z.object({
  accountMode: z.enum(ACCOUNT_MODES),
  enableThemeToggle: z.boolean({
    error: 'Provide the variable VITE_ENABLE_THEME_TOGGLE',
  }),
  enableAccountDeletion: z.boolean({
    error: 'Provide the variable VITE_ENABLE_PERSONAL_ACCOUNT_DELETION',
  }),
  enableTeamDeletion: z.boolean({
    error: 'Provide the variable VITE_ENABLE_TEAM_ACCOUNTS_DELETION',
  }),
  enableTeamAccounts: z.boolean({
    error: 'Provide the variable VITE_ACCOUNT_MODE',
  }),
  enableTeamCreation: z.boolean({
    error: 'Provide the variable VITE_ENABLE_TEAM_ACCOUNTS_CREATION',
  }),
  enablePersonalAccountBilling: z.boolean({
    error: 'Provide the variable VITE_ENABLE_PERSONAL_ACCOUNT_BILLING',
  }),
  enableTeamAccountBilling: z.boolean({
    error: 'Provide the variable VITE_ENABLE_TEAM_ACCOUNTS_BILLING',
  }),
  languagePriority: z
    .enum(['user', 'application'], {
      error: 'Provide the variable VITE_LANGUAGE_PRIORITY',
    })
    .default('application'),
  enableNotifications: z.boolean({
    error: 'Provide the variable VITE_ENABLE_NOTIFICATIONS',
  }),
  realtimeNotifications: z.boolean({
    error: 'Provide the variable VITE_REALTIME_NOTIFICATIONS',
  }),
  enableVersionUpdater: z.boolean({
    error: 'Provide the variable VITE_ENABLE_VERSION_UPDATER',
  }),
  enableTeamsOnly: z.boolean({
    error: 'Provide the variable VITE_ACCOUNT_MODE',
  }),
});

// Account-context flags are derived from VITE_ACCOUNT_MODE, not read directly.
const mode = getModeFeatureFlags();

const featuresFlagConfig = FeatureFlagsSchema.parse({
  accountMode: mode.accountMode,
  enableThemeToggle: getBoolean(import.meta.env.VITE_ENABLE_THEME_TOGGLE, true),
  // Granular toggles are gated by the mode so a surface the mode disables can
  // never be re-enabled by its own flag.
  enableAccountDeletion:
    mode.enablePersonalAccount &&
    getBoolean(import.meta.env.VITE_ENABLE_PERSONAL_ACCOUNT_DELETION, false),
  enableTeamDeletion:
    mode.enableTeamAccounts &&
    getBoolean(import.meta.env.VITE_ENABLE_TEAM_ACCOUNTS_DELETION, false),
  enableTeamAccounts: mode.enableTeamAccounts,
  enableTeamCreation:
    mode.enableTeamCreation &&
    getBoolean(import.meta.env.VITE_ENABLE_TEAM_ACCOUNTS_CREATION, true),
  enablePersonalAccountBilling:
    mode.enablePersonalAccount &&
    getBoolean(import.meta.env.VITE_ENABLE_PERSONAL_ACCOUNT_BILLING, false),
  enableTeamAccountBilling:
    mode.enableTeamAccounts &&
    getBoolean(import.meta.env.VITE_ENABLE_TEAM_ACCOUNTS_BILLING, false),
  languagePriority: import.meta.env.VITE_LANGUAGE_PRIORITY as LanguagePriority,
  enableNotifications: getBoolean(
    import.meta.env.VITE_ENABLE_NOTIFICATIONS,
    true,
  ),
  realtimeNotifications: getBoolean(
    import.meta.env.VITE_REALTIME_NOTIFICATIONS,
    false,
  ),
  enableVersionUpdater: getBoolean(
    import.meta.env.VITE_ENABLE_VERSION_UPDATER,
    false,
  ),
  enableTeamsOnly: mode.enableTeamsOnly,
} satisfies z.output<typeof FeatureFlagsSchema>);

export default featuresFlagConfig;

function getBoolean(value: unknown, defaultValue: boolean) {
  if (typeof value === 'string') {
    return value === 'true';
  }

  return defaultValue;
}
