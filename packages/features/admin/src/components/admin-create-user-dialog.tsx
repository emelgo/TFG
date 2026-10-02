'use client';

import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useTranslations } from 'use-intl';
import type { z } from 'zod';

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
import { Checkbox } from '@pymekit/ui/checkbox';
import { Field, FieldDescription, FieldError } from '@pymekit/ui/field';
import { FieldLabelWithHelp } from '@pymekit/ui/field-help';
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { If } from '@pymekit/ui/if';
import { Input } from '@pymekit/ui/input';
import { toast } from '@pymekit/ui/sonner';
import { Trans } from '@pymekit/ui/trans';

import { createUserFunction } from '../lib/server/admin.functions';
import { CreateUserSchema } from '../lib/server/schema/create-user.schema';

export function AdminCreateUserDialog(props: React.PropsWithChildren) {
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog();

  const t = useTranslations('admin');

  const createUser = useServerFn(createUserFunction);
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: (data: {
      email: string;
      password: string;
      emailConfirm?: boolean;
    }) => createUser({ data }),
    onMutate: () => setIsPending(true),
    onSuccess: async () => {
      toast.success(t('createToastSuccess'));
      form.reset();
      await router.invalidate();
      setOpen(false);
    },
    onSettled: () => setIsPending(false),
  });

  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
      emailConfirm: false,
    } as z.input<typeof CreateUserSchema>,
    validators: {
      onChange: CreateUserSchema,
      onSubmit: CreateUserSchema,
    },
    onSubmit: ({ value }) => mutation.mutate(value),
  });

  const error = mutation.isError
    ? ((mutation.error as Error)?.message ?? t('createError'))
    : null;

  return (
    <AlertDialog
      open={dialogProps.open}
      onOpenChange={dialogProps.onOpenChange}
    >
      <AlertDialogTrigger render={props.children as React.ReactElement} />

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans i18nKey={'admin.createTitle'} />
          </AlertDialogTitle>

          <AlertDialogDescription>
            <Trans i18nKey={'admin.createDescription'} />
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form
          data-testid={'admin-create-user-form'}
          className={'flex flex-col space-y-4'}
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <If condition={!!error}>
            <Alert variant={'destructive'}>
              <AlertTitle>
                <Trans i18nKey={'admin.error'} />
              </AlertTitle>

              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </If>

          <form.Field name={'email'}>
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabelWithHelp
                    htmlFor={field.name}
                    help={<Trans i18nKey={'admin.emailHelp'} />}
                  >
                    <Trans i18nKey={'admin.email'} />
                  </FieldLabelWithHelp>

                  <Input
                    id={field.name}
                    required
                    type="email"
                    placeholder={'user@example.com'}
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

          <form.Field name={'password'}>
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabelWithHelp
                    htmlFor={field.name}
                    help={<Trans i18nKey={'admin.passwordHelp'} />}
                  >
                    <Trans i18nKey={'admin.password'} />
                  </FieldLabelWithHelp>

                  <Input
                    id={field.name}
                    required
                    type="password"
                    placeholder={t('password')}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                  />

                  <FieldDescription>
                    <Trans i18nKey={'admin.passwordHint'} />
                  </FieldDescription>

                  <FieldError errors={field.state.meta.errors} />
                </Field>
              );
            }}
          </form.Field>

          <form.Field name={'emailConfirm'}>
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;

              return (
                <Field
                  data-invalid={isInvalid}
                  className="flex flex-row items-start space-y-0 space-x-3 rounded-md border p-4"
                >
                  <Checkbox
                    checked={field.state.value}
                    onCheckedChange={(checked) =>
                      field.handleChange(checked === true)
                    }
                  />

                  <div className="flex flex-col space-y-1">
                    <FieldLabelWithHelp
                      htmlFor={field.name}
                      help={<Trans i18nKey={'admin.autoConfirmEmailHelp'} />}
                    >
                      <Trans i18nKey={'admin.autoConfirmEmail'} />
                    </FieldLabelWithHelp>

                    <FieldDescription>
                      <Trans i18nKey={'admin.autoConfirmEmailHint'} />
                    </FieldDescription>
                  </div>
                </Field>
              );
            }}
          </form.Field>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              <Trans i18nKey={'admin.cancel'} />
            </AlertDialogCancel>

            <Button disabled={isPending} type={'submit'}>
              {isPending ? (
                <Trans i18nKey={'admin.creating'} />
              ) : (
                <Trans i18nKey={'admin.createUser'} />
              )}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
