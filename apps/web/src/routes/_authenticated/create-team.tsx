import { createFileRoute } from '@tanstack/react-router';

import { CreateTeamAccountForm } from '@pymekit/team-accounts/components';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pymekit/ui/card';
import { Trans } from '@pymekit/ui/trans';

import { AppLogo } from '#/components/app-logo.tsx';
import { fetchCreateTeamState } from '#/lib/server/create-team.functions.ts';

// Standalone onboarding route inside the authenticated area: renders without a
// sidebar (a direct child of `_authenticated`, not the `dashboard`/`settings`
// shells). The loader gates access (teams-only mode + create-first-team flow).
export const Route = createFileRoute('/_authenticated/create-team')({
  loader: () => fetchCreateTeamState(),
  component: CreateTeamPage,
});

function CreateTeamPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-y-8">
      <AppLogo />

      <Card>
        <CardHeader>
          <CardTitle>
            <Trans i18nKey={'teams.createFirstTeamHeading'} />
          </CardTitle>

          <CardDescription>
            <Trans i18nKey={'teams.createFirstTeamDescription'} />
          </CardDescription>
        </CardHeader>

        <CardContent>
          <CreateTeamAccountForm submitLabel={'teams.getStarted'} />
        </CardContent>
      </Card>
    </div>
  );
}
