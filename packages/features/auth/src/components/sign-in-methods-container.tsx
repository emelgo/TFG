'use client';

import { useCallback } from 'react';

import type { Provider } from '@supabase/supabase-js';

import { useNavigate } from '@tanstack/react-router';

import { isBrowser } from '@pymekit/shared/utils';
import { If } from '@pymekit/ui/if';
import { Separator } from '@pymekit/ui/separator';
import { Trans } from '@pymekit/ui/trans';

import { LastAuthMethodHint } from './last-auth-method-hint';
import { MagicLinkAuthContainer } from './magic-link-auth-container';
import { OauthProviders } from './oauth-providers';
import { OtpSignInContainer } from './otp-sign-in-container';
import { PasskeySignInContainer } from './passkey-sign-in-container';
import { PasswordSignInContainer } from './password-sign-in-container';

export function SignInMethodsContainer(props: {
  paths: {
    callback: string;
    joinTeam: string;
    returnPath: string;
  };

  providers: {
    password: boolean;
    magicLink: boolean;
    otp: boolean;
    passkey: boolean;
    oAuth: Provider[];
  };

  captchaSiteKey?: string;
}) {
  const navigate = useNavigate();

  const redirectUrl = isBrowser()
    ? new URL(props.paths.callback, window?.location.origin).toString()
    : '';

  const onSignIn = useCallback(() => {
    const returnPath = props.paths.returnPath || '/dashboard';

    void navigate({ href: returnPath, replace: true });
  }, [props.paths.returnPath, navigate]);

  // whether any email-based method (which renders a form) is enabled
  const hasEmailMethod =
    props.providers.password ||
    props.providers.magicLink ||
    props.providers.otp;

  // whether any non-email method (passkey or OAuth) is enabled
  const hasExternalMethod =
    props.providers.passkey || props.providers.oAuth.length > 0;

  return (
    <>
      <LastAuthMethodHint />

      <If condition={props.providers.password}>
        <PasswordSignInContainer
          onSignIn={onSignIn}
          captchaSiteKey={props.captchaSiteKey}
        />
      </If>

      <If condition={props.providers.magicLink}>
        <MagicLinkAuthContainer
          redirectUrl={redirectUrl}
          shouldCreateUser={false}
          captchaSiteKey={props.captchaSiteKey}
        />
      </If>

      <If condition={props.providers.otp}>
        <OtpSignInContainer
          shouldCreateUser={false}
          captchaSiteKey={props.captchaSiteKey}
        />
      </If>

      <If condition={hasExternalMethod}>
        <If condition={hasEmailMethod}>
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

        <div className={'flex-col space-y-2'}>
          <If condition={props.providers.passkey}>
            <PasskeySignInContainer
              onSignIn={onSignIn}
              captchaSiteKey={props.captchaSiteKey}
            />
          </If>

          <If condition={props.providers.oAuth.length}>
            <OauthProviders
              enabledProviders={props.providers.oAuth}
              shouldCreateUser={false}
              paths={{
                callback: props.paths.callback,
                returnPath: props.paths.returnPath,
              }}
            />
          </If>
        </div>
      </If>
    </>
  );
}
