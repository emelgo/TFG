import { Outlet, createFileRoute, notFound } from '@tanstack/react-router';

import featureFlagsConfig from '#/config/feature-flags.config.ts';

// Feature-flag gate for the settings billing surface. Billing is available if
// either personal or team billing is enabled; the unified loader
// (`fetchActiveAccountBillingData`) redirects to `/settings` when it is
// disabled for the *active* account specifically.
export const Route = createFileRoute('/_authenticated/settings/billing')({
  beforeLoad: () => {
    const enabled =
      featureFlagsConfig.enablePersonalAccountBilling ||
      featureFlagsConfig.enableTeamAccountBilling;

    if (!enabled) {
      throw notFound();
    }
  },
  component: Outlet,
});
