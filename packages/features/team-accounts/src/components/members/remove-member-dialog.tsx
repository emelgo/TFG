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

import { removeMemberFromAccountFunction } from '../../server/functions/team-members.functions';

export function RemoveMemberDialog({
  open,
  onOpenChange,
  teamAccountId,
  userId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamAccountId: string;
  userId: string;
}) {
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog({
    open,
    onOpenChange,
  });

  return (
    <AlertDialog
      open={dialogProps.open}
      onOpenChange={dialogProps.onOpenChange}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans i18nKey="teams.removeMemberModalHeading" />
          </AlertDialogTitle>

          <AlertDialogDescription>
            <Trans i18nKey={'teams.removeMemberModalDescription'} />
          </AlertDialogDescription>
        </AlertDialogHeader>

        <RemoveMemberForm
          accountId={teamAccountId}
          userId={userId}
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

function RemoveMemberForm({
  accountId,
  userId,
  isPending,
  setIsPending,
  onSuccess,
}: {
  accountId: string;
  userId: string;
  isPending: boolean;
  setIsPending: (pending: boolean) => void;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const removeMember = useServerFn(removeMemberFromAccountFunction);

  const mutation = useMutation({
    mutationFn: (data: { accountId: string; userId: string }) =>
      removeMember({ data }),
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
        mutation.mutate({ accountId, userId });
      }}
    >
      <div className={'flex flex-col space-y-6'}>
        <p className={'text-muted-foreground text-sm'}>
          <Trans i18nKey={'common.modalConfirmationQuestion'} />
        </p>

        <If condition={mutation.isError}>
          <RemoveMemberErrorAlert />
        </If>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            <Trans i18nKey={'common.cancel'} />
          </AlertDialogCancel>

          <Button
            type={'submit'}
            data-testid={'confirm-remove-member'}
            variant={'destructive'}
            disabled={isPending}
          >
            <Trans i18nKey={'teams.removeMemberSubmitLabel'} />
          </Button>
        </AlertDialogFooter>
      </div>
    </form>
  );
}

function RemoveMemberErrorAlert() {
  return (
    <Alert variant={'destructive'}>
      <AlertTitle>
        <Trans i18nKey={'teams.removeMemberErrorHeading'} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={'teams.removeMemberErrorMessage'} />
      </AlertDescription>
    </Alert>
  );
}
