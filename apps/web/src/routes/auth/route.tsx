import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';

import { AuthLayoutShell } from '@pymekit/auth/auth-layout';
import { getSafeRedirectPath } from '@pymekit/shared/utils';

import { AppLogo } from '#/components/app-logo.tsx';
import pathsConfig from '#/config/paths.config.ts';
import { readString } from '#/lib/auth/search-params.ts';

export const Route = createFileRoute('/auth')({
  // Reverse guard: authenticated visitors don't belong on the auth screens —
  // EXCEPT /auth/verify, where a Supabase MFA user is mid-flow (an `aal1`
  // session already exists but is not yet `aal2`). No session fetch here: the
  // root `beforeLoad` already resolved `context.user`.
  beforeLoad: ({ context, location }) => {
    const onVerify = location.pathname.startsWith(pathsConfig.auth.verifyMfa);

    if (context.user && !onVerify) {
      const search = location.search as { next?: unknown };
      const target = getSafeRedirectPath(
        readString(search.next),
        pathsConfig.app.home,
      );

      throw redirect({ href: target });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <AuthLayoutShell Logo={AppLogo}>
      <Outlet />
    </AuthLayoutShell>
  );
}
