'use client';

import { useForm } from '@tanstack/react-form';
import { useSelector } from '@tanstack/react-store';
import { useTranslations } from 'use-intl';
import * as z from 'zod';

import { useRequestResetPassword } from '@pymekit/supabase/hooks/use-request-reset-password';
import { Alert, AlertDescription } from '@pymekit/ui/alert';
import { alertExtras } from '@pymekit/ui/alert-extras';
import { Button } from '@pymekit/ui/button';
import { Field, FieldError, FieldLabel } from '@pymekit/ui/field';
import { If } from '@pymekit/ui/if';
import { Input } from '@pymekit/ui/input';
import { Trans } from '@pymekit/ui/trans';

import { useCaptcha } from '../captcha/client';
import { AuthErrorAlert } from './auth-error-alert';

const PasswordResetSchema = z.object({
  email: z.email(),
});

export function PasswordResetRequestContainer(params: {
  redirectPath: string;
  captchaSiteKey?: string;
}) {
  const t = useTranslations('auth');
  const resetPasswordMutation = useRequestResetPassword();
  const captcha = useCaptcha({ siteKey: params.captchaSiteKey });
  const captchaLoading = !captcha.isReady;

  const error = resetPasswordMutation.error;
  const success = resetPasswordMutation.data;

  const form = useForm({
    defaultValues: {
      email: '',
    },
    validators: {
      onChange: PasswordResetSchema,
      onSubmit: PasswordResetSchema,
    },
    onSubmit: ({ value }) => {
      const redirectTo = new URL(params.redirectPath, window.location.origin)
        .href;

      return resetPasswordMutation
        .mutateAsync({
          email: value.email,
          redirectTo,
          captchaToken: captcha.token,
        })
        .catch(() => {
          captcha.reset();
        });
    },
  });

  // Only surface validation errors once the user has attempted to submit.
  const submissionAttempts = useSelector(
    form.store,
    (state) => state.submissionAttempts,
  );

  return (
    <>
      <If condition={success}>
        <Alert className={alertExtras.success}>
          <AlertDescription>
            <Trans i18nKey={'auth.passwordResetSuccessMessage'} />
          </AlertDescription>
        </Alert>
      </If>

      <If condition={!resetPasswordMutation.data}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
          className={'w-full'}
        >
          <div className={'flex flex-col gap-y-4'}>
            <AuthErrorAlert error={error} />

            <form.Field name={'email'}>
              {(field) => {
                const isInvalid =
                  submissionAttempts > 0 && !field.state.meta.isValid;

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel>
                      <Trans i18nKey={'common.emailAddress'} />
                    </FieldLabel>

                    <Input
                      required
                      type="email"
                      placeholder={t('emailPlaceholder')}
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

            {captcha.field}

            <Button
              disabled={resetPasswordMutation.isPending || captchaLoading}
              type="submit"
            >
              <If
                condition={!resetPasswordMutation.isPending && !captchaLoading}
              >
                <Trans i18nKey={'auth.passwordResetLabel'} />
              </If>

              <If condition={resetPasswordMutation.isPending}>
                <Trans i18nKey={'auth.passwordResetLabel'} />
              </If>

              <If condition={captchaLoading}>
                <Trans i18nKey={'auth.verifyingCaptcha'} />
              </If>
            </Button>
          </div>
        </form>
      </If>
    </>
  );
}
