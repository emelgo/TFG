'use client';

import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useTranslations } from 'use-intl';

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
import { Trans } from '@pymekit/ui/trans';

import { deleteUserFunction } from '../lib/server/admin.functions';
import { DeleteUserSchema } from '../lib/server/schema/admin-actions.schema';

export function AdminDeleteUserDialog(
  props: React.PropsWithChildren<{
    userId: string;
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
          <AlertDialogTitle>
            <Trans i18nKey={'admin.deleteUserTitle'} />
          </AlertDialogTitle>

          <AlertDialogDescription>
            <Trans i18nKey={'admin.deleteUserDescription'} />
          </AlertDialogDescription>
        </AlertDialogHeader>

        <DeleteUserForm userId={props.userId} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteUserForm(props: { userId: string }) {
  const deleteUser = useServerFn(deleteUserFunction);

  const t = useTranslations('admin');

  const mutation = useMutation({
    mutationFn: (data: { userId: string; confirmation: string }) =>
      deleteUser({ data }),
  });

  const form = useForm({
    defaultValues: {
      userId: props.userId,
      confirmation: '',
    },
    validators: {
      onChange: DeleteUserSchema,
      onSubmit: DeleteUserSchema,
    },
    onSubmit: ({ value }) => mutation.mutate(value),
  });

  return (
    <form
      data-testid={'admin-delete-user-form'}
      className={'flex flex-col space-y-8'}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <If condition={mutation.isError}>
        <Alert variant={'destructive'}>
          <AlertTitle>
            <Trans i18nKey={'admin.error'} />
          </AlertTitle>

          <AlertDescription>
            <Trans i18nKey={'admin.deleteUserError'} />
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
                <Trans
                  i18nKey={'admin.confirmLabel'}
                  components={{ b: <b /> }}
                />
              </FieldLabel>

              <Input
                id={field.name}
                required
                pattern={'CONFIRMAR'}
                placeholder={t('confirmPlaceholder')}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={isInvalid}
              />

              <FieldDescription>
                <Trans i18nKey={'admin.confirmHintIrreversible'} />
              </FieldDescription>

              <FieldError errors={field.state.meta.errors} />
            </Field>
          );
        }}
      </form.Field>

      <AlertDialogFooter>
        <AlertDialogCancel>
          <Trans i18nKey={'admin.cancel'} />
        </AlertDialogCancel>

        <Button
          disabled={mutation.isPending}
          type={'submit'}
          variant={'destructive'}
        >
          {mutation.isPending ? (
            <Trans i18nKey={'admin.deleting'} />
          ) : (
            <Trans i18nKey={'admin.delete'} />
          )}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
