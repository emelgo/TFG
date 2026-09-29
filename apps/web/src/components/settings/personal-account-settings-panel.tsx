import { PersonalAccountSettingsContainer } from '@pymekit/accounts/personal-account-settings';
import { AppBreadcrumbs } from '@pymekit/ui/app-breadcrumbs';
import { PageBody } from '@pymekit/ui/page';
import { Trans } from '@pymekit/ui/trans';

import { AuthHashStatusListener } from '#/components/home/auth-hash-status-listener.tsx';
import { HomePageHeader } from '#/components/home/home-page-header.tsx';
import { useWorkspace } from '#/components/workspace-context.tsx';
import authConfig from '#/config/auth.config.ts';
import featureFlagsConfig from '#/config/feature-flags.config.ts';
import pathsConfig from '#/config/paths.config.ts';

const showEmailOption =
  authConfig.providers.password ||
  authConfig.providers.magicLink ||
  authConfig.providers.otp;

const personalFeatures = {
  showLinkEmailOption: showEmailOption,
  enablePasswordUpdate: authConfig.providers.password,
  enableAccountDeletion: featureFlagsConfig.enableAccountDeletion,
  enableAccountLinking: authConfig.enableIdentityLinking,
  enablePasskeys: authConfig.providers.passkey,
};

const personalPaths = {
  callback: `${pathsConfig.auth.callback}?next=${pathsConfig.app.settingsProfile}`,
};

/**
 * Renders the signed-in user's personal profile settings. Keyed off the user
 * (not the active account) so it works regardless of which workspace is active.
 * Shared by the settings index (personal-active) and the dedicated
 * `/settings/profile` route (reachable while a team is active).
 */
export function PersonalAccountSettingsPanel() {
  const { user } = useWorkspace();

  return (
    <PageBody>
      <HomePageHeader
        title={<Trans i18nKey={'common.routes.profile'} />}
        description={<AppBreadcrumbs />}
      />

      <div className={'flex w-full flex-1 flex-col lg:max-w-2xl'}>
        <AuthHashStatusListener />

        <PersonalAccountSettingsContainer
          userId={user.id}
          features={personalFeatures}
          paths={personalPaths}
          providers={authConfig.providers.oAuth}
        />
      </div>
    </PageBody>
  );
}
