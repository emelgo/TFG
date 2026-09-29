'use client';

import { useMemo, useState } from 'react';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import type { ColumnDef } from '@tanstack/react-table';
import { Ellipsis } from 'lucide-react';
import { useFormatter, useTranslations } from 'use-intl';

import type { Database } from '@pymekit/supabase/database';
import { Badge } from '@pymekit/ui/badge';
import { badgeExtras } from '@pymekit/ui/badge-extras';
import { Button } from '@pymekit/ui/button';
import { DataTable } from '@pymekit/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@pymekit/ui/dropdown-menu';
import { If } from '@pymekit/ui/if';
import { Input } from '@pymekit/ui/input';
import { ProfileAvatar } from '@pymekit/ui/profile-avatar';
import { toast } from '@pymekit/ui/sonner';
import { Trans } from '@pymekit/ui/trans';

import { getCanResendInvitation } from '../../schema/resend-invitation.schema';
import { resendInvitationFunction } from '../../server/functions/team-invitations.functions';
import { RoleBadge } from '../members/role-badge';
import { DeleteInvitationDialog } from './delete-invitation-dialog';
import { RenewInvitationDialog } from './renew-invitation-dialog';
import { UpdateInvitationDialog } from './update-invitation-dialog';

type Invitations =
  Database['public']['Functions']['get_account_invitations']['Returns'];

type AccountInvitationsTableProps = {
  invitations: Invitations;

  permissions: {
    canUpdateInvitation: boolean;
    canRemoveInvitation: boolean;
    currentUserRoleHierarchy: number;
  };
};

export function AccountInvitationsTable({
  invitations,
  permissions,
}: AccountInvitationsTableProps) {
  const t = useTranslations('teams');
  const [search, setSearch] = useState('');
  const columns = useGetColumns(permissions);

  const filteredInvitations = invitations.filter((member) => {
    const searchString = search.toLowerCase();

    const email = (
      member.email.split('@')[0]?.toLowerCase() ?? ''
    ).toLowerCase();

    return (
      email.includes(searchString) ||
      member.role.toLowerCase().includes(searchString)
    );
  });

  return (
    <div className={'flex flex-col space-y-2'}>
      <Input
        value={search}
        onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
        placeholder={t(`searchInvitations`)}
      />

      <DataTable
        data-cy={'invitations-table'}
        columns={columns}
        data={filteredInvitations}
      />
    </div>
  );
}

function useGetColumns(permissions: {
  canUpdateInvitation: boolean;
  canRemoveInvitation: boolean;
  currentUserRoleHierarchy: number;
}): ColumnDef<Invitations[0]>[] {
  const t = useTranslations('teams');
  const format = useFormatter();

  return useMemo(
    () => [
      {
        header: t('emailLabel'),
        size: 200,
        cell: ({ row }) => {
          const member = row.original;
          const email = member.email;

          return (
            <span
              data-testid={'invitation-email'}
              className={'flex items-center gap-x-2 text-left'}
            >
              <span>
                <ProfileAvatar text={email} />
              </span>

              <span>{email}</span>
            </span>
          );
        },
      },
      {
        header: t('roleLabel'),
        cell: ({ row }) => {
          const { role } = row.original;

          return <RoleBadge role={role} />;
        },
      },
      {
        header: t('invitedAtLabel'),
        cell: ({ row }) => {
          return format.dateTime(new Date(row.original.created_at), {
            dateStyle: 'medium',
          });
        },
      },
      {
        header: t('sentAtLabel'),
        cell: ({ row }) => {
          if (!row.original.sent_at) {
            return (
              <span className={'text-muted-foreground'}>
                {t('notSentLabel')}
              </span>
            );
          }

          return format.dateTime(new Date(row.original.sent_at), {
            dateStyle: 'medium',
          });
        },
      },
      {
        header: t('expiresAtLabel'),
        cell: ({ row }) => {
          return format.dateTime(new Date(row.original.expires_at), {
            dateStyle: 'medium',
          });
        },
      },
      {
        header: t('inviteStatus'),
        cell: ({ row }) => {
          const isExpired = getIsInviteExpired(row.original.expires_at);

          if (isExpired) {
            return (
              <Badge className={badgeExtras.warning}>{t('expired')}</Badge>
            );
          }

          return <Badge className={badgeExtras.success}>{t('active')}</Badge>;
        },
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) => (
          <ActionsDropdown
            permissions={permissions}
            invitation={row.original}
          />
        ),
      },
    ],
    [permissions, t, format],
  );
}

function ActionsDropdown({
  permissions,
  invitation,
}: {
  permissions: AccountInvitationsTableProps['permissions'];
  invitation: Invitations[0];
}) {
  const [isDeletingInvite, setIsDeletingInvite] = useState(false);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [isRenewingInvite, setIsRenewingInvite] = useState(false);
  const t = useTranslations('teams');
  const router = useRouter();
  const resendInvitation = useServerFn(resendInvitationFunction);

  const resendMutation = useMutation({
    mutationFn: () =>
      resendInvitation({
        data: {
          invitationId: invitation.id,
        },
      }),
    onSuccess: async () => {
      toast.success(t('resendInvitationSuccessMessage'));
      await router.invalidate();
    },
    onError: () => {
      toast.error(t('resendInvitationErrorMessage'));
    },
  });

  const canResendInvitation =
    !getIsInviteExpired(invitation.expires_at) &&
    getCanResendInvitation(invitation);

  if (!permissions.canUpdateInvitation && !permissions.canRemoveInvitation) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant={'ghost'} size={'icon'}>
              <Ellipsis className={'h-5 w-5'} />
            </Button>
          }
        />

        <DropdownMenuContent className="min-w-52">
          <If condition={permissions.canUpdateInvitation}>
            <DropdownMenuItem
              data-testid={'update-invitation-trigger'}
              onClick={() => setIsUpdatingRole(true)}
            >
              <Trans i18nKey={'teams.updateInvitation'} />
            </DropdownMenuItem>

            <If condition={getIsInviteExpired(invitation.expires_at)}>
              <DropdownMenuItem
                data-testid={'renew-invitation-trigger'}
                onClick={() => setIsRenewingInvite(true)}
              >
                <Trans i18nKey={'teams.renewInvitation'} />
              </DropdownMenuItem>
            </If>

            <If condition={canResendInvitation}>
              <DropdownMenuItem
                data-testid={'resend-invitation-trigger'}
                disabled={resendMutation.isPending}
                onClick={() => resendMutation.mutate()}
              >
                <Trans i18nKey={'teams.resendInvitation'} />
              </DropdownMenuItem>
            </If>
          </If>

          <If condition={permissions.canRemoveInvitation}>
            <DropdownMenuItem
              data-testid={'remove-invitation-trigger'}
              variant="destructive"
              onClick={() => setIsDeletingInvite(true)}
            >
              <Trans i18nKey={'teams.removeInvitation'} />
            </DropdownMenuItem>
          </If>
        </DropdownMenuContent>
      </DropdownMenu>

      <If condition={isDeletingInvite}>
        <DeleteInvitationDialog
          isOpen
          setIsOpen={setIsDeletingInvite}
          invitationId={invitation.id}
        />
      </If>

      <If condition={isUpdatingRole}>
        <UpdateInvitationDialog
          isOpen
          setIsOpen={setIsUpdatingRole}
          invitationId={invitation.id}
          userRole={invitation.role}
          userRoleHierarchy={permissions.currentUserRoleHierarchy}
        />
      </If>

      <If condition={isRenewingInvite}>
        <RenewInvitationDialog
          isOpen
          setIsOpen={setIsRenewingInvite}
          invitationId={invitation.id}
          email={invitation.email}
        />
      </If>
    </>
  );
}

function getIsInviteExpired(isoExpiresAt: string) {
  const currentIsoTime = new Date().toISOString();

  const isoExpiresAtDate = new Date(isoExpiresAt);
  const currentIsoTimeDate = new Date(currentIsoTime);

  return isoExpiresAtDate < currentIsoTimeDate;
}
