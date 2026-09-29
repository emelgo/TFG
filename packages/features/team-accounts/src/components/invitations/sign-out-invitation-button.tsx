'use client';

import { getSafeRedirectPath } from '@pymekit/shared/utils';
import { useSignOut } from '@pymekit/supabase/hooks/use-sign-out';
import { Button } from '@pymekit/ui/button';
import { Trans } from '@pymekit/ui/trans';

export function SignOutInvitationButton(
  props: React.PropsWithChildren<{
    nextPath: string;
  }>,
) {
  const signOut = useSignOut();

  return (
    <Button
      variant={'ghost'}
      onClick={async () => {
        await signOut.mutateAsync();

        // Validate the path to prevent open redirect attacks
        const safePath = getSafeRedirectPath(props.nextPath, '/');

        window.location.assign(safePath);
      }}
    >
      <Trans i18nKey={'teams.signInWithDifferentAccount'} />
    </Button>
  );
}
