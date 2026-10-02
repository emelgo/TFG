import { createFileRoute, redirect } from '@tanstack/react-router';

import { PersonalAccountSettingsPanel } from '#/components/settings/personal-account-settings-panel.tsx';
import pathsConfig from '#/config/paths.config.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

// Dedicated, user-scoped profile route. Renders the signed-in user's personal
// settings independently of the active account, so the profile stays reachable
// when a team is the active workspace (notably organizations-only mode, where
// the personal account is never the working surface).
export const Route = createFileRoute('/_authenticated/settings/profile')({
  // When the personal account is the active workspace, `/settings` already is
  // the profile page — collapse to that single canonical URL so the two paths
  // never diverge (e.g. sidebar highlight, auth-callback landing).
  beforeLoad: ({ context }) => {
    if (context.workspace.account.is_personal_account) {
      throw redirect({ to: pathsConfig.app.settings });
    }
  },
  head: ({ match }) => ({
    meta: [
      { title: getTranslator(match.context.locale)('common.routes.profile') },
    ],
  }),
  component: PersonalAccountSettingsPanel,
});
