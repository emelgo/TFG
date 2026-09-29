'use client';

import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
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
  AlertDialogTrigger,
} from '@pymekit/ui/alert-dialog';
import { Button } from '@pymekit/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@pymekit/ui/field';
import { If } from '@pymekit/ui/if';
import { Input } from '@pymekit/ui/input';

import { deleteAccountFunction } from '../lib/server/admin.functions';
import { DeleteAccountSchema } from '../lib/server/schema/admin-actions.schema';

export function AdminDeleteAccountDialog(
  props: React.PropsWithChildren<{
    accountId: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }>,
) {
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <If condition={props.children}>
        <AlertDialogTrigger render={props.children as React.ReactElement} />
      </If>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Account</AlertDialogTitle>

          <AlertDialogDescription>
            Are you sure you want to delete this account? All the data
            associated with this account will be permanently deleted. Any active
            subscriptions will be canceled.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <DeleteAccountForm accountId={props.accountId} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteAccountForm(props: { accountId: string }) {
  const deleteAccount = useServerFn(deleteAccountFunction);

  const mutation = useMutation({
    mutationFn: (data: { accountId: string; confirmation: string }) =>
      deleteAccount({ data }),
  });

  const form = useForm({
    defaultValues: {
      accountId: props.accountId,
      confirmation: '',
    },
    validators: {
      onChange: DeleteAccountSchema,
      onSubmit: DeleteAccountSchema,
    },
    onSubmit: ({ value }) => mutation.mutate(value),
  });

  return (
    <form
      data-testid={'admin-delete-account-form'}
      className={'flex flex-col space-y-8'}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <If condition={mutation.isError}>
        <Alert variant={'destructive'}>
          <AlertTitle>Error</AlertTitle>

          <AlertDescription>
            There was an error deleting the account. Please check the server
            logs to see what went wrong.
          </AlertDescription>
        </Alert>
      </If>

      <form.Field name={'confirmation'}>
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>
                Type <b>CONFIRM</b> to confirm
              </FieldLabel>

              <Input
                id={field.name}
                pattern={'CONFIRM'}
                required
                placeholder={'Type CONFIRM to confirm'}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={isInvalid}
              />

              <FieldDescription>
                Are you sure you want to do this? This action cannot be undone.
              </FieldDescription>

              <FieldError errors={field.state.meta.errors} />
            </Field>
          );
        }}
      </form.Field>

      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>

        <Button
          disabled={mutation.isPending}
          type={'submit'}
          variant={'destructive'}
        >
          {mutation.isPending ? 'Deleting...' : 'Delete'}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
