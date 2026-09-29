'use client';

import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useSelector } from '@tanstack/react-store';

import { VerifyOtpForm } from '@pymekit/otp/components';
import { useUser } from '@pymekit/supabase/hooks/use-user';
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

import { TransferOwnershipConfirmationSchema } from '../../schema/transfer-ownership-confirmation.schema';
import { transferOwnershipFunction } from '../../server/functions/team-members.functions';

export function TransferOwnershipDialog({
  open,
  onOpenChange,
  targetDisplayName,
  accountId,
  userId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  userId: string;
  targetDisplayName: string;
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
            <Trans i18nKey="teams.transferOwnership" />
          </AlertDialogTitle>

          <AlertDialogDescription>
            <Trans i18nKey="teams.transferOwnershipDescription" />
          </AlertDialogDescription>
        </AlertDialogHeader>

        <TransferOrganizationOwnershipForm
          accountId={accountId}
          userId={userId}
          targetDisplayName={targetDisplayName}
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

function TransferOrganizationOwnershipForm({
  accountId,
  userId,
  targetDisplayName,
  isPending,
  setIsPending,
  onSuccess,
}: {
  userId: string;
  accountId: string;
  targetDisplayName: string;
  isPending: boolean;
  setIsPending: (pending: boolean) => void;
  onSuccess: () => unknown;
}) {
  const { data: user } = useUser();

  const router = useRouter();
  const transferOwnership = useServerFn(transferOwnershipFunction);

  const mutation = useMutation({
    mutationFn: (data: { accountId: string; userId: string; otp: string }) =>
      transferOwnership({ data }),
    onMutate: () => setIsPending(true),
    onSuccess: async () => {
      await router.invalidate();
      onSuccess();
    },
    onSettled: () => setIsPending(false),
  });

  const form = useForm({
    defaultValues: {
      accountId,
      userId,
      otp: '',
    },
    validators: {
      onChange: TransferOwnershipConfirmationSchema,
      onSubmit: TransferOwnershipConfirmationSchema,
    },
    onSubmit: ({ value }) => {
      mutation.mutate(value);
    },
  });

  const otp = useSelector(form.store, (state) => state.values.otp);

  // If no OTP has been entered yet, show the OTP verification form
  if (!otp) {
    return (
      <div className="flex flex-col space-y-6">
        <VerifyOtpForm
          purpose={`transfer-team-ownership-${accountId}`}
          email={user?.email || ''}
          onSuccess={(otpValue) => {
            form.setFieldValue('otp', otpValue);
          }}
          CancelButton={
            <AlertDialogCancel disabled={isPending}>
              <Trans i18nKey={'common.cancel'} />
            </AlertDialogCancel>
          }
          data-testid="verify-otp-form"
        />
      </div>
    );
  }

  return (
    <form
      className={'flex flex-col space-y-4 text-sm'}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <If condition={mutation.isError}>
        <TransferOwnershipErrorAlert />
      </If>

      <div className="border-destructive rounded-md border p-4">
        <p className="text-destructive text-sm">
          <Trans
            i18nKey={'teams.transferOwnershipDisclaimer'}
            values={{
              member: targetDisplayName,
            }}
            components={{ b: <b /> }}
          />
        </p>
      </div>

      <input type="hidden" name="otp" value={otp} />

      <div>
        <p className={'text-muted-foreground'}>
          <Trans i18nKey={'common.modalConfirmationQuestion'} />
        </p>
      </div>

      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending}>
          <Trans i18nKey={'common.cancel'} />
        </AlertDialogCancel>

        <Button
          type={'submit'}
          data-testid={'confirm-transfer-ownership-button'}
          variant={'destructive'}
          disabled={isPending}
        >
          <If
            condition={isPending}
            fallback={<Trans i18nKey={'teams.transferOwnership'} />}
          >
            <Trans i18nKey={'teams.transferringOwnership'} />
          </If>
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

function TransferOwnershipErrorAlert() {
  return (
    <Alert variant={'destructive'}>
      <AlertTitle>
        <Trans i18nKey={'teams.transferTeamErrorHeading'} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={'teams.transferTeamErrorMessage'} />
      </AlertDescription>
    </Alert>
  );
}
