'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';

import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pymekit/ui/alert-dialog';
import { Button } from '@pymekit/ui/button';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { If } from '@pymekit/ui/if';
import { Trans } from '@pymekit/ui/trans';

import { renewInvitationFunction } from '../../server/functions/team-invitations.functions';

export function RenewInvitationDialog({
  isOpen,
  setIsOpen,
  invitationId,
  email,
}: {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  invitationId: number;
  email: string;
}) {
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog({
    open: isOpen,
    onOpenChange: setIsOpen,
  });

  return (
    <AlertDialog
      open={dialogProps.open}
      onOpenChange={dialogProps.onOpenChange}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans i18nKey="teams.renewInvitation" />
          </AlertDialogTitle>

          <AlertDialogDescription>
            <Trans
              i18nKey="teams.renewInvitationDialogDescription"
              values={{ email }}
            />
          </AlertDialogDescription>
        </AlertDialogHeader>

        <RenewInvitationForm
          invitationId={invitationId}
          isPending={isPending}
          setIsPending={setIsPending}
          onSuccess={() => {
            setIsPending(false);
            setOpen(false);
          }}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RenewInvitationForm({
  invitationId,
  isPending,
  setIsPending,
  onSuccess,
}: {
  invitationId: number;
  isPending: boolean;
  setIsPending: (pending: boolean) => void;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const renewInvitation = useServerFn(renewInvitationFunction);

  const mutation = useMutation({
    mutationFn: (data: { invitationId: number }) => renewInvitation({ data }),
    onMutate: () => setIsPending(true),
    onSuccess: async () => {
      await router.invalidate();
      onSuccess();
    },
    onSettled: () => setIsPending(false),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate({ invitationId });
      }}
    >
      <div className={'flex flex-col space-y-6'}>
        <p className={'text-muted-foreground text-sm'}>
          <Trans i18nKey={'common.modalConfirmationQuestion'} />
        </p>

        <If condition={mutation.isError}>
          <RenewInvitationErrorAlert />
        </If>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            <Trans i18nKey={'common.cancel'} />
          </AlertDialogCancel>

          <Button
            type={'submit'}
            data-testid={'confirm-renew-invitation'}
            disabled={isPending}
          >
            <Trans i18nKey={'teams.renewInvitation'} />
          </Button>
        </AlertDialogFooter>
      </div>
    </form>
  );
}

function RenewInvitationErrorAlert() {
  return (
    <Alert variant={'destructive'}>
      <AlertTitle>
        <Trans i18nKey={'teams.renewInvitationErrorTitle'} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={'teams.renewInvitationErrorDescription'} />
      </AlertDescription>
    </Alert>
  );
}
