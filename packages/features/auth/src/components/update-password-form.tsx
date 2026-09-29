'use client';

import { useForm } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import { useSelector } from '@tanstack/react-store';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { useUpdateUser } from '@pymekit/supabase/hooks/use-update-user-mutation';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import { Button } from '@pymekit/ui/button';
import { Field, FieldDescription, FieldError } from '@pymekit/ui/field';
import { Heading } from '@pymekit/ui/heading';
import { toast } from '@pymekit/ui/sonner';
import { Trans } from '@pymekit/ui/trans';

import { PasswordResetSchema } from '../schemas/password-reset.schema';
import { PasswordInput } from './password-input';

export function UpdatePasswordForm(params: {
  redirectTo: string;
  heading?: React.ReactNode;
}) {
  const updateUser = useUpdateUser();
  const navigate = useNavigate();
  const t = useTranslations();

  const form = useForm({
    defaultValues: {
      password: '',
      repeatPassword: '',
    },
    validators: {
      onChange: PasswordResetSchema,
      onSubmit: PasswordResetSchema,
    },
    onSubmit: async ({ value }) => {
      await updateUser.mutateAsync({
        password: value.password,
        redirectTo: params.redirectTo,
      });

      await navigate({ href: params.redirectTo, replace: true });

      toast.success(t('account.updatePasswordSuccessMessage'));
    },
  });

  // Only surface validation errors once the user has attempted to submit.
  const submissionAttempts = useSelector(
    form.store,
    (state) => state.submissionAttempts,
  );

  if (updateUser.error) {
    const error = updateUser.error as unknown as { code: string };

    return <ErrorState error={error} onRetry={() => updateUser.reset()} />;
  }

  return (
    <div className={'flex w-full flex-col space-y-6'}>
      <div className={'flex justify-center'}>
        {params.heading && (
          <Heading className={'text-center'} level={4}>
            {params.heading}
          </Heading>
        )}
      </div>

      <form
        className={'flex w-full flex-1 flex-col'}
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <div className={'flex-col space-y-2.5'}>
          <form.Field name={'password'}>
            {(field) => {
              const isInvalid =
                submissionAttempts > 0 && !field.state.meta.isValid;

              return (
                <Field data-invalid={isInvalid}>
                  <PasswordInput
                    autoComplete={'new-password'}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                  />

                  <FieldError
                    errors={isInvalid ? field.state.meta.errors : []}
                  />
                </Field>
              );
            }}
          </form.Field>

          <form.Field name={'repeatPassword'}>
            {(field) => {
              const isInvalid =
                submissionAttempts > 0 && !field.state.meta.isValid;

              return (
                <Field data-invalid={isInvalid}>
                  <PasswordInput
                    autoComplete={'new-password'}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                  />

                  <FieldDescription>
                    <Trans i18nKey={'common.repeatPassword'} />
                  </FieldDescription>

                  <FieldError
                    errors={isInvalid ? field.state.meta.errors : []}
                  />
                </Field>
              );
            }}
          </form.Field>

          <Button
            disabled={updateUser.isPending}
            type="submit"
            className={'w-full'}
          >
            <Trans i18nKey={'auth.passwordResetLabel'} />
          </Button>
        </div>
      </form>
    </div>
  );
}

function ErrorState(props: {
  onRetry: () => void;
  error: {
    code: string;
  };
}) {
  const t = useTranslations('auth');

  // use-intl has no i18next-style `defaultValue` option, so we check
  // catalog membership and fall back to a generic error message.
  const errorKey = `errors.${props.error.code}` as never;

  const errorMessage = t.has(errorKey) ? t(errorKey) : t('resetPasswordError');

  return (
    <div className={'flex flex-col space-y-4'}>
      <Alert variant={'destructive'}>
        <TriangleAlert className={'s-6'} />

        <AlertTitle>
          <Trans i18nKey={'common.genericError'} />
        </AlertTitle>

        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>

      <Button onClick={props.onRetry} variant={'outline'}>
        <Trans i18nKey={'common.retry'} />
      </Button>
    </div>
  );
}
