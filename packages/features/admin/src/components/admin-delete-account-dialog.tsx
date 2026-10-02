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
import { Field, FieldDescription, FieldError } from '@pymekit/ui/field';
import { FieldLabelWithHelp } from '@pymekit/ui/field-help';
import { If } from '@pymekit/ui/if';
import { Input } from '@pymekit/ui/input';
import { Trans } from '@pymekit/ui/trans';

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
          <AlertDialogTitle>
            <Trans i18nKey={'admin.deleteAccountTitle'} />
          </AlertDialogTitle>

          <AlertDialogDescription>
            <Trans i18nKey={'admin.deleteAccountDescription'} />
          </AlertDialogDescription>
        </AlertDialogHeader>

        <DeleteAccountForm accountId={props.accountId} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteAccountForm(props: { accountId: string }) {
  const deleteAccount = useServerFn(deleteAccountFunction);

  const t = useTranslations('admin');

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
          <AlertTitle>
            <Trans i18nKey={'admin.error'} />
          </AlertTitle>

          <AlertDescription>
            <Trans i18nKey={'admin.deleteAccountError'} />
          </AlertDescription>
        </Alert>
      </If>

      <form.Field name={'confirmation'}>
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabelWithHelp
                htmlFor={field.name}
                help={<Trans i18nKey={'admin.confirmLabelHelp'} />}
              >
                <Trans
                  i18nKey={'admin.confirmLabel'}
                  components={{ b: <b /> }}
                />
              </FieldLabelWithHelp>

              <Input
                id={field.name}
                pattern={'CONFIRMAR'}
                required
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
