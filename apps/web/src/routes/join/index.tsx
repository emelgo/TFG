import { createFileRoute, notFound } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

import { AuthLayoutShell } from '@pymekit/auth/auth-layout';
import { AcceptInvitationContainer } from '@pymekit/team-accounts/components';
import { Button } from '@pymekit/ui/button';
import { Heading } from '@pymekit/ui/heading';
import { Trans } from '@pymekit/ui/trans';

import { AppLogo } from '#/components/app-logo.tsx';
import pathsConfig from '#/config/paths.config.ts';
import { readFlag, readString } from '#/lib/auth/search-params.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';
import { fetchJoinInvitation } from '#/lib/server/join.functions.ts';

interface JoinSearch {
  invite_token?: string;
  type?: 'invite' | 'magic-link';
  email?: string;
  is_new_user?: boolean;
}

export const Route = createFileRoute('/join/')({
  validateSearch: (search: Record<string, unknown>): JoinSearch => ({
    invite_token: readString(search.invite_token),
    type:
      search.type === 'invite' || search.type === 'magic-link'
        ? search.type
        : undefined,
    email: readString(search.email),
    // The router JSON-parses search values, so `?is_new_user=true` arrives as a
    // boolean — use readFlag (readString would drop it, skipping /identities).
    is_new_user: readFlag(search.is_new_user),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => {
    if (!deps.invite_token) {
      throw notFound();
    }

    return fetchJoinInvitation({
      data: {
        invite_token: deps.invite_token,
        type: deps.type,
        email: deps.email,
        is_new_user: deps.is_new_user,
      },
    });
  },
  head: () => ({ meta: [{ title: getTranslator()('teams.joinTeamAccount') }] }),
  component: JoinTeamAccountPage,
});

function JoinTeamAccountPage() {
  const result = Route.useLoaderData();

  if (result.status === 'invalid') {
    return (
      <AuthLayoutShell Logo={AppLogo}>
        <InviteNotFoundOrExpired />
      </AuthLayoutShell>
    );
  }

  return (
    <AuthLayoutShell Logo={AppLogo}>
      <AcceptInvitationContainer
        email={result.email}
        inviteToken={result.token}
        invitation={result.invitation}
        paths={result.paths}
      />
    </AuthLayoutShell>
  );
}

function InviteNotFoundOrExpired() {
  return (
    <div className={'flex flex-col space-y-4'}>
      <Heading level={6}>
        <Trans i18nKey={'teams.inviteNotFoundOrExpired'} />
      </Heading>

      <p className={'text-muted-foreground text-sm'}>
        <Trans i18nKey={'teams.inviteNotFoundOrExpiredDescription'} />
      </p>

      <Button
        nativeButton={false}
        render={
          <a href={pathsConfig.app.home}>
            <ArrowLeft className={'mr-2 w-4'} />
            <Trans i18nKey={'teams.backToHome'} />
          </a>
        }
        className={'w-full'}
        variant={'outline'}
      />
    </div>
  );
}
