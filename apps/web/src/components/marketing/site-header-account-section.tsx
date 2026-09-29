'use client';

import { Link } from '@tanstack/react-router';

import { PersonalAccountDropdown } from '@pymekit/accounts/personal-account-dropdown';
import { useSignOut } from '@pymekit/supabase/hooks/use-sign-out';
import type { JWTUserData } from '@pymekit/supabase/types';
import { Button } from '@pymekit/ui/button';
import { If } from '@pymekit/ui/if';
import { MobileModeToggle } from '@pymekit/ui/mobile-mode-toggle';
import { ModeToggle } from '@pymekit/ui/mode-toggle';
import { Trans } from '@pymekit/ui/trans';

import featuresFlagConfig from '#/config/feature-flags.config.ts';
import pathsConfig from '#/config/paths.config.ts';

const paths = {
  home: pathsConfig.app.home,
  profileSettings: pathsConfig.app.settings,
};

const features = {
  enableThemeToggle: featuresFlagConfig.enableThemeToggle,
};

export function SiteHeaderAccountSection({
  user,
}: {
  user: JWTUserData | null;
}) {
  const signOut = useSignOut();

  if (user) {
    return (
      <PersonalAccountDropdown
        showProfileName={false}
        paths={paths}
        features={features}
        user={user}
        signOutRequested={() => signOut.mutateAsync()}
      />
    );
  }

  return <AuthButtons />;
}

function AuthButtons() {
  return (
    <div
      className={'animate-in fade-in flex items-center gap-x-2 duration-500'}
    >
      <div className={'hidden md:flex'}>
        <If condition={features.enableThemeToggle}>
          <ModeToggle />
        </If>
      </div>

      <div className={'md:hidden'}>
        <If condition={features.enableThemeToggle}>
          <MobileModeToggle />
        </If>
      </div>

      <div className={'flex items-center gap-x-2'}>
        <Button
          nativeButton={false}
          className={'hidden md:flex md:text-sm'}
          render={
            <Link to={pathsConfig.auth.signIn}>
              <Trans i18nKey={'auth.signIn'} />
            </Link>
          }
          variant={'outline'}
          size={'sm'}
        />

        <Button
          nativeButton={false}
          render={
            <Link to={pathsConfig.auth.signUp}>
              <Trans i18nKey={'auth.signUp'} />
            </Link>
          }
          className="text-xs md:text-sm"
          variant={'default'}
          size={'sm'}
        />
      </div>
    </div>
  );
}
