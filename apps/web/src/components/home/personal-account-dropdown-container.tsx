'use client';

import { PersonalAccountDropdown } from '@pymekit/accounts/personal-account-dropdown';
import { useSignOut } from '@pymekit/supabase/hooks/use-sign-out';
import { useUser } from '@pymekit/supabase/hooks/use-user';
import type { JWTUserData } from '@pymekit/supabase/types';

import featuresFlagConfig from '#/config/feature-flags.config.ts';
import pathsConfig from '#/config/paths.config.ts';

const features = {
  enableThemeToggle: featuresFlagConfig.enableThemeToggle,
};

export function PersonalAccountDropdownContainer(props: {
  user?: JWTUserData | null;
  showProfileName?: boolean;

  account?: {
    id: string | null;
    name: string | null;
    picture_url: string | null;
  };
}) {
  const signOut = useSignOut();
  const user = useUser(props.user);
  const userData = user.data;

  if (!userData) {
    return null;
  }

  return (
    <PersonalAccountDropdown
      className={'w-full'}
      paths={{ home: pathsConfig.app.home }}
      features={features}
      user={userData}
      account={props.account}
      signOutRequested={() => signOut.mutateAsync()}
      showProfileName={props.showProfileName}
    />
  );
}
