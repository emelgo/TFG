'use client';

import { useForm } from '@tanstack/react-form';
import { useSelector } from '@tanstack/react-store';
import { Check, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'use-intl';
import * as z from 'zod';

import { useAppEvents } from '@pymekit/shared/events';
import { useSignInWithOtp } from '@pymekit/supabase/hooks/use-sign-in-with-otp';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import { alertExtras } from '@pymekit/ui/alert-extras';
import { Button } from '@pymekit/ui/button';
import { Field, FieldError, FieldLabel } from '@pymekit/ui/field';
import { If } from '@pymekit/ui/if';
import { toast } from '@pymekit/ui/sonner';
import { Trans } from '@pymekit/ui/trans';

import { useCaptcha } from '../captcha/client';
import { useLastAuthMethod } from '../hooks/use-last-auth-method';
import { EmailInput } from './email-input';
import { TermsAndConditionsFormField } from './terms-and-conditions-form-field';

export function MagicLinkAuthContainer({
  redirectUrl,
  shouldCreateUser,
  defaultValues,
  displayTermsCheckbox,
  captchaSiteKey,
}: {
  redirectUrl: string;
  shouldCreateUser: boolean;
  displayTermsCheckbox?: boolean;
  captchaSiteKey?: string;

  defaultValues?: {
    email: string;
  };
}) {
  const captcha = useCaptcha({ siteKey: captchaSiteKey });
  const t = useTranslations();
  const signInWithOtpMutation = useSignInWithOtp();
  const appEvents = useAppEvents();
  const { recordAuthMethod } = useLastAuthMethod();

  const captchaLoading = !captcha.isReady;

  const form = useForm({
    defaultValues: {
      email: defaultValues?.email ?? '',
    },
    validators: {
      onChange: z.object({
        email: z.email(),
      }),
      onSubmit: z.object({
        email: z.email(),
      }),
    },
    onSubmit: ({ value }) => onSubmit(value),
  });

  // Only surface validation errors once the user has attempted to submit.
  const submissionAttempts = useSelector(
    form.store,
    (state) => state.submissionAttempts,
  );

  const onSubmit = ({ email }: { email: string }) => {
    const url = new URL(redirectUrl);

    const emailRedirectTo = url.href;

    const promise = async () => {
      await signInWithOtpMutation.mutateAsync({
        email,
        options: {
          emailRedirectTo,
          captchaToken: captcha.token,
          shouldCreateUser,
        },
      });

      recordAuthMethod('magic_link', { email });

      if (shouldCreateUser) {
        appEvents.emit({
          type: 'user.signedUp',
          payload: {
            method: 'magiclink',
          },
        });
      }
    };

    toast.promise(promise, {
      loading: t('auth.sendingEmailLink'),
      success: t(`auth.sendLinkSuccessToast`),
      error: t(`auth.errors.linkTitle`),
    });

    captcha.reset();
  };

  if (signInWithOtpMutation.data) {
    return <SuccessAlert />;
  }

  return (
    <form
      className={'w-full'}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <div className={'flex flex-col space-y-4'}>
        <If condition={signInWithOtpMutation.error}>
          <ErrorAlert />
        </If>

        <form.Field name={'email'}>
          {(field) => {
            const isInvalid =
              submissionAttempts > 0 && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel>
                  <Trans i18nKey={'common.emailAddress'} />
                </FieldLabel>

                <EmailInput
                  data-testid="email-input"
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                />

                <FieldError errors={isInvalid ? field.state.meta.errors : []} />
              </Field>
            );
          }}
        </form.Field>

        <If condition={displayTermsCheckbox}>
          <TermsAndConditionsFormField />
        </If>

        {captcha.field}

        <Button
          type="submit"
          disabled={signInWithOtpMutation.isPending || captchaLoading}
        >
          <If condition={captchaLoading}>
            <Trans i18nKey={'auth.verifyingCaptcha'} />
          </If>

          <If condition={signInWithOtpMutation.isPending && !captchaLoading}>
            <Trans i18nKey={'auth.sendingEmailLink'} />
          </If>

          <If condition={!signInWithOtpMutation.isPending && !captchaLoading}>
            <Trans i18nKey={'auth.sendEmailLink'} />
          </If>
        </Button>
      </div>
    </form>
  );
}

function SuccessAlert() {
  return (
    <Alert className={alertExtras.success}>
      <Check className={'h-4'} />

      <AlertTitle>
        <Trans i18nKey={'auth.sendLinkSuccess'} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={'auth.sendLinkSuccessDescription'} />
      </AlertDescription>
    </Alert>
  );
}

function ErrorAlert() {
  return (
    <Alert variant={'destructive'}>
      <TriangleAlert className={'h-4'} />

      <AlertTitle>
        <Trans i18nKey={'auth.errors.linkTitle'} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={'auth.errors.linkDescription'} />
      </AlertDescription>
    </Alert>
  );
}
