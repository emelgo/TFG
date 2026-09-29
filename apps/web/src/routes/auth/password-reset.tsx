import { createFileRoute } from '@tanstack/react-router';

import { PasswordResetRequestContainer } from '@pymekit/auth/password-reset';
import { buttonVariants } from '@pymekit/ui/button';
import { Heading } from '@pymekit/ui/heading';
import { Trans } from '@pymekit/ui/trans';

import authConfig from '#/config/auth.config.ts';
import pathsConfig from '#/config/paths.config.ts';
import { getTranslator } from '#/lib/i18n/translator.ts';

export const Route = createFileRoute('/auth/password-reset')({
  head: () => ({
    meta: [{ title: getTranslator()('auth.passwordResetLabel') }],
  }),
  component: PasswordResetPage,
});

// Land the user on the update-password screen after they click the recovery
// email: the callback exchanges the recovery code, then forwards to `next`.
const redirectPath = `${pathsConfig.auth.callback}?next=${pathsConfig.auth.passwordUpdate}`;

function PasswordResetPage() {
  return (
    <>
      <div className={'flex flex-col items-center gap-1'}>
        <Heading level={4} className={'tracking-tight'}>
          <Trans i18nKey={'auth.passwordResetLabel'} />
        </Heading>

        <p className={'text-muted-foreground text-sm'}>
          <Trans i18nKey={'auth.passwordResetSubheading'} />
        </p>
      </div>

      <div className={'flex flex-col space-y-4'}>
        <PasswordResetRequestContainer
          redirectPath={redirectPath}
          captchaSiteKey={authConfig.captchaTokenSiteKey}
        />

        <div className={'flex justify-center text-xs'}>
          <a
            href={pathsConfig.auth.signIn}
            className={buttonVariants({ variant: 'link', size: 'sm' })}
          >
            <Trans i18nKey={'auth.passwordRecoveredQuestion'} />
          </a>
        </div>
      </div>
    </>
  );
}
