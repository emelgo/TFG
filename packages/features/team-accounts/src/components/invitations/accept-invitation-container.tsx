'use client';

import { useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';

import { Button } from '@pymekit/ui/button';
import { Heading } from '@pymekit/ui/heading';
import { If } from '@pymekit/ui/if';
import { Separator } from '@pymekit/ui/separator';
import { Trans } from '@pymekit/ui/trans';

import { acceptInvitationFunction } from '../../server/functions/team-invitations.functions';
import { SignOutInvitationButton } from './sign-out-invitation-button';

export function AcceptInvitationContainer(props: {
  inviteToken: string;
  email: string;

  invitation: {
    id: string;

    account: {
      name: string;
      id: string;
      picture_url: string | null;
    };
  };

  paths: {
    signOutNext: string;
    nextPath: string;
  };
}) {
  const acceptInvitation = useServerFn(acceptInvitationFunction);

  const mutation = useMutation({
    mutationFn: (data: { inviteToken: string; nextPath: string }) =>
      acceptInvitation({ data }),
  });

  return (
    <div className={'flex flex-col items-center space-y-4'}>
      <Heading className={'text-center'} level={4}>
        <Trans
          i18nKey={'teams.acceptInvitationHeading'}
          values={{
            accountName: props.invitation.account.name,
          }}
        />
      </Heading>

      <If condition={props.invitation.account.picture_url}>
        {(url) => (
          <img
            alt={'Logo'}
            src={url}
            width={64}
            height={64}
            className={'object-cover'}
          />
        )}
      </If>

      <div className={'text-muted-foreground text-center text-sm'}>
        <Trans
          i18nKey={'teams.acceptInvitationDescription'}
          values={{
            accountName: props.invitation.account.name,
          }}
        />
      </div>

      <div className={'flex flex-col space-y-4'}>
        <form
          data-testid={'join-team-form'}
          className={'w-full'}
          onSubmit={(e) => {
            e.preventDefault();

            mutation.mutate({
              inviteToken: props.inviteToken,
              nextPath: props.paths.nextPath,
            });
          }}
        >
          <Button
            type={'submit'}
            className={'w-full'}
            disabled={mutation.isPending}
          >
            <Trans
              i18nKey={
                mutation.isPending ? 'teams.joiningTeam' : 'teams.continueAs'
              }
              values={{
                accountName: props.invitation.account.name,
                email: props.email,
              }}
            />
          </Button>
        </form>

        <Separator />

        <SignOutInvitationButton nextPath={props.paths.signOutNext} />

        <span className={'text-muted-foreground text-center text-xs'}>
          <Trans i18nKey={'teams.signInWithDifferentAccountDescription'} />
        </span>
      </div>
    </div>
  );
}
