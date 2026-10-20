'use client';

import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useTranslations } from 'use-intl';
import * as z from 'zod';

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
import { toast } from '@pymekit/ui/sonner';
import { Trans } from '@pymekit/ui/trans';

import { resetPasswordFunction } from '../lib/server/admin.functions';

const FormSchema = z.object({
  userId: z.uuid(),
  confirmation: z.custom<string>((value) => value === 'CONFIRMAR'),
});

export function AdminResetPasswordDialog(props: {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.children && (
        <AlertDialogTrigger render={props.children as React.ReactElement} />
      )}

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans i18nKey={'admin.resetTitle'} />
          </AlertDialogTitle>

          <AlertDialogDescription>
            <Trans i18nKey={'admin.resetDescription'} />
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="relative">
          <AdminResetPasswordForm
            userId={props.userId}
            onSuccess={() => props.onOpenChange(false)}
          />
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AdminResetPasswordForm({
  userId,
  onSuccess,
}: {
  userId: string;
  onSuccess: () => void;
}) {
  const resetPassword = useServerFn(resetPasswordFunction);

  const t = useTranslations('admin');

  const mutation = useMutation({
    mutationFn: (data: { userId: string; confirmation: string }) =>
      resetPassword({ data }),
    onSuccess: () => {
      toast.success(t('resetToastSuccess'));
      onSuccess();
    },
    onError: () => {
      toast.error(t('resetToastError'));
    },
  });

  const form = useForm({
    defaultValues: {
      userId,
      confirmation: '',
    },
    validators: {
      onChange: FormSchema,
      onSubmit: FormSchema,
    },
    onSubmit: ({ value }) => mutation.mutate(value),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
      className="space-y-4"
    >
      <form.Field name="confirmation">
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabelWithHelp
                htmlFor={field.name}
                help={<Trans i18nKey={'admin.confirmationHelp'} />}
              >
                <Trans i18nKey={'admin.confirmation'} />
              </FieldLabelWithHelp>

              <FieldDescription>
                <Trans i18nKey={'admin.resetConfirmHint'} />
              </FieldDescription>

              <Input
                id={field.name}
                placeholder="CONFIRMAR"
                autoComplete="off"
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={isInvalid}
              />

              <FieldError errors={field.state.meta.errors} />
            </Field>
          );
        }}
      </form.Field>

      <If condition={mutation.isError}>
        <Alert variant="destructive">
          <AlertTitle>
            <Trans i18nKey={'admin.resetErrorTitle'} />
          </AlertTitle>

          <AlertDescription>
            <Trans i18nKey={'admin.resetErrorDescription'} />
          </AlertDescription>
        </Alert>
      </If>

      <If condition={mutation.isSuccess}>
        <Alert>
          <AlertTitle>
            <Trans i18nKey={'admin.resetSuccessTitle'} />
          </AlertTitle>

          <AlertDescription>
            <Trans i18nKey={'admin.resetSuccessDescription'} />
          </AlertDescription>
        </Alert>
      </If>

      <input type="hidden" name="userId" value={userId} />

      <AlertDialogFooter>
        <AlertDialogCancel disabled={mutation.isPending}>
          <Trans i18nKey={'admin.cancel'} />
        </AlertDialogCancel>

        <Button
          type="submit"
          disabled={mutation.isPending}
          variant="destructive"
        >
          {mutation.isPending ? (
            <Trans i18nKey={'admin.sending'} />
          ) : (
            <Trans i18nKey={'admin.sendResetEmail'} />
          )}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
