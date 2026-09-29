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

import { deleteInvitationFunction } from '../../server/functions/team-invitations.functions';

export function DeleteInvitationDialog({
  isOpen,
  setIsOpen,
  invitationId,
}: {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  invitationId: number;
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
            <Trans i18nKey="teams.deleteInvitation" />
          </AlertDialogTitle>

          <AlertDialogDescription>
            <Trans i18nKey="teams.deleteInvitationDialogDescription" />
          </AlertDialogDescription>
        </AlertDialogHeader>

        <DeleteInvitationForm
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

function DeleteInvitationForm({
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
  const deleteInvitation = useServerFn(deleteInvitationFunction);

  const mutation = useMutation({
    mutationFn: (data: { invitationId: number }) => deleteInvitation({ data }),
    onMutate: () => setIsPending(true),
    onSuccess: async () => {
      await router.invalidate();
      onSuccess();
    },
    onSettled: () => setIsPending(false),
  });

  return (
    <form
      data-testid={'delete-invitation-form'}
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
          <RemoveInvitationErrorAlert />
        </If>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            <Trans i18nKey={'common.cancel'} />
          </AlertDialogCancel>

          <Button type={'submit'} variant={'destructive'} disabled={isPending}>
            <Trans i18nKey={'teams.deleteInvitation'} />
          </Button>
        </AlertDialogFooter>
      </div>
    </form>
  );
}

function RemoveInvitationErrorAlert() {
  return (
    <Alert variant={'destructive'}>
      <AlertTitle>
        <Trans i18nKey={'teams.deleteInvitationErrorTitle'} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={'teams.deleteInvitationErrorMessage'} />
      </AlertDescription>
    </Alert>
  );
}
