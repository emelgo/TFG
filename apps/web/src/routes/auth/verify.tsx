import { createFileRoute, redirect } from '@tanstack/react-router';

import { MultiFactorChallengeContainer } from '@pymekit/auth/mfa';
import { getSafeRedirectPath } from '@pymekit/shared/utils';

import pathsConfig from '#/config/paths.config.ts';
import { fetchMfaChallenge } from '#/lib/auth/mfa.functions.ts';
import { readString } from '#/lib/auth/search-params.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

interface VerifySearch {
  next?: string;
}

export const Route = createFileRoute('/auth/verify')({
  validateSearch: (search: Record<string, unknown>): VerifySearch => ({
    next: readString(search.next),
  }),
  loader: async () => {
    const { userId } = await fetchMfaChallenge();

    // No session or MFA not required: bounce back to sign-in. Thrown from the
    // loader (not the server fn) so the redirect propagates through the router.
    if (!userId) {
      throw redirect({ href: pathsConfig.auth.signIn });
    }

    return { userId };
  },
  head: () => ({
    meta: [{ title: getTranslator()('auth.verifyCodeHeading') }],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { userId } = Route.useLoaderData();
  const { next } = Route.useSearch();

  const redirectPath = getSafeRedirectPath(next, pathsConfig.app.home);

  return (
    <MultiFactorChallengeContainer userId={userId} paths={{ redirectPath }} />
  );
}
