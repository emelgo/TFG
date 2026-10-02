'use client';

import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
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
import { useAsyncDialog } from '@pymekit/ui/hooks/use-async-dialog';
import { If } from '@pymekit/ui/if';
import { Input } from '@pymekit/ui/input';
import { Trans } from '@pymekit/ui/trans';

import { banUserFunction } from '../lib/server/admin.functions';
import { BanUserSchema } from '../lib/server/schema/admin-actions.schema';

export function AdminBanUserDialog(
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
          <AlertDialogTitle>
            <Trans i18nKey={'admin.banTitle'} />
          </AlertDialogTitle>

          <AlertDialogDescription>
            <Trans i18nKey={'admin.banDescription'} />
          </AlertDialogDescription>
        </AlertDialogHeader>

        <BanUserForm
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

function BanUserForm(props: {
  userId: string;
  isPending: boolean;
  setIsPending: (pending: boolean) => void;
  onSuccess: () => void;
}) {
  const banUser = useServerFn(banUserFunction);
  const router = useRouter();

  const t = useTranslations('admin');

  const mutation = useMutation({
    mutationFn: (data: { userId: string; confirmation: string }) =>
      banUser({ data }),
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
      onChange: BanUserSchema,
      onSubmit: BanUserSchema,
    },
    onSubmit: ({ value }) => mutation.mutate(value),
  });

  return (
    <form
      data-testid={'admin-ban-user-form'}
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
            <Trans i18nKey={'admin.banError'} />
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
                <Trans i18nKey={'admin.confirmHint'} />
              </FieldDescription>

              <FieldError errors={field.state.meta.errors} />
            </Field>
          );
        }}
      </form.Field>

      <AlertDialogFooter>
        <AlertDialogCancel disabled={props.isPending}>
          <Trans i18nKey={'admin.cancel'} />
        </AlertDialogCancel>

        <Button
          disabled={props.isPending}
          type={'submit'}
          variant={'destructive'}
        >
          {props.isPending ? (
            <Trans i18nKey={'admin.banPending'} />
          ) : (
            <Trans i18nKey={'admin.banTitle'} />
          )}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
