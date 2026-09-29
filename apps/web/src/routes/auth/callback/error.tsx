import type { AuthError } from '@supabase/supabase-js';

import { createFileRoute } from '@tanstack/react-router';

import { ResendAuthLinkForm } from '@pymekit/auth/resend-email-link';
import { Alert, AlertDescription, AlertTitle } from '@pymekit/ui/alert';
import { alertExtras } from '@pymekit/ui/alert-extras';
import { buttonVariants } from '@pymekit/ui/button';
import { Trans } from '@pymekit/ui/trans';

import pathsConfig from '#/config/paths.config.ts';
import { readString } from '#/lib/auth/search-params.ts';

interface ErrorSearch {
  error?: string;
  callback?: string;
  email?: string;
  code?: AuthError['code'];
}

export const Route = createFileRoute('/auth/callback/error')({
  validateSearch: (search: Record<string, unknown>): ErrorSearch => ({
    error: readString(search.error),
    callback: readString(search.callback),
    email: readString(search.email),
    code: readString(search.code) as AuthError['code'] | undefined,
  }),
  component: AuthCallbackErrorPage,
});

function AuthCallbackErrorPage() {
  const { error, callback, code } = Route.useSearch();
  const redirectPath = callback ?? pathsConfig.auth.callback;

  return (
    <div className={'flex flex-col space-y-4 py-4'}>
      <Alert className={alertExtras.warning}>
        <AlertTitle>
          <Trans i18nKey={'auth.authenticationErrorAlertHeading'} />
        </AlertTitle>

        <AlertDescription>
          <Trans i18nKey={error ?? 'auth.authenticationErrorAlertBody'} />
        </AlertDescription>
      </Alert>

      {code === 'otp_expired' ? (
        <ResendAuthLinkForm redirectPath={redirectPath} />
      ) : (
        <a
          href={pathsConfig.auth.signIn}
          className={buttonVariants({ className: 'w-full' })}
        >
          <Trans i18nKey={'auth.signIn'} />
        </a>
      )}
    </div>
  );
}
