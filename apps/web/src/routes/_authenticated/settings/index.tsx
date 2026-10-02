import { createFileRoute } from '@tanstack/react-router';

import { TeamAccountSettingsContainer } from '@pymekit/team-accounts/components';
import { AppBreadcrumbs } from '@pymekit/ui/app-breadcrumbs';
import { PageBody } from '@pymekit/ui/page';
import { Trans } from '@pymekit/ui/trans';

import { HomePageHeader } from '#/components/home/home-page-header.tsx';
import { PersonalAccountSettingsPanel } from '#/components/settings/personal-account-settings-panel.tsx';
import { useWorkspace } from '#/components/workspace-context.tsx';
import featureFlagsConfig from '#/config/feature-flags.config.ts';
import pathsConfig from '#/config/paths.config.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

const teamFeatures = {
  enableTeamDeletion: featureFlagsConfig.enableTeamDeletion,
};

const teamPaths = {
  teamAccountSettings: pathsConfig.app.settings,
};

export const Route = createFileRoute('/_authenticated/settings/')({
  head: ({ match }) => ({
    meta: [
      { title: getTranslator(match.context.locale)('common.routes.settings') },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { account } = useWorkspace();

  if (account.is_personal_account) {
    return <PersonalAccountSettingsPanel />;
  }

  return (
    <PageBody>
      <HomePageHeader
        title={<Trans i18nKey={'teams.settings.pageTitle'} />}
        description={<AppBreadcrumbs />}
      />

      <div className={'flex max-w-2xl flex-1 flex-col'}>
        <TeamAccountSettingsContainer
          account={{
            id: account.id,
            name: account.name,
            pictureUrl: account.picture_url,
            slug: account.slug as string,
            primaryOwnerUserId: account.primary_owner_user_id,
          }}
          paths={teamPaths}
          features={teamFeatures}
        />
      </div>
    </PageBody>
  );
}
