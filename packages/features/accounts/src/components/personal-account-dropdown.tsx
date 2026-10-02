'use client';

import { useMemo } from 'react';

import { Link } from '@tanstack/react-router';
import { ChevronsUpDown, Home, LogOut, Shield } from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { JWTUserData } from '@pymekit/supabase/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pymekit/ui/dropdown-menu';
import { If } from '@pymekit/ui/if';
import { SubMenuModeToggle } from '@pymekit/ui/mode-toggle';
import { ProfileAvatar } from '@pymekit/ui/profile-avatar';
import { Trans } from '@pymekit/ui/trans';
import { cn } from '@pymekit/ui/utils';

import { usePersonalAccountData } from '../hooks/use-personal-account-data';

export function PersonalAccountDropdown({
  className,
  user,
  signOutRequested,
  showProfileName = true,
  paths,
  features,
  account,
}: {
  user: JWTUserData;

  account?: {
    id: string | null;
    name: string | null;
    picture_url: string | null;
  };

  signOutRequested: () => unknown;

  paths: {
    home: string;
  };

  features: {
    enableThemeToggle: boolean;
  };

  showProfileName?: boolean;

  className?: string;
}) {
  const t = useTranslations('common');
  const { data: personalAccountData } = usePersonalAccountData(
    user.id,
    account,
  );

  const signedInAsLabel = useMemo(() => {
    const email = user?.email ?? undefined;
    const phone = user?.phone ?? undefined;

    return email ?? phone;
  }, [user]);

  const displayName =
    personalAccountData?.name ?? account?.name ?? user?.email ?? '';

  const isSuperAdmin = useMemo(() => {
    const hasAdminRole = user?.is_superadmin;
    const isAal2 = user?.aal === 'aal2';

    return hasAdminRole && isAal2;
  }, [user]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('openProfileMenu')}
        data-testid={'account-dropdown-trigger'}
        className={cn(
          'group/trigger fade-in focus:outline-primary flex cursor-pointer items-center group-data-[collapsible=icon]:px-0',
          className ?? '',
          {
            ['active:bg-secondary/50 group-data-[collapsible=none]:hover:bg-secondary items-center gap-4 rounded-md border-dashed p-2 transition-colors group-data-[collapsible=none]:border']:
              showProfileName,
          },
        )}
      >
        <ProfileAvatar
          className={
            'group-hover/trigger:border-background/50 border border-transparent transition-colors'
          }
          fallbackClassName={'border'}
          displayName={displayName ?? user?.email ?? ''}
          pictureUrl={personalAccountData?.picture_url}
        />

        <If condition={showProfileName}>
          <div
            className={
              'fade-in flex w-full flex-col truncate text-left group-data-[collapsible=icon]:hidden'
            }
          >
            <span
              data-testid={'account-dropdown-display-name'}
              className={'truncate text-sm'}
            >
              {displayName}
            </span>

            <span
              data-testid={'account-dropdown-email'}
              className={'text-muted-foreground truncate text-xs'}
            >
              {signedInAsLabel}
            </span>
          </div>

          <ChevronsUpDown
            className={
              'text-muted-foreground mr-1 h-8 group-data-[collapsible=icon]:hidden'
            }
          />
        </If>
      </DropdownMenuTrigger>

      <DropdownMenuContent className={'xl:min-w-[15rem]!'}>
        <DropdownMenuItem
          className={'group/item h-10! data-[highlighted]:bg-transparent'}
        >
          <div
            className={'flex flex-col justify-start truncate text-left text-xs'}
          >
            <div
              className={
                'text-muted-foreground group-hover/item:text-muted-foreground!'
              }
            >
              <Trans i18nKey={'common.signedInAs'} />
            </div>

            <div>
              <span className={'block truncate'}>{signedInAsLabel}</span>
            </div>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          render={
            <Link className={'flex items-center gap-x-2'} to={paths.home} />
          }
        >
          <Home className={'h-4 w-4'} />

          <span>
            <Trans i18nKey={'common.routes.home'} />
          </span>
        </DropdownMenuItem>

        <If condition={isSuperAdmin}>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            render={
              <Link
                className={
                  'flex items-center gap-x-2 text-yellow-700 dark:text-yellow-500'
                }
                to={'/admin' as string}
              />
            }
          >
            <Shield className={'h-4 w-4'} />

            <span>
              <Trans i18nKey={'common.superAdmin'} />
            </span>
          </DropdownMenuItem>
        </If>

        <DropdownMenuSeparator />

        <If condition={features.enableThemeToggle}>
          <SubMenuModeToggle />
        </If>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          data-testid={'account-dropdown-sign-out'}
          role={'button'}
          className={'cursor-pointer'}
          onClick={signOutRequested}
        >
          <span className={'flex w-full items-center gap-x-2'}>
            <LogOut className={'h-4 w-4'} />

            <span>
              <Trans i18nKey={'auth.signOut'} />
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
