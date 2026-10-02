import { createFileRoute } from '@tanstack/react-router';

import { SignUpMethodsContainer } from '@pymekit/auth/sign-up';
import { buttonVariants } from '@pymekit/ui/button';
import { Heading } from '@pymekit/ui/heading';
import { Trans } from '@pymekit/ui/trans';

import authConfig from '#/config/auth.config.ts';
import pathsConfig from '#/config/paths.config.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/auth/sign-up')({
  head: ({ match }) => ({
    meta: [{ title: getTranslator(match.context.locale)('auth.signUp') }],
  }),
  component: SignUpPage,
});

const paths = {
  callback: pathsConfig.auth.callback,
  appHome: pathsConfig.app.home,
};

function SignUpPage() {
  return (
    <>
      <div className={'flex flex-col items-center gap-1'}>
        <Heading level={4} className={'tracking-tight'}>
          <Trans i18nKey={'auth.signUpHeading'} />
        </Heading>

        <p className={'text-muted-foreground text-sm'}>
          <Trans i18nKey={'auth.signUpSubheading'} />
        </p>
      </div>

      <SignUpMethodsContainer
        providers={authConfig.providers}
        displayTermsCheckbox={authConfig.displayTermsCheckbox}
        paths={paths}
        captchaSiteKey={authConfig.captchaTokenSiteKey}
      />

      <div className={'flex justify-center'}>
        <a
          href={pathsConfig.auth.signIn}
          className={buttonVariants({ variant: 'link', size: 'sm' })}
        >
          <Trans i18nKey={'auth.alreadyHaveAnAccount'} />
        </a>
      </div>
    </>
  );
}
