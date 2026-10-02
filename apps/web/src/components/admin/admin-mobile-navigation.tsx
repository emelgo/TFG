'use client';

/**
 * Menú de navegación móvil de la consola de administración: las mismas
 * entradas que la barra lateral (`admin-navigation.ts`), en un desplegable.
 * Cada área es un submenú (su disparador expone `aria-expanded`) con sus
 * tablas; detrás, las herramientas y «Todas las tablas». El desplegable
 * tiene altura máxima con desplazamiento.
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
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@pymekit/ui/dropdown-menu';
import { Trans } from '@pymekit/ui/trans';

import {
  ACCOUNTS_AREA_NAME,
  HOME_ENTRY,
  type NavigationEntry,
  useAdminNavigation,
} from './admin-navigation.ts';
import { getAreaKey, getTechnicalName } from './admin-sidebar-resources.tsx';

export function AdminMobileNavigation(props: { user: JWTUserData | null }) {
  const t = useTranslations('cms');
  const navigation = useAdminNavigation(props.user);
  const accounts = navigation.accountsManagement;

  const topEntries = [
    navigation.showHome ? HOME_ENTRY : null,
    accounts && !accounts.inArea ? accounts.entry : null,
  ].filter((entry) => entry !== null);

  const toolEntries = [
    ...navigation.tools,
    ...(navigation.allTables ? [navigation.allTables] : []),
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={t('sidebar.openMenu')}>
        <Menu className={'h-8 w-8'} />
      </DropdownMenuTrigger>

      <DropdownMenuContent className="max-h-[80vh] overflow-y-auto">
        {topEntries.length > 0 ? <MobileEntries entries={topEntries} /> : null}

        {navigation.areas.length > 0 ? (
          <DropdownMenuGroup aria-label={t('sidebar.areasLabel')}>
            {navigation.areas.map((area) => (
              <DropdownMenuSub key={getAreaKey(area.name)}>
                <DropdownMenuSubTrigger>
                  {area.name ?? <Trans i18nKey="cms.sidebar.otherArea" />}
                </DropdownMenuSubTrigger>

                <DropdownMenuSubContent className="max-h-[70vh] overflow-y-auto">
                  {area.name === ACCOUNTS_AREA_NAME && accounts?.inArea ? (
                    <MobileEntry entry={accounts.entry} />
                  ) : null}

                  {area.items.map((resource) => (
                    <DropdownMenuItem
                      key={`${resource.schemaName}.${resource.tableName}`}
                      render={
                        <Link
                          to="/admin/cms/resources/$schema/$table"
                          params={{
                            schema: resource.schemaName,
                            table: resource.tableName,
                          }}
                        >
                          {resource.displayName}

                          <span className="text-muted-foreground ml-auto font-mono text-xs">
                            {getTechnicalName(resource)}
                          </span>
                        </Link>
                      }
                    />
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          </DropdownMenuGroup>
        ) : null}

        {toolEntries.length > 0 ? (
          <>
            <DropdownMenuSeparator />

            <MobileEntries
              entries={toolEntries}
              label={t('sidebar.toolsLabel')}
            />
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileEntries(props: { entries: NavigationEntry[]; label?: string }) {
  return (
    <DropdownMenuGroup aria-label={props.label}>
      {props.entries.map((entry) => (
        <MobileEntry key={entry.id} entry={entry} />
      ))}
    </DropdownMenuGroup>
  );
}

function MobileEntry(props: { entry: NavigationEntry }) {
  return (
    <DropdownMenuItem
      render={
        <Link to={props.entry.path}>
          <Trans i18nKey={props.entry.labelKey} />
        </Link>
      }
    />
  );
}
