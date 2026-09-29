'use client';

import { useCallback } from 'react';

import { Fingerprint } from 'lucide-react';

import { useSignInWithPasskey } from '@pymekit/supabase/hooks/use-sign-in-with-passkey';
import { isPasskeyCeremonyCancelled } from '@pymekit/supabase/passkey-errors';
import { Button } from '@pymekit/ui/button';
import { If } from '@pymekit/ui/if';
import { LoadingOverlay } from '@pymekit/ui/loading-overlay';
import { Trans } from '@pymekit/ui/trans';

import { useCaptcha } from '../captcha/client';
import { useLastAuthMethod } from '../hooks/use-last-auth-method';
import { AuthErrorAlert } from './auth-error-alert';

/**
 * @name PasskeySignInContainer
 * @description
 * Renders a button that signs the user in with a passkey (WebAuthn). The
 * button blends in with the OAuth providers so it floats seamlessly with the
 * other sign-in options.
 */
export function PasskeySignInContainer({
  onSignIn,
  captchaSiteKey,
}: {
  onSignIn?: (userId?: string) => unknown;
  captchaSiteKey?: string;
}) {
  const captcha = useCaptcha({ siteKey: captchaSiteKey });
  const signInMutation = useSignInWithPasskey();
  const { recordAuthMethod } = useLastAuthMethod();

  const loading = signInMutation.isPending;
  const captchaLoading = !captcha.isReady;

  // dismissing the browser prompt is a routine action, not an error — don't
  // surface a destructive alert when the ceremony is cancelled by the user
  const error = isPasskeyCeremonyCancelled(signInMutation.error)
    ? null
    : signInMutation.error;

  const onClick = useCallback(async () => {
    try {
      const data = await signInMutation.mutateAsync({
        options: { captchaToken: captcha.token },
      });

      // Record successful passkey sign-in
      recordAuthMethod('passkey');

      if (onSignIn) {
        onSignIn(data?.user?.id);
      }
    } catch {
      // the user cancelled the ceremony or the credential was rejected
    } finally {
      captcha.reset();
    }
  }, [captcha, onSignIn, recordAuthMethod, signInMutation]);

  return (
    <>
      <If condition={loading}>
        <LoadingOverlay />
      </If>

      <div className={'flex w-full flex-1 flex-col space-y-3'}>
        <Button
          className={'flex w-full gap-x-3 text-center'}
          data-testid={'passkey-sign-in-button'}
          variant={'outline'}
          disabled={loading || captchaLoading}
          onClick={onClick}
        >
          <Fingerprint className={'h-4 w-4'} />

          <span>
            <Trans i18nKey={'auth.signInWithPasskey'} />
          </span>
        </Button>

        {captcha.field}

        <AuthErrorAlert error={error} />
      </div>
    </>
  );
}
