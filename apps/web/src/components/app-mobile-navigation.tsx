'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { Check, Menu, User } from 'lucide-react';
import type * as z from 'zod';

import { useSignOut } from '@pymekit/supabase/hooks/use-sign-out';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pymekit/ui/dropdown-menu';
import { If } from '@pymekit/ui/if';
import type { NavigationConfigSchema } from '@pymekit/ui/navigation-schema';
import { Trans } from '@pymekit/ui/trans';

import {
  MobileNavRouteLinks,
  MobileNavSignOutItem,
} from '#/components/home/mobile-navigation-shared.tsx';
import { useWorkspace } from '#/components/workspace-context.tsx';
import featureFlagsConfig from '#/config/feature-flags.config.ts';
import { setActiveAccountFunction } from '#/lib/server/active-workspace.functions.ts';

/**
 * Mobile navigation for the unified shell. Switches the active account via the
 * DB-backed pointer (no slug) and renders the section's route links. `routes`
 * is the active section config (app nav or settings nav).
 */
export function AppMobileNavigation({
  routes,
}: {
  routes: z.output<typeof NavigationConfigSchema>['routes'];
}) {
  const router = useRouter();
  const signOut = useSignOut();
  const setActiveAccount = useServerFn(setActiveAccountFunction);

  const { account, accounts, user } = useWorkspace();

  const switchAccount = useMutation({
    mutationFn: (accountId: string) =>
      setActiveAccount({ data: { accountId } }),
    onSuccess: () => router.invalidate(),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Menu className={'h-9'} />
      </DropdownMenuTrigger>

      <DropdownMenuContent sideOffset={10} className={'w-screen rounded-none'}>
        <If condition={featureFlagsConfig.enableTeamAccounts}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <Trans i18nKey={'common.yourAccounts'} />
            </DropdownMenuLabel>

            <If condition={!featureFlagsConfig.enableTeamsOnly}>
              <DropdownMenuItem
                className={'flex gap-2'}
                onClick={() => switchAccount.mutate(user.id)}
              >
                <User className={'size-4'} />

                <span className={'flex-1'}>
                  <Trans i18nKey={'teams.personalAccount'} />
                </span>

                {account.is_personal_account && (
                  <Check className={'ml-auto size-4'} />
                )}
              </DropdownMenuItem>
            </If>

            {accounts.map((item) => (
              <DropdownMenuItem
                key={item.id}
                className={'flex gap-2'}
                onClick={() => {
                  if (item.id && item.id !== account.id) {
                    switchAccount.mutate(item.id);
                  }
                }}
              >
                <span className={'flex-1'}>{item.name}</span>

                {account.id === item.id && (
                  <Check className={'ml-auto size-4'} />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />
        </If>

        <DropdownMenuGroup>
          <MobileNavRouteLinks routes={routes} />
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <MobileNavSignOutItem onSignOut={() => signOut.mutateAsync()} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
