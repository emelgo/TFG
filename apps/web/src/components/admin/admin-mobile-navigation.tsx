'use client';

/**
 * Menú de navegación móvil de la consola de administración: las mismas
 * entradas que la barra lateral (`admin-navigation.ts`), en un desplegable.
 */
import { Link } from '@tanstack/react-router';
import { Menu } from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { JWTUserData } from '@pymekit/supabase/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@pymekit/ui/dropdown-menu';
import { Trans } from '@pymekit/ui/trans';

import {
  type NavigationEntry,
  PLATFORM_ENTRIES,
  useCmsNavigationEntries,
} from './admin-navigation.ts';

export function AdminMobileNavigation(props: { user: JWTUserData | null }) {
  const t = useTranslations('cms');
  const cmsEntries = useCmsNavigationEntries(props.user);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={t('sidebar.openMenu')}>
        <Menu className={'h-8 w-8'} />
      </DropdownMenuTrigger>

      <DropdownMenuContent>
        {props.user?.is_superadmin ? (
          <MobileGroup
            labelKey="cms.sidebar.platformGroup"
            entries={PLATFORM_ENTRIES}
          />
        ) : null}

        {props.user?.has_cms_access ? (
          <MobileGroup labelKey="cms.sidebar.cmsGroup" entries={cmsEntries} />
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileGroup(props: { labelKey: string; entries: NavigationEntry[] }) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>
        <Trans i18nKey={props.labelKey} />
      </DropdownMenuLabel>

      {props.entries.map((entry) => (
        <DropdownMenuItem
          key={entry.id}
          render={
            <Link to={entry.path}>
              <Trans i18nKey={entry.labelKey} />
            </Link>
          }
        />
      ))}
    </DropdownMenuGroup>
  );
}
