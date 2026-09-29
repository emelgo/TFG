'use client';

import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { TriangleAlert } from 'lucide-react';

import { VerifyOtpForm } from '@pymekit/otp/components';
import { useUser } from '@pymekit/supabase/hooks/use-user';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@pymekit/ui/alert-dialog';
import { Button } from '@pymekit/ui/button';
import { If } from '@pymekit/ui/if';
import { Trans } from '@pymekit/ui/trans';

import { DeletePersonalAccountSchema } from '../../schema/delete-personal-account.schema';
import { deletePersonalAccountFunction } from '../../server/personal-accounts.functions';

export function AccountDangerZone() {
  return (
    <div className={'flex flex-col space-y-4'}>
      <div className={'flex flex-col space-y-1'}>
        <span className={'text-sm font-medium'}>
          <Trans i18nKey={'account.deleteAccount'} />
        </span>

        <p className={'text-muted-foreground text-sm'}>
          <Trans i18nKey={'account.deleteAccountDescription'} />
        </p>
      </div>

      <div>
        <DeleteAccountModal />
      </div>
    </div>
  );
}

function DeleteAccountModal() {
  const { data: user } = useUser();

  if (!user?.email) {
    return null;
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button data-testid={'delete-account-button'} variant={'destructive'}>
            <Trans i18nKey={'account.deleteAccount'} />
          </Button>
        }
      />

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans i18nKey={'account.deleteAccount'} />
          </AlertDialogTitle>
        </AlertDialogHeader>

        <DeleteAccountForm email={user.email} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteAccountForm(props: { email: string }) {
  const deleteAccount = useServerFn(deletePersonalAccountFunction);

  const deleteAccountMutation = useMutation({
    mutationFn: (otp: string) => deleteAccount({ data: { otp } }),
  });

  const form = useForm({
    defaultValues: {
      otp: '',
    },
    validators: {
      onChange: DeletePersonalAccountSchema,
      onSubmit: DeletePersonalAccountSchema,
    },
  });

  return (
    <form.Subscribe
      selector={(state) => ({
        otp: state.values.otp,
        isValid: state.isValid,
      })}
    >
      {({ otp, isValid }) => {
        if (!otp) {
          return (
            <VerifyOtpForm
              purpose={'delete-personal-account'}
              email={props.email}
              onSuccess={(otp) => form.setFieldValue('otp', otp)}
              CancelButton={
                <AlertDialogCancel>
                  <Trans i18nKey={'common.cancel'} />
                </AlertDialogCancel>
              }
            />
          );
        }

        return (
          <form
            data-testid={'delete-account-form'}
            onSubmit={(e) => {
              e.preventDefault();
              deleteAccountMutation.mutate(otp);
            }}
            className={'flex flex-col space-y-4'}
          >
            <If condition={deleteAccountMutation.isError}>
              <DeleteAccountErrorAlert />
            </If>

            <div className={'flex flex-col space-y-6'}>
              <div
                className={
                  'border-destructive text-destructive rounded-md border p-4 text-sm'
                }
              >
                <div className={'flex flex-col space-y-2'}>
                  <div>
                    <Trans i18nKey={'account.deleteAccountDescription'} />
                  </div>

                  <div>
                    <Trans i18nKey={'common.modalConfirmationQuestion'} />
                  </div>
                </div>
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>
                <Trans i18nKey={'common.cancel'} />
              </AlertDialogCancel>

              <Button
                data-testid={'confirm-delete-account-button'}
                type={'submit'}
                disabled={deleteAccountMutation.isPending || !isValid}
                name={'action'}
                variant={'destructive'}
              >
                {deleteAccountMutation.isPending ? (
                  <Trans i18nKey={'account.deletingAccount'} />
                ) : (
                  <Trans i18nKey={'account.deleteAccount'} />
                )}
              </Button>
            </AlertDialogFooter>
          </form>
        );
      }}
    </form.Subscribe>
  );
}

function DeleteAccountErrorAlert() {
  return (
    <Alert variant={'destructive'}>
      <TriangleAlert className={'h-4'} />

      <AlertTitle>
        <Trans i18nKey={'account.deleteAccountErrorHeading'} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={'common.genericError'} />
      </AlertDescription>
    </Alert>
  );
}
