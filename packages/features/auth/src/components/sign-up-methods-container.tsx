'use client';

import type { Provider } from '@supabase/supabase-js';

import { isBrowser, isSafeRedirectPath } from '@pymekit/shared/utils';
import { If } from '@pymekit/ui/if';
import { Separator } from '@pymekit/ui/separator';
import { Trans } from '@pymekit/ui/trans';

import { ExistingAccountHint } from './existing-account-hint';
import { MagicLinkAuthContainer } from './magic-link-auth-container';
import { OauthProviders } from './oauth-providers';
import { OtpSignInContainer } from './otp-sign-in-container';
import { EmailPasswordSignUpContainer } from './password-sign-up-container';

export function SignUpMethodsContainer(props: {
  paths: {
    callback: string;
    appHome: string;
  };

  providers: {
    password: boolean;
    magicLink: boolean;
    otp: boolean;
    // NB: passkey sign-up is not supported — passkeys authenticate an existing
    // account, so they only appear on the sign-in page.
    passkey: boolean;
    oAuth: Provider[];
  };

  displayTermsCheckbox?: boolean;
  captchaSiteKey?: string;
}) {
  const redirectUrl = getCallbackUrl(props);
  const defaultValues = getDefaultValues();

  return (
    <>
      {/* Show hint if user might already have an account */}
      <ExistingAccountHint />

      <If condition={props.providers.password}>
        <EmailPasswordSignUpContainer
          emailRedirectTo={redirectUrl}
          defaultValues={defaultValues}
          displayTermsCheckbox={props.displayTermsCheckbox}
          captchaSiteKey={props.captchaSiteKey}
        />
      </If>

      <If condition={props.providers.otp}>
        <OtpSignInContainer
          shouldCreateUser={true}
          captchaSiteKey={props.captchaSiteKey}
        />
      </If>

      <If condition={props.providers.magicLink}>
        <MagicLinkAuthContainer
          redirectUrl={redirectUrl}
          shouldCreateUser={true}
          defaultValues={defaultValues}
          displayTermsCheckbox={props.displayTermsCheckbox}
          captchaSiteKey={props.captchaSiteKey}
        />
      </If>

      <If condition={props.providers.oAuth.length}>
        <If
          condition={
            props.providers.magicLink ||
            props.providers.password ||
            props.providers.otp
          }
        >
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>

            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background text-muted-foreground px-2">
                <Trans i18nKey="auth.orContinueWith" />
              </span>
            </div>
          </div>
        </If>

        <OauthProviders
          enabledProviders={props.providers.oAuth}
          shouldCreateUser={true}
          paths={{
            callback: props.paths.callback,
            returnPath: props.paths.appHome,
          }}
        />
      </If>
    </>
  );
}

function getCallbackUrl(props: {
  paths: {
    callback: string;
    appHome: string;
  };
}) {
  if (!isBrowser()) {
    return '';
  }

  const redirectPath = props.paths.callback;
  const origin = window.location.origin;
  const url = new URL(redirectPath, origin);

  const searchParams = new URLSearchParams(window.location.search);
  const next = searchParams.get('next');

  // Only pass through the next param if it's a safe internal path
  if (next && isSafeRedirectPath(next)) {
    url.searchParams.set('next', next);
  }

  return url.href;
}

function getDefaultValues() {
  if (!isBrowser()) {
    return { email: '' };
  }

  const searchParams = new URLSearchParams(window.location.search);

  return {
    email: searchParams.get('email') ?? '',
  };
}
