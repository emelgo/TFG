import type { JWTUserData } from '@pymekit/supabase/types';
import { Header } from '@pymekit/ui/marketing';

import { AppLogo } from '#/components/app-logo.tsx';

import { SiteHeaderAccountSection } from './site-header-account-section.tsx';
import { SiteNavigation } from './site-navigation.tsx';

export function SiteHeader(props: { user?: JWTUserData | null }) {
  return (
    <Header
      logo={<AppLogo className="mx-auto sm:mx-0" />}
      navigation={<SiteNavigation />}
      actions={<SiteHeaderAccountSection user={props.user ?? null} />}
    />
  );
}
