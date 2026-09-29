import { CreditCard, Settings, User, Users } from 'lucide-react';
import * as z from 'zod';

import { NavigationConfigSchema } from '@pymekit/ui/navigation-schema';

import featureFlagsConfig from '#/config/feature-flags.config.ts';
import pathsConfig from '#/config/paths.config.ts';

const iconClasses = 'w-4';

/**
 * Builds the settings-section navigation from the active account. Shared by the
 * settings sidebar (desktop) and mobile navigation so both stay in sync.
 *
 * Personal → a "Your Account" group (profile + billing). Team → a group labelled
 * with the team name (settings + members + billing) plus a "Your Account" group
 * exposing the user-scoped profile, so it stays reachable while a team is active
 * (e.g. organizations-only mode). Billing entries respect the personal / team
 * billing feature flags.
 */
export function getSettingsNavigationConfig(account: {
  name: string | null;
  is_personal_account: boolean | null;
}) {
  const routes = account.is_personal_account
    ? [getPersonalAccountGroup()]
    : [getTeamAccountGroup(account.name), getPersonalProfileGroup()];

  return NavigationConfigSchema.parse({
    routes,
    style: import.meta.env.VITE_USER_NAVIGATION_STYLE,
    sidebarCollapsed: import.meta.env.VITE_HOME_SIDEBAR_COLLAPSED,
    sidebarCollapsedStyle: import.meta.env.VITE_SIDEBAR_COLLAPSIBLE_STYLE,
  });
}

function getPersonalAccountGroup() {
  const children = [
    {
      label: 'common.routes.profile',
      path: pathsConfig.app.settings,
      Icon: <User className={iconClasses} />,
      highlightMatch: `${pathsConfig.app.settings}$`,
    },
    featureFlagsConfig.enablePersonalAccountBilling
      ? {
          label: 'common.routes.billing',
          path: pathsConfig.app.settingsBilling,
          Icon: <CreditCard className={iconClasses} />,
        }
      : undefined,
  ].filter((route) => !!route);

  return {
    label: 'common.routes.yourAccount',
    children,
  } satisfies z.output<typeof NavigationConfigSchema>['routes'][number];
}

// Shown alongside the team group so the user can reach their own profile while
// a team is the active account. Only the user-scoped profile is included —
// personal billing is omitted because the billing route reflects the active
// (team) account, not the personal one.
function getPersonalProfileGroup() {
  return {
    label: 'common.routes.yourAccount',
    children: [
      {
        label: 'common.routes.profile',
        path: pathsConfig.app.settingsProfile,
        Icon: <User className={iconClasses} />,
        highlightMatch: `${pathsConfig.app.settingsProfile}$`,
      },
    ],
  } satisfies z.output<typeof NavigationConfigSchema>['routes'][number];
}

function getTeamAccountGroup(accountName: string | null) {
  const children = [
    {
      label: 'common.routes.settings',
      path: pathsConfig.app.settings,
      Icon: <Settings className={iconClasses} />,
      highlightMatch: `${pathsConfig.app.settings}$`,
    },
    {
      label: 'common.routes.members',
      path: pathsConfig.app.settingsMembers,
      Icon: <Users className={iconClasses} />,
    },
    featureFlagsConfig.enableTeamAccountBilling
      ? {
          label: 'common.routes.billing',
          path: pathsConfig.app.settingsBilling,
          Icon: <CreditCard className={iconClasses} />,
        }
      : undefined,
  ].filter((route) => !!route);

  return {
    // The active team's name is used verbatim as the group label (falls back to
    // a generic i18n key when missing).
    label: accountName ?? 'common.routes.settings',
    children,
  } satisfies z.output<typeof NavigationConfigSchema>['routes'][number];
}
