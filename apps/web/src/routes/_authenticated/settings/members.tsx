import { createFileRoute, redirect } from '@tanstack/react-router';
import { PlusCircle } from 'lucide-react';

import {
  AccountInvitationsTable,
  AccountMembersTable,
  InviteMembersDialogContainer,
} from '@pymekit/team-accounts/components';
import { AppBreadcrumbs } from '@pymekit/ui/app-breadcrumbs';
import { Button } from '@pymekit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pymekit/ui/card';
import { If } from '@pymekit/ui/if';
import { PageBody } from '@pymekit/ui/page';
import { Trans } from '@pymekit/ui/trans';

import { HomePageHeader } from '#/components/home/home-page-header.tsx';
import { useWorkspace } from '#/components/workspace-context.tsx';
import pathsConfig from '#/config/paths.config.ts';
import { fetchActiveAccountMembersPageData } from '#/lib/server/team-members.functions.ts';

// Seat/plan gating is not yet wired; members can always be invited.
const canAddMember = true;

export const Route = createFileRoute('/_authenticated/settings/members')({
  // Members belong to a team; a personal active account has no members page.
  beforeLoad: ({ context }) => {
    if (context.workspace.account.is_personal_account) {
      throw redirect({ to: pathsConfig.app.settings });
    }
  },
  loader: () => fetchActiveAccountMembersPageData(),
  component: TeamAccountMembersPage,
});

function TeamAccountMembersPage() {
  const { members, invitations } = Route.useLoaderData();
  const { account, user } = useWorkspace();

  const canManageRoles = account.permissions?.includes('roles.manage') ?? false;
  const canManageInvitations =
    account.permissions?.includes('invites.manage') ?? false;

  const isPrimaryOwner = account.primary_owner_user_id === user.id;
  const currentUserRoleHierarchy = account.role_hierarchy_level ?? 0;

  return (
    <PageBody>
      <HomePageHeader
        title={<Trans i18nKey={'common.routes.members'} />}
        description={<AppBreadcrumbs />}
      />

      <div className={'flex w-full max-w-4xl flex-col space-y-4 pb-32'}>
        <Card>
          <CardHeader className={'flex flex-row justify-between'}>
            <div className={'flex flex-col space-y-1.5'}>
              <CardTitle>
                <Trans i18nKey={'common.accountMembers'} />
              </CardTitle>

              <CardDescription>
                <Trans i18nKey={'common.membersTabDescription'} />
              </CardDescription>
            </div>

            <If condition={canManageInvitations && canAddMember}>
              <InviteMembersDialogContainer
                userRoleHierarchy={currentUserRoleHierarchy}
                accountSlug={account.slug as string}
              >
                <Button size={'sm'} data-testid={'invite-members-form-trigger'}>
                  <PlusCircle className={'w-4'} />

                  <span>
                    <Trans i18nKey={'teams.inviteMembersButton'} />
                  </span>
                </Button>
              </InviteMembersDialogContainer>
            </If>
          </CardHeader>

          <CardContent>
            <AccountMembersTable
              userRoleHierarchy={currentUserRoleHierarchy}
              currentUserId={user.id}
              currentAccountId={account.id}
              members={members}
              isPrimaryOwner={isPrimaryOwner}
              canManageRoles={canManageRoles}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={'flex flex-row justify-between'}>
            <div className={'flex flex-col space-y-1.5'}>
              <CardTitle>
                <Trans i18nKey={'teams.pendingInvitesHeading'} />
              </CardTitle>

              <CardDescription>
                <Trans i18nKey={'teams.pendingInvitesDescription'} />
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            <AccountInvitationsTable
              permissions={{
                canUpdateInvitation: canManageRoles,
                canRemoveInvitation: canManageRoles,
                currentUserRoleHierarchy,
              }}
              invitations={invitations}
            />
          </CardContent>
        </Card>
      </div>
    </PageBody>
  );
}
