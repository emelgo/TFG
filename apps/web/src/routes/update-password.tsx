import { createFileRoute, redirect } from '@tanstack/react-router';

import { AuthLayoutShell } from '@pymekit/auth/auth-layout';
import { UpdatePasswordForm } from '@pymekit/auth/password-reset';
import { getSafeRedirectPath } from '@pymekit/shared/utils';

import { AppLogo } from '#/components/app-logo.tsx';
import pathsConfig from '#/config/paths.config.ts';
import { fetchRequiresMfa } from '#/lib/auth/mfa.functions.ts';
import { readString } from '#/lib/auth/search-params.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

interface UpdatePasswordSearch {
  callback?: string;
}

// Post-recovery password update. Requires an authenticated session (the
// recovery link exchanges its code in `/auth/callback` before landing here),
// so an anonymous visitor is bounced to sign-in with a `next` back to this
// screen. `context.user` comes from the root `beforeLoad`.
//
// MFA step-up is enforced here (mirrors the old `requireUser({ verifyMfa })`):
// a recovery link yields an `aal1` session, and changing the password is the
// most sensitive account operation — an MFA-enrolled user must reach `aal2`
// first, otherwise a compromised recovery email would bypass the second factor.
export const Route = createFileRoute('/update-password')({
  validateSearch: (search: Record<string, unknown>): UpdatePasswordSearch => ({
    callback: readString(search.callback),
  }),
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({
        href: `${pathsConfig.auth.signIn}?next=${encodeURIComponent(
          pathsConfig.auth.passwordUpdate,
        )}`,
      });
    }

    const requiresMfa = await fetchRequiresMfa();

    if (requiresMfa) {
      throw redirect({
        href: `${pathsConfig.auth.verifyMfa}?next=${encodeURIComponent(
          pathsConfig.auth.passwordUpdate,
        )}`,
      });
    }
  },
  head: () => ({ meta: [{ title: getTranslator()('auth.updatePassword') }] }),
  component: UpdatePasswordPage,
});

function UpdatePasswordPage() {
  const { callback } = Route.useSearch();
  const redirectTo = getSafeRedirectPath(callback, pathsConfig.app.home);

  return (
    <AuthLayoutShell Logo={AppLogo}>
      <UpdatePasswordForm redirectTo={redirectTo} />
    </AuthLayoutShell>
  );
}
