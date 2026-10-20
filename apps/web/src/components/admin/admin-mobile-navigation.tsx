'use client';

/**
 * Menú de navegación móvil de la consola de administración: las mismas
 * entradas que la barra lateral (`admin-navigation.ts`), en un desplegable
 * con los mismos dos bloques titulados:
 *
 *  - **Gestión**: Inicio, Gestión de cuentas y las herramientas del CMS.
 *  - **Datos**: cada área es un submenú (su disparador expone
 *    `aria-expanded`) con sus tablas y, al final, «Todas las tablas».
 *
 * Como en escritorio, solo llevan icono las entradas de primer nivel; las
 * tablas muestran su nombre visible y el técnico queda en el `title`. El
 * desplegable tiene altura máxima con desplazamiento.
 */
import { Link } from '@tanstack/react-router';
import { Folder, Menu } from 'lucide-react';
import { useTranslations } from 'use-intl';

import type { JWTUserData } from '@pymekit/supabase/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@pymekit/ui/dropdown-menu';
import { Trans } from '@pymekit/ui/trans';

import {
  type NavigationEntry,
  useAdminNavigation,
} from './admin-navigation.ts';
import { getAreaKey, getQualifiedName } from './admin-sidebar-resources.tsx';

export function AdminMobileNavigation(props: { user: JWTUserData | null }) {
  const t = useTranslations('cms');
  const navigation = useAdminNavigation(props.user);

  const hasManagement = navigation.management.length > 0;
  const hasData = navigation.areas.length > 0 || navigation.allTables;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={t('sidebar.openMenu')}>
        <Menu className={'h-8 w-8'} />
      </DropdownMenuTrigger>

      <DropdownMenuContent className="max-h-[80vh] overflow-y-auto">
        {hasManagement ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <Trans i18nKey="cms.sidebar.managementGroup" />
            </DropdownMenuLabel>

            {navigation.management.map((entry) => (
              <MobileEntry key={entry.id} entry={entry} />
            ))}
          </DropdownMenuGroup>
        ) : null}

        {hasManagement && hasData ? <DropdownMenuSeparator /> : null}

        {hasData ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <Trans i18nKey="cms.sidebar.dataGroup" />
            </DropdownMenuLabel>

            {navigation.areas.map((area) => (
              <DropdownMenuSub key={getAreaKey(area.name)}>
                <DropdownMenuSubTrigger>
                  <Folder className="h-4" />

                  {area.name ?? <Trans i18nKey="cms.sidebar.otherArea" />}
                </DropdownMenuSubTrigger>

                <DropdownMenuSubContent className="max-h-[70vh] overflow-y-auto">
                  {area.items.map((resource) => (
                    <DropdownMenuItem
                      key={getQualifiedName(resource)}
                      render={
                        <Link
                          to="/admin/cms/resources/$schema/$table"
                          params={{
                            schema: resource.schemaName,
                            table: resource.tableName,
                          }}
                          title={getQualifiedName(resource)}
                        >
                          {resource.displayName}
                        </Link>
                      }
                    />
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}

            {navigation.allTables ? (
              <MobileEntry entry={navigation.allTables} />
            ) : null}
          </DropdownMenuGroup>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Entrada de primer nivel del menú móvil, con su icono. */
function MobileEntry(props: { entry: NavigationEntry }) {
  return (
    <DropdownMenuItem
      render={
        <Link to={props.entry.path}>
          <props.entry.Icon className="h-4" />

          <Trans i18nKey={props.entry.labelKey} />
        </Link>
      }
    />
  );
}
