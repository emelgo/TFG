import { createFileRoute } from '@tanstack/react-router';

import { SignInMethodsContainer } from '@pymekit/auth/sign-in';
import { getSafeRedirectPath } from '@pymekit/shared/utils';
import { buttonVariants } from '@pymekit/ui/button';
import { Heading } from '@pymekit/ui/heading';
import { Trans } from '@pymekit/ui/trans';

import authConfig from '#/config/auth.config.ts';
import pathsConfig from '#/config/paths.config.ts';
import { readString } from '#/lib/auth/search-params.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

interface SignInSearch {
  next?: string;
}

export const Route = createFileRoute('/auth/sign-in')({
  validateSearch: (search: Record<string, unknown>): SignInSearch => ({
    next: readString(search.next),
  }),
  head: ({ match }) => ({
    meta: [{ title: getTranslator(match.context.locale)('auth.signIn') }],
  }),
  component: SignInPage,
});

function SignInPage() {
  const search = Route.useSearch();

  const paths = {
    callback: pathsConfig.auth.callback,
    joinTeam: '/join',
    returnPath: getSafeRedirectPath(search.next, pathsConfig.app.home),
  };

  return (
    <>
      <div className={'flex flex-col items-center gap-1.5'}>
        <Heading level={4} className={'tracking-tight'}>
          <Trans i18nKey={'auth.signInHeading'} />
        </Heading>

        <p className={'text-muted-foreground text-sm'}>
          <Trans i18nKey={'auth.signInSubheading'} />
        </p>
      </div>

      <SignInMethodsContainer
        paths={paths}
        providers={authConfig.providers}
        captchaSiteKey={authConfig.captchaTokenSiteKey}
      />

      <div className={'flex justify-center'}>
        <a
          href={pathsConfig.auth.signUp}
          className={buttonVariants({ variant: 'link', size: 'sm' })}
        >
          <Trans i18nKey={'auth.doNotHaveAccountYet'} />
        </a>
      </div>
    </>
  );
}
