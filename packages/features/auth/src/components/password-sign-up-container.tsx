'use client';

import { CheckCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import { alertExtras } from '@pymekit/ui/alert-extras';
import { If } from '@pymekit/ui/if';
import { Trans } from '@pymekit/ui/trans';

import { useCaptcha } from '../captcha/client';
import { usePasswordSignUpFlow } from '../hooks/use-sign-up-flow';
import { AuthErrorAlert } from './auth-error-alert';
import { PasswordSignUpForm } from './password-sign-up-form';

interface EmailPasswordSignUpContainerProps {
  displayTermsCheckbox?: boolean;
  defaultValues?: {
    email: string;
  };
  onSignUp?: (userId?: string) => unknown;
  emailRedirectTo: string;
  captchaSiteKey?: string;
}

export function EmailPasswordSignUpContainer({
  defaultValues,
  onSignUp,
  emailRedirectTo,
  displayTermsCheckbox,
  captchaSiteKey,
}: EmailPasswordSignUpContainerProps) {
  const captcha = useCaptcha({ siteKey: captchaSiteKey });
  const captchaLoading = !captcha.isReady;

  const {
    signUp: onSignupRequested,
    loading,
    error,
    showVerifyEmailAlert,
  } = usePasswordSignUpFlow({
    emailRedirectTo,
    onSignUp,
    captchaToken: captcha.token,
    resetCaptchaToken: captcha.reset,
  });

  return (
    <>
      <If condition={showVerifyEmailAlert}>
        <SuccessAlert />
      </If>

      <If condition={!showVerifyEmailAlert}>
        <AuthErrorAlert error={error} />

        <div>
          <PasswordSignUpForm
            onSubmit={onSignupRequested}
            loading={loading}
            defaultValues={defaultValues}
            displayTermsCheckbox={displayTermsCheckbox}
            captchaLoading={captchaLoading}
            captchaField={captcha.field}
          />
        </div>
      </If>
    </>
  );
}

function SuccessAlert() {
  return (
    <Alert className={alertExtras.success}>
      <CheckCircle className={'w-4'} />

      <AlertTitle>
        <Trans i18nKey={'auth.emailConfirmationAlertHeading'} />
      </AlertTitle>

      <AlertDescription data-testid={'email-confirmation-alert'}>
        <Trans i18nKey={'auth.emailConfirmationAlertBody'} />
      </AlertDescription>
    </Alert>
  );
}
