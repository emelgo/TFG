import { createFileRoute, redirect } from '@tanstack/react-router';

import { AuthLayoutShell } from '@pymekit/auth/auth-layout';
import { getSafeRedirectPath } from '@pymekit/shared/utils';
import { Heading } from '@pymekit/ui/heading';
import { Trans } from '@pymekit/ui/trans';

import { AppLogo } from '#/components/app-logo.tsx';
import { IdentitiesStepWrapper } from '#/components/auth/identities-step-wrapper.tsx';
import authConfig from '#/config/auth.config.ts';
import pathsConfig from '#/config/paths.config.ts';
import { fetchRequiresMfa } from '#/lib/auth/mfa.functions.ts';
import { readString } from '#/lib/auth/search-params.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

interface IdentitiesSearch {
  next?: string;
}

// Post-sign-up "link an identity / set up your account" step. Requires an
// authenticated session (the user has just signed up), so anonymous visitors
// are bounced to sign-in. `context.user` comes from the root `beforeLoad`.
// An `aal1` session with enrolled factors must step up to `aal2` first (mirrors
// the old `requireUser({ verifyMfa })` default) before linking identities.
export const Route = createFileRoute('/identities')({
  validateSearch: (search: Record<string, unknown>): IdentitiesSearch => ({
    next: readString(search.next),
  }),
  beforeLoad: async ({ context }) => {
    if (!context.user) {
      throw redirect({ href: pathsConfig.auth.signIn });
    }

    const requiresMfa = await fetchRequiresMfa();

    if (requiresMfa) {
      throw redirect({ href: pathsConfig.auth.verifyMfa });
    }
  },
  head: ({ match }) => ({
    meta: [{ title: getTranslator(match.context.locale)('auth.setupAccount') }],
  }),
  component: IdentitiesPage,
});

function IdentitiesPage() {
  const { next } = Route.useSearch();
  const nextPath = getSafeRedirectPath(next, pathsConfig.app.home);

  // Available auth methods the user can add on this step.
  const showPasswordOption = authConfig.providers.password;

  // Email option covers password, magic link, or OTP.
  const showEmailOption =
    authConfig.providers.password ||
    authConfig.providers.magicLink ||
    authConfig.providers.otp;

  const oAuthProviders = authConfig.providers.oAuth;
  const enableIdentityLinking = authConfig.enableIdentityLinking;

  // Only require confirmation-before-leaving if password or oauth is enabled.
  const requiresConfirmation =
    authConfig.providers.password || oAuthProviders.length > 0;

  return (
    <AuthLayoutShell
      Logo={AppLogo}
      contentClassName="max-w-md overflow-y-hidden"
    >
      <div
        className={
          'flex max-h-[70vh] w-full flex-col items-center space-y-6 overflow-y-auto'
        }
      >
        <div className={'flex flex-col items-center gap-1'}>
          <Heading
            level={4}
            className="text-center"
            data-testid="identities-page-heading"
          >
            <Trans i18nKey={'auth.linkAccountToSignIn'} />
          </Heading>

          <Heading
            level={6}
            className={'text-muted-foreground text-center text-sm'}
            data-testid="identities-page-description"
          >
            <Trans i18nKey={'auth.linkAccountToSignInDescription'} />
          </Heading>
        </div>

        <IdentitiesStepWrapper
          nextPath={nextPath}
          showPasswordOption={showPasswordOption}
          showEmailOption={showEmailOption}
          oAuthProviders={oAuthProviders}
          enableIdentityLinking={enableIdentityLinking}
          requiresConfirmation={requiresConfirmation}
        />
      </div>
    </AuthLayoutShell>
  );
}
