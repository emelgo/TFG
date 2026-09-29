'use client';

import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { useSelector } from '@tanstack/react-store';
import * as z from 'zod';

import { useSupabase } from '@pymekit/supabase/hooks/use-supabase';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import { alertExtras } from '@pymekit/ui/alert-extras';
import { Button } from '@pymekit/ui/button';
import { Field, FieldError } from '@pymekit/ui/field';
import { If } from '@pymekit/ui/if';
import { Trans } from '@pymekit/ui/trans';

import { useCaptcha } from '../captcha/client';
import { EmailInput } from './email-input';

export function ResendAuthLinkForm(props: {
  redirectPath?: string;
  captchaSiteKey?: string;
}) {
  const captcha = useCaptcha({ siteKey: props.captchaSiteKey });
  const resendLink = useResendLink(captcha.token);
  const captchaLoading = !captcha.isReady;

  const form = useForm({
    defaultValues: {
      email: '',
    },
    validators: {
      onChange: z.object({ email: z.email() }),
      onSubmit: z.object({ email: z.email() }),
    },
    onSubmit: ({ value }) => {
      const promise = resendLink.mutateAsync({
        email: value.email,
        redirectPath: props.redirectPath,
      });

      promise.finally(() => {
        captcha.reset();
      });

      return promise;
    },
  });

  // Only surface validation errors once the user has attempted to submit.
  const submissionAttempts = useSelector(
    form.store,
    (state) => state.submissionAttempts,
  );

  if (resendLink.data && !resendLink.isPending) {
    return (
      <Alert className={alertExtras.success}>
        <AlertTitle>
          <Trans i18nKey={'auth.resendLinkSuccess'} />
        </AlertTitle>

        <AlertDescription>
          <Trans
            i18nKey={'auth.resendLinkSuccessDescription'}
            defaults={'Success!'}
          />
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form
      className={'flex flex-col space-y-2'}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Field name={'email'}>
        {(field) => {
          const isInvalid = submissionAttempts > 0 && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid}>
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

      {captcha.field}

      <Button type="submit" disabled={resendLink.isPending || captchaLoading}>
        <If condition={captchaLoading}>
          <Trans i18nKey={'auth.verifyingCaptcha'} />
        </If>

        <If condition={resendLink.isPending && !captchaLoading}>
          <Trans i18nKey={'auth.resendingLink'} />
        </If>

        <If condition={!resendLink.isPending && !captchaLoading}>
          <Trans i18nKey={'auth.resendLink'} defaults={'Resend Link'} />
        </If>
      </Button>
    </form>
  );
}

function useResendLink(captchaToken: string) {
  const supabase = useSupabase();

  const mutationFn = async (props: {
    email: string;
    redirectPath?: string;
  }) => {
    const response = await supabase.auth.resend({
      email: props.email,
      type: 'signup',
      options: {
        emailRedirectTo: props.redirectPath,
        captchaToken,
      },
    });

    if (response.error) {
      throw response.error;
    }

    return response.data;
  };

  return useMutation({
    mutationFn,
  });
}
