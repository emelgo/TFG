'use client';

import { useMemo } from 'react';

import { ClientOnly, useSearch } from '@tanstack/react-router';
import { UserCheck } from 'lucide-react';
import { useTranslations } from 'use-intl';

import { Alert, AlertDescription } from '@pymekit/ui/alert';
import { If } from '@pymekit/ui/if';
import { Trans } from '@pymekit/ui/trans';

import { useLastAuthMethod } from '../hooks/use-last-auth-method';

interface ExistingAccountHintProps {
  signInPath?: string;
  className?: string;
}

// we render client-side only to avoid hydration errors
export function ExistingAccountHint(props: ExistingAccountHintProps) {
  return (
    <ClientOnly fallback={null}>
      <ExistingAccountHintImpl {...props} />
    </ClientOnly>
  );
}

export function ExistingAccountHintImpl({
  signInPath = '/auth/sign-in',
  className,
}: ExistingAccountHintProps) {
  const { hasLastMethod, methodType, providerName, isOAuth } =
    useLastAuthMethod();

  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const t = useTranslations();

  const inviteToken =
    typeof search.invite_token === 'string' ? search.invite_token : null;

  // Build the sign-in href manually (plain anchor) so this shared component
  // stays decoupled from the consuming app's typed route tree.
  const signInHref = inviteToken
    ? `${signInPath}?invite_token=${encodeURIComponent(inviteToken)}`
    : signInPath;

  // Get the appropriate method description for the hint
  // This must be called before any conditional returns to follow Rules of Hooks
  const methodDescription = useMemo(() => {
    if (isOAuth && providerName) {
      return providerName;
    }

    switch (methodType) {
      case 'password':
        return 'auth.methodPassword';
      case 'otp':
        return 'auth.methodOtp';
      case 'magic_link':
        return 'auth.methodMagicLink';
      default:
        return 'auth.methodDefault';
    }
  }, [methodType, isOAuth, providerName]);

  // Don't show anything until loaded or if no last method
  if (!hasLastMethod) {
    return null;
  }

  return (
    <If condition={Boolean(methodDescription)}>
      <Alert data-testid={'existing-account-hint'} className={className}>
        <UserCheck className="h-4 w-4" />

        <AlertDescription className={'text-xs'}>
          <Trans
            i18nKey="auth.existingAccountHint"
            values={{ methodName: t(methodDescription) }}
            components={{
              method: <span className="font-medium" />,
              signInLink: (
                <a href={signInHref} className="font-medium underline" />
              ),
            }}
          />
        </AlertDescription>
      </Alert>
    </If>
  );
}
