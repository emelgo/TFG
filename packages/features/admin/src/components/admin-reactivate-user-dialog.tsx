'use client';

import { useForm } from '@tanstack/react-form';
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
  AlertDialogTrigger,
} from '@pymekit/ui/alert-dialog';
import { Button } from '@pymekit/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@pymekit/ui/field';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { If } from '@pymekit/ui/if';
import { Input } from '@pymekit/ui/input';

import { reactivateUserFunction } from '../lib/server/admin.functions';
import { ReactivateUserSchema } from '../lib/server/schema/admin-actions.schema';

export function AdminReactivateUserDialog(
  props: React.PropsWithChildren<{
    userId: string;
  }>,
) {
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog();

  return (
    <AlertDialog
      open={dialogProps.open}
      onOpenChange={dialogProps.onOpenChange}
    >
      <AlertDialogTrigger render={props.children as React.ReactElement} />

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reactivate User</AlertDialogTitle>

          <AlertDialogDescription>
            Are you sure you want to reactivate this user?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ReactivateUserForm
          userId={props.userId}
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

function ReactivateUserForm(props: {
  userId: string;
  isPending: boolean;
  setIsPending: (pending: boolean) => void;
  onSuccess: () => void;
}) {
  const reactivateUser = useServerFn(reactivateUserFunction);
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: (data: { userId: string; confirmation: string }) =>
      reactivateUser({ data }),
    onMutate: () => props.setIsPending(true),
    onSuccess: async () => {
      await router.invalidate();
      props.onSuccess();
    },
    onSettled: () => props.setIsPending(false),
  });

  const form = useForm({
    defaultValues: {
      userId: props.userId,
      confirmation: '',
    },
    validators: {
      onChange: ReactivateUserSchema,
      onSubmit: ReactivateUserSchema,
    },
    onSubmit: ({ value }) => mutation.mutate(value),
  });

  return (
    <form
      data-testid={'admin-reactivate-user-form'}
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
            There was an error reactivating the user. Please check the server
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
                required
                pattern={'CONFIRM'}
                placeholder={'Type CONFIRM to confirm'}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={isInvalid}
              />

              <FieldDescription>
                Are you sure you want to do this?
              </FieldDescription>

              <FieldError errors={field.state.meta.errors} />
            </Field>
          );
        }}
      </form.Field>

      <AlertDialogFooter>
        <AlertDialogCancel disabled={props.isPending}>Cancel</AlertDialogCancel>

        <Button disabled={props.isPending} type={'submit'}>
          {props.isPending ? 'Reactivating...' : 'Reactivate User'}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
